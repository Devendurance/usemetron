/**
 * Crash-safe payout broadcast (M8).
 *
 * Ordering: preflight → build+sign transaction → DERIVE tx hash →
 * durably persist SUBMITTED + tx hash (checkpoint BEFORE broadcast) →
 * broadcast signed raw transaction → wait for receipt → classify.
 *
 * If the process crashes anywhere after signing, the persisted tx hash
 * makes the possibly-broadcast payout discoverable and it is never blindly
 * sent again (recovery inspects the persisted hash onchain).
 */

import { keccak256 } from "viem";

import { CELO_CHAIN_ID, METRON_SETTLEMENT_WALLET, USDC_ADDRESS } from "../celo/config";
import { buildPayoutCalldata, preflightPayout } from "./execution";
import { assessPayoutConfirmation } from "./evidence";
import type { PayoutRow } from "../db/payouts";

export type PayoutBroadcastResult =
  | { kind: "confirmed"; txHash: string; attributionVerified: boolean }
  | { kind: "failed"; reason: string }
  | { kind: "ambiguous"; reason: string };

export type PayoutBroadcastDeps = {
  markSubmitted(payoutId: string, data: { txHash: string; submittedAt: Date }): Promise<void>;
  markFailed(payoutId: string, error: string): Promise<void>;
  finalize(payoutId: string, confirmedAt: Date): Promise<void>;
  signerAddress: `0x${string}` | null;
  getUsdcBalance(): Promise<bigint | null>;
  getCeloBalance(): Promise<bigint | null>;
  estimateGas(to: `0x${string}`, data: `0x${string}`): Promise<bigint>;
  feeData(): Promise<{ gasPrice: bigint } | { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  getNonce(): Promise<number>;
  signTransaction(tx: Record<string, unknown>): Promise<`0x${string}`>;
  broadcast(signedRaw: `0x${string}`): Promise<`0x${string}`>;
  waitForReceipt(
    txHash: `0x${string}`,
    timeoutMs: number
  ): Promise<{
    status: "success" | "reverted" | "unknown";
    transfers: Array<{ from: string; to: string; value: bigint }>;
    txTo: string | null;
  }>;
  getTransactionInput(txHash: `0x${string}`): Promise<`0x${string}` | null>;
  now(): Date;
};

/** Time to wait for a payout receipt after broadcast. */
export const PAYOUT_RECEIPT_TIMEOUT_MS = 90_000;

export async function broadcastPayout(
  payout: PayoutRow,
  deps: PayoutBroadcastDeps
): Promise<PayoutBroadcastResult> {
  const amount = BigInt(payout.amountMicroUsdc);
  const to = payout.toWallet as `0x${string}`;

  // 1. Preflight (no signing or broadcast when it cannot succeed).
  const [usdcBalance, celoBalance] = await Promise.all([
    deps.getUsdcBalance(),
    deps.getCeloBalance(),
  ]);
  const preflight = preflightPayout({
    signerAddress: deps.signerAddress,
    to,
    amountMicroUsdc: payout.amountMicroUsdc,
    usdcBalance,
    celoBalance,
  });
  if (!preflight.ok) {
    await deps.markFailed(payout.id, preflight.reasons.join(","));
    return { kind: "failed", reason: preflight.reasons.join(",") };
  }

  // 2. Build + sign the USDC transfer with the attribution suffix.
  const { data } = buildPayoutCalldata({ to, amountMicroUsdc: amount });
  const [nonce, gas, feeData] = await Promise.all([
    deps.getNonce(),
    deps.estimateGas(USDC_ADDRESS as `0x${string}`, data),
    deps.feeData(),
  ]);
  const transaction = {
    chainId: CELO_CHAIN_ID,
    to: USDC_ADDRESS as `0x${string}`,
    value: BigInt(0),
    data,
    nonce,
    gas,
    ...feeData,
  };
  const signedRaw = await deps.signTransaction(transaction);
  // Deterministic pre-broadcast hash: keccak of the exact serialized
  // signed transaction being broadcast (persisted as the crash-safe
  // checkpoint before the network sees it).
  const txHash = keccak256(signedRaw);

  // 3. Durable checkpoint BEFORE broadcast: crash here leaves a
  //    discoverable SUBMITTED payout that recovery inspects onchain.
  await deps.markSubmitted(payout.id, { txHash, submittedAt: deps.now() });

  // 4. Broadcast exactly once.
  let broadcastHash: `0x${string}`;
  try {
    broadcastHash = await deps.broadcast(signedRaw);
  } catch (error) {
    // The signed tx may or may not have reached the network. The persisted
    // SUBMITTED + hash keeps it discoverable; never blind-resend.
    const reason = error instanceof Error ? error.message.slice(0, 300) : "broadcast_error";
    return { kind: "ambiguous", reason };
  }
  if (broadcastHash !== txHash) {
    // Hash mismatch is treated as ambiguous (the persisted hash is what
    // recovery will inspect).
    return { kind: "ambiguous", reason: "broadcast_hash_mismatch" };
  }

  // 5. Wait for confirmation.
  const receipt = await deps.waitForReceipt(txHash, PAYOUT_RECEIPT_TIMEOUT_MS);
  if (receipt.status === "unknown") {
    return { kind: "ambiguous", reason: "receipt_timeout" };
  }

  const txInput = await deps.getTransactionInput(txHash);
  const assessment = assessPayoutConfirmation({
    txStatus: receipt.status,
    txTo: receipt.txTo,
    transfers: receipt.transfers,
    txInput,
    expected: {
      payer: deps.signerAddress ?? (METRON_SETTLEMENT_WALLET as `0x${string}`),
      to,
      amountMicroUsdc: amount,
      attributionTag: payout.attributionTag ?? "",
    },
  });

  if (assessment.status === "confirmed") {
    await deps.finalize(payout.id, deps.now());
    return {
      kind: "confirmed",
      txHash,
      attributionVerified: assessment.attributionVerified,
    };
  }

  await deps.markFailed(payout.id, assessment.reason);
  return { kind: "failed", reason: assessment.reason };
}
