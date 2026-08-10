import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import { broadcastPayout, type PayoutBroadcastDeps } from "./broadcast";
import { buildPayoutCalldata } from "./execution";
import { METRON_SETTLEMENT_WALLET, USDC_ADDRESS } from "../celo/config";
import type { PayoutRow } from "../db/payouts";

const CREATOR = "0xAAe584e729edA3D3bb2Ecb3b6Fb8C1dc4A9e5F7B";
const TEST_SIGNER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

const PAYOUT: PayoutRow = {
  id: "payout-1",
  developerId: "dev-1",
  callReceiptId: "receipt-1",
  ledgerEntryId: "entry-1",
  fromWallet: METRON_SETTLEMENT_WALLET,
  toWallet: CREATOR,
  amountMicroUsdc: 1000,
  status: "PENDING",
  attributionTag: "celo_91fed90b97fc",
  txHash: null,
  attemptCount: 0,
  lastError: null,
  createdAt: new Date(),
  submittedAt: null,
  confirmedAt: null,
};

type Mock = ReturnType<typeof vi.fn>;

function makeDeps(overrides: Partial<PayoutBroadcastDeps> = {}) {
  const markSubmitted = overrides.markSubmitted ?? vi.fn(async () => {});
  const markFailed = overrides.markFailed ?? vi.fn(async () => {});
  const finalize = overrides.finalize ?? vi.fn(async () => {});
  const { data } = buildPayoutCalldata({ to: CREATOR, amountMicroUsdc: BigInt(1000) });
  const broadcast = vi.fn(
    overrides.broadcast ??
      (async (signedRaw: `0x${string}`) => {
        // The tx hash is keccak of the serialized signed transaction.
        const { keccak256 } = await import("viem");
        return keccak256(signedRaw) as `0x${string}`;
      })
  );
  const deps: PayoutBroadcastDeps = {
    markSubmitted,
    markFailed,
    finalize,
    signerAddress: METRON_SETTLEMENT_WALLET,
    getUsdcBalance: overrides.getUsdcBalance ?? (async () => BigInt(1000)),
    getCeloBalance: overrides.getCeloBalance ?? (async () => BigInt(1)),
    estimateGas: overrides.estimateGas ?? (async () => BigInt(60000)),
    feeData: overrides.feeData ?? (async () => ({ gasPrice: BigInt(5_000_000_000) })),
    getNonce: overrides.getNonce ?? (async () => 7),
    signTransaction:
      overrides.signTransaction ??
      (async (tx: Record<string, unknown>) => {
        const signed = await TEST_SIGNER.signTransaction(tx as never);
        return signed as `0x${string}`;
      }),
    broadcast,
    waitForReceipt: overrides.waitForReceipt ?? (async () => ({
      status: "success" as const,
      transfers: [{ from: METRON_SETTLEMENT_WALLET, to: CREATOR, value: BigInt(1000) }],
      txTo: USDC_ADDRESS,
    })),
    getTransactionInput: overrides.getTransactionInput ?? (async () => data),
    now: overrides.now ?? (() => new Date("2026-08-10T00:00:00.000Z")),
  };
  return { deps, markSubmitted, markFailed, finalize, broadcast } as unknown as {
    deps: PayoutBroadcastDeps;
    markSubmitted: Mock;
    markFailed: Mock;
    finalize: Mock;
    broadcast: Mock;
  };
}

describe("broadcastPayout", () => {
  it("fails before signing when preflight rejects", async () => {
    const { deps, markFailed } = makeDeps({ getUsdcBalance: async () => BigInt(0) });
    const result = await broadcastPayout(PAYOUT, deps);
    expect(result.kind).toBe("failed");
    expect(markFailed).toHaveBeenCalled();
  });

  it("persists SUBMITTED + tx hash BEFORE broadcast (crash-safe ordering)", async () => {
    const order: string[] = [];
    const { deps, broadcast } = makeDeps();
    deps.markSubmitted = vi.fn(async () => { order.push("submitted"); });
    deps.broadcast = vi.fn(async () => {
      order.push("broadcast");
      return (`0x${"ab".repeat(32)}`) as `0x${string}`;
    });

    await broadcastPayout(PAYOUT, deps);

    expect(order).toEqual(["submitted", "broadcast"]);
    const submittedSpy = deps.markSubmitted as Mock;
    const [, data] = submittedSpy.mock.calls[0] as [string, { txHash: string }];
    expect(data.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("confirms with a matching receipt and finalizes", async () => {
    const { deps, finalize } = makeDeps();
    const result = await broadcastPayout(PAYOUT, deps);
    expect(result.kind).toBe("confirmed");
    if (result.kind === "confirmed") expect(result.attributionVerified).toBe(true);
    expect(finalize).toHaveBeenCalled();
  });

  it("marks FAILED on a reverted receipt", async () => {
    const { deps, markFailed, finalize } = makeDeps({
      waitForReceipt: async () => ({ status: "reverted" as const, transfers: [], txTo: null }),
    });
    const result = await broadcastPayout(PAYOUT, deps);
    expect(result.kind).toBe("failed");
    expect(markFailed).toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("leaves SUBMITTED (reserved) on an ambiguous receipt timeout — no resend", async () => {
    const { deps, markFailed, finalize } = makeDeps({
      waitForReceipt: async () => ({ status: "unknown" as const, transfers: [], txTo: null }),
    });
    const result = await broadcastPayout(PAYOUT, deps);
    expect(result.kind).toBe("ambiguous");
    expect(markFailed).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("treats a broadcast failure as ambiguous (never blind-resend)", async () => {
    const { deps, markSubmitted } = makeDeps({
      broadcast: async () => {
        throw new Error("connection reset");
      },
    });
    const result = await broadcastPayout(PAYOUT, deps);
    expect(result.kind).toBe("ambiguous");
    // The SUBMITTED checkpoint still exists with the derived hash.
    expect(markSubmitted).toHaveBeenCalled();
    expect(deps.broadcast).toHaveBeenCalledTimes(1);
  });
});
