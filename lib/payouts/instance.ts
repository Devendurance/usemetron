/**
 * Production payout wiring (server-only).
 *
 * Wires the lazy payout signer (METRON_SETTLEMENT_PRIVATE_KEY — never
 * exposed; its address must equal the registered Metron wallet), the Celo
 * public client, and the crash-safe broadcast flow.
 */

import "server-only";

import { createPublicClient, http, type Address, type Hex } from "viem";
import { celo } from "viem/chains";

import { createPayoutSigner } from "../wallet/settlement-wallet";
import { getServerEnv } from "../env/server";
import {
  finalizePayoutConfirmed,
  getDeveloperWallet,
  listNonFinalPayouts,
  markPayoutFailed,
  markPayoutSubmitted,
  reserveEarningForPayout,
  reserveOutstandingEarnings,
  type PayoutRow,
} from "../db/payouts";
import { getEarningByReceipt } from "../db/ledger";
import { logEvent } from "../observability/logger";
import { METRON_ATTRIBUTION_TAG, METRON_SETTLEMENT_WALLET, USDC_ADDRESS } from "../celo/config";
import { acquirePayoutWalletLock, releasePayoutWalletLock } from "../redis/locks";
import { broadcastPayout, type PayoutBroadcastDeps, type PayoutBroadcastResult } from "./broadcast";
import { attemptPayoutForReceipt, type PayoutHandoffResult } from "./handoff";
import { withPayoutWalletLock } from "./wallet-lock";
import { reconcilePayouts, type PayoutReceiptEvidence } from "./reconcile";
import { requestPayout, type PayoutRequestOutcome } from "./service";

function publicClient() {
  const rpcUrl = getServerEnv().CELO_RPC_URL ?? "https://forno.celo.org";
  return createPublicClient({ chain: celo, transport: http(rpcUrl) });
}

function parseTransferLogs(receipt: {
  logs: Array<{ address: string; topics: Hex[]; data: Hex }>;
}): Array<{ from: string; to: string; value: bigint }> {
  return receipt.logs
    .filter((log) => (log.address as string).toLowerCase() === USDC_ADDRESS.toLowerCase())
    .map((log) => {
      const topics = log.topics;
      const data = log.data;
      const from = topics[1] ? `0x${topics[1].slice(26)}` : "";
      const to = topics[2] ? `0x${topics[2].slice(26)}` : "";
      const value = data === "0x" ? BigInt(0) : BigInt(data);
      return { from, to, value };
    });
}

async function fetchPayoutReceiptEvidence(txHash: string): Promise<PayoutReceiptEvidence> {
  const client = publicClient();
  const hash = txHash as Hex;
  const receipt = await client.getTransactionReceipt({ hash });
  if (receipt === null) {
    return { status: "unknown", txTo: null, transfers: [], txInput: null };
  }
  let txTo: string | null = null;
  let txInput: `0x${string}` | null = null;
  try {
    const tx = await client.getTransaction({ hash });
    txTo = (tx.to as string | null) ?? null;
    txInput = tx.input as Hex;
  } catch {
    // Input unavailable; event evidence still applies.
  }
  return {
    status: receipt.status === "success" ? "success" : "reverted",
    txTo,
    transfers: parseTransferLogs(receipt),
    txInput,
  };
}

/**
 * How long the per-wallet payout lock is held. Covers the full
 * nonce-fetch → sign → broadcast → receipt-wait window (~90s receipt
 * timeout plus preflight), so a concurrent submission cannot interleave
 * and nonce-collide. The TTL is also the backstop if a process dies
 * holding the lock.
 */
const PAYOUT_WALLET_LOCK_TTL_SECONDS = 120;

/**
 * Serializes the whole submit sequence (preflight → getNonce → sign →
 * broadcast → receipt wait) per settlement wallet. Fail-open: if the
 * lock cannot be acquired (contended or Redis unavailable) the broadcast
 * still runs with the lock degraded — payout submission is never
 * stranded. Uncontended behavior is a pure passthrough. Lock degradation
 * is observable via `payout_lock_degraded` (scope-only, no wallet
 * identity in logs).
 */
function lockedBroadcast(payout: PayoutRow): Promise<PayoutBroadcastResult> {
  return withPayoutWalletLock(
    { wallet: METRON_SETTLEMENT_WALLET, ttlSeconds: PAYOUT_WALLET_LOCK_TTL_SECONDS },
    { acquire: acquirePayoutWalletLock, release: releasePayoutWalletLock },
    () => broadcastPayout(payout, buildBroadcastDeps())
  ).then((outcome) => {
    if (!outcome.locked) {
      // The broadcast ran without the per-wallet lock (degraded, by
      // design). Logged scope-only: the settlement wallet is a public
      // address but logs must stay secret-free.
      logEvent("payout_lock_degraded", { scope: "payout" });
    }
    return outcome.result;
  });
}

function buildBroadcastDeps(): PayoutBroadcastDeps {
  const signer = createPayoutSigner();
  const signerAddress = signer?.address ?? null;
  const client = publicClient();

  return {
    markSubmitted: markPayoutSubmitted,
    markFailed: markPayoutFailed,
    finalize: finalizePayoutConfirmed,
    signerAddress,
    getUsdcBalance: async () => {
      if (signerAddress === null) return null;
      try {
        return await client.readContract({
          address: USDC_ADDRESS as Address,
          abi: [
            {
              type: "function",
              name: "balanceOf",
              stateMutability: "view",
              inputs: [{ name: "account", type: "address" }],
              outputs: [{ type: "uint256" }],
            },
          ],
          functionName: "balanceOf",
          args: [signerAddress as Address],
        });
      } catch {
        return null;
      }
    },
    getCeloBalance: async () => {
      if (signerAddress === null) return null;
      try {
        return await client.getBalance({ address: signerAddress as Address });
      } catch {
        return null;
      }
    },
    estimateGas: async (to, data) => {
      if (signerAddress === null) throw new Error("no signer");
      return client.estimateGas({ to, data, account: signerAddress as Address });
    },
    feeData: async () => ({ gasPrice: await client.getGasPrice() }),
    getNonce: async () => {
      if (signerAddress === null) throw new Error("no signer");
      return client.getTransactionCount({ address: signerAddress as Address, blockTag: "pending" });
    },
    signTransaction: async (tx) => {
      if (signer === null) throw new Error("no signer");
      // The viem Account union marks signTransaction as possibly absent;
      // the payout signer is always a local private-key account.
      const localSigner = signer as { signTransaction(t: Record<string, unknown>): Promise<Hex> };
      return localSigner.signTransaction(tx);
    },
    broadcast: async (signedRaw) => client.sendRawTransaction({ serializedTransaction: signedRaw }),
    waitForReceipt: async (txHash, timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        try {
          const receipt = await client.getTransactionReceipt({ hash: txHash });
          if (receipt !== null) {
            let txTo: string | null = null;
            try {
              const tx = await client.getTransaction({ hash: txHash });
              txTo = (tx.to as string | null) ?? null;
            } catch {
              txTo = null;
            }
            return {
              status: receipt.status === "success" ? "success" : "reverted",
              transfers: parseTransferLogs(receipt),
              txTo,
            };
          }
        } catch {
          // Not found yet; keep polling.
        }
        if (Date.now() > deadline) {
          return { status: "unknown", transfers: [], txTo: null };
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    },
    getTransactionInput: async (txHash) => {
      try {
        const tx = await client.getTransaction({ hash: txHash });
        return tx.input as Hex;
      } catch {
        return null;
      }
    },
    now: () => new Date(),
  };
}

const globalForPayouts = globalThis as unknown as {
  metronPayoutRequest?: (developerId: string) => Promise<PayoutRequestOutcome>;
  metronPayoutRecovery?: () => ReturnType<typeof reconcilePayouts>;
  metronPayoutHandoff?: (developerId: string, receiptId: string, enabled: boolean) => Promise<PayoutHandoffResult>;
};

/** Shared payout request service (hot-reload safe). */
export const payoutService: { requestPayout: (developerId: string) => Promise<PayoutRequestOutcome> } = {
  requestPayout:
    globalForPayouts.metronPayoutRequest ??
    (globalForPayouts.metronPayoutRequest = (developerId) =>
      requestPayout(developerId, {
        fromWallet: METRON_SETTLEMENT_WALLET,
        attributionTag: METRON_ATTRIBUTION_TAG,
        developerWallet: getDeveloperWallet,
        reserve: reserveOutstandingEarnings,
        broadcast: (payout) => lockedBroadcast(payout),
        now: () => new Date(),
      })),
};

/** Payout recovery service. */
export const payoutRecovery: () => ReturnType<typeof reconcilePayouts> =
  globalForPayouts.metronPayoutRecovery ??
  (globalForPayouts.metronPayoutRecovery = () =>
    reconcilePayouts({
      listNonFinal: listNonFinalPayouts,
      fetchReceipt: fetchPayoutReceiptEvidence,
      finalize: finalizePayoutConfirmed,
      markFailed: markPayoutFailed,
      now: () => new Date(),
    }));

/**
 * Exact-earning payout handoff for one receipt (hot-reload safe).
 * Wired to the exact-earning reserve (never sweeps) and the crash-safe
 * broadcast pipeline. The recipient wallet is derived server-side; the
 * payout leg pays from the registered Metron wallet.
 */
export const payoutHandoff: {
  attemptPayoutForReceipt(developerId: string, receiptId: string, enabled: boolean): Promise<PayoutHandoffResult>;
} = {
  attemptPayoutForReceipt:
    globalForPayouts.metronPayoutHandoff ??
    (globalForPayouts.metronPayoutHandoff = (developerId, receiptId, enabled) =>
      attemptPayoutForReceipt(
        { developerId, receiptId, enabled },
        {
          fromWallet: METRON_SETTLEMENT_WALLET,
          attributionTag: METRON_ATTRIBUTION_TAG,
          developerWallet: getDeveloperWallet,
          getEarningByReceipt,
          reserveEarning: reserveEarningForPayout,
          broadcast: (payout) => lockedBroadcast(payout),
          now: () => new Date(),
        }
      )),
};
