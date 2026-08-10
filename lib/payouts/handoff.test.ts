import { describe, expect, it, vi } from "vitest";

import { attemptPayoutForReceipt, type PayoutHandoffDeps } from "./handoff";
import { METRON_SETTLEMENT_WALLET } from "../celo/config";
import type { PayoutRow } from "../db/payouts";

const CREATOR = "0xAAe584e729edA3D3bb2Ecb3b6Fb8C1dc4A9e5F7B";

function makePayoutRow(overrides: Partial<PayoutRow> = {}): PayoutRow {
  return {
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
    ...overrides,
  };
}

type Earning = { id: string; amountMicroUsdc: number };

function makeDeps(overrides: {
  wallet?: string | null;
  earning?: Earning | null;
  reserved?: PayoutRow | null;
  broadcastResult?: Awaited<ReturnType<NonNullable<PayoutHandoffDeps["broadcast"]>>>;
  broadcastThrows?: Error;
} = {}) {
  const developerWallet = vi.fn(
    async () => (overrides.wallet === undefined ? CREATOR : overrides.wallet)
  );
  const getEarningByReceipt = vi.fn(
    async (): Promise<Earning | null> =>
      overrides.earning === undefined ? { id: "entry-1", amountMicroUsdc: 1000 } : overrides.earning
  );
  const reserveEarning = vi.fn(
    async (): Promise<PayoutRow | null> =>
      overrides.reserved === undefined ? makePayoutRow() : overrides.reserved
  );
  const broadcast = vi.fn(async (): Promise<Awaited<ReturnType<PayoutHandoffDeps["broadcast"]>>> => {
    if (overrides.broadcastThrows !== undefined) throw overrides.broadcastThrows;
    return overrides.broadcastResult ?? { kind: "confirmed" as const, txHash: "0xabc", attributionVerified: true };
  });
  const deps: PayoutHandoffDeps = {
    fromWallet: METRON_SETTLEMENT_WALLET,
    attributionTag: "celo_91fed90b97fc",
    developerWallet,
    getEarningByReceipt,
    reserveEarning,
    broadcast,
    now: () => new Date("2026-08-10T00:00:00.000Z"),
  };
  return { deps, developerWallet, getEarningByReceipt, reserveEarning, broadcast };
}

describe("attemptPayoutForReceipt", () => {
  it("sends the payout from the Metron wallet to the creator wallet (separate leg from x402)", async () => {
    const { deps, reserveEarning } = makeDeps();
    const result = await attemptPayoutForReceipt(
      { developerId: "dev-1", receiptId: "receipt-1", enabled: true },
      deps
    );
    expect(result.kind).toBe("attempted");
    const reservation = (reserveEarning.mock.calls[0] as unknown[] | undefined)?.[0] as unknown as {
      fromWallet: string;
      toWallet: string;
      attributionTag: string;
    };
    // Track 2: the registered Metron wallet pays the creator directly.
    expect(reservation.fromWallet).toBe(METRON_SETTLEMENT_WALLET);
    expect(reservation.toWallet).toBe(CREATOR);
    expect(reservation.fromWallet).not.toBe(CREATOR);
    expect(reservation.attributionTag).toBe("celo_91fed90b97fc");
  });

  it("targets the EXACT earning of the receipt (id + amount) and never sweeps", async () => {
    const { deps, getEarningByReceipt, reserveEarning, broadcast } = makeDeps({
      earning: { id: "entry-9", amountMicroUsdc: 777 },
    });
    await attemptPayoutForReceipt(
      { developerId: "dev-1", receiptId: "receipt-9", enabled: true },
      deps
    );
    expect(getEarningByReceipt).toHaveBeenCalledTimes(1);
    expect(getEarningByReceipt).toHaveBeenCalledWith("dev-1", "receipt-9");
    // Exactly one reservation of a single scalar ledger entry (no sweep list).
    expect(reserveEarning).toHaveBeenCalledTimes(1);
    const reservation = (reserveEarning.mock.calls[0] as unknown[] | undefined)?.[0] as unknown as {
      ledgerEntryId: unknown;
      amountMicroUsdc?: never;
    };
    expect(reservation.ledgerEntryId).toBe("entry-9");
    expect(Array.isArray(reservation.ledgerEntryId)).toBe(false);
    // The broadcasted payout is the single reserved row.
    expect(broadcast).toHaveBeenCalledTimes(1);
    const broadcasted = (broadcast.mock.calls[0] as unknown[] | undefined)?.[0] as unknown as {
      id: string;
      amountMicroUsdc: number;
    };
    expect(broadcasted.id).toBe("payout-1");
    expect(broadcasted.amountMicroUsdc).toBe(1000);
  });

  it("reports already_handled when the earning is already reserved (broadcast NOT called)", async () => {
    const { deps, broadcast } = makeDeps({ reserved: null });
    const result = await attemptPayoutForReceipt(
      { developerId: "dev-1", receiptId: "receipt-1", enabled: true },
      deps
    );
    expect(result).toEqual({ kind: "skipped", reason: "already_handled" });
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("maps a confirmed broadcast to CONFIRMED with tx hash + attribution evidence", async () => {
    const { deps } = makeDeps({
      broadcastResult: { kind: "confirmed" as const, txHash: "0xabc", attributionVerified: true },
    });
    const result = await attemptPayoutForReceipt(
      { developerId: "dev-1", receiptId: "receipt-1", enabled: true },
      deps
    );
    expect(result).toEqual({
      kind: "attempted",
      payoutId: "payout-1",
      status: "CONFIRMED",
      txHash: "0xabc",
      attributionVerified: true,
    });
  });

  it("maps a failed broadcast to FAILED with the reason", async () => {
    const { deps } = makeDeps({
      broadcastResult: { kind: "failed" as const, reason: "insufficient_usdc_balance" },
    });
    const result = await attemptPayoutForReceipt(
      { developerId: "dev-1", receiptId: "receipt-1", enabled: true },
      deps
    );
    expect(result).toEqual({
      kind: "attempted",
      payoutId: "payout-1",
      status: "FAILED",
      txHash: null,
      reason: "insufficient_usdc_balance",
    });
  });

  it("maps an ambiguous broadcast to SUBMITTED with the reason", async () => {
    const { deps } = makeDeps({
      broadcastResult: { kind: "ambiguous" as const, reason: "receipt_timeout" },
    });
    const result = await attemptPayoutForReceipt(
      { developerId: "dev-1", receiptId: "receipt-1", enabled: true },
      deps
    );
    expect(result).toEqual({
      kind: "attempted",
      payoutId: "payout-1",
      status: "SUBMITTED",
      txHash: null,
      reason: "receipt_timeout",
    });
  });

  it("skips with zero dep calls when disabled", async () => {
    const { deps, developerWallet, getEarningByReceipt, reserveEarning, broadcast } = makeDeps();
    const result = await attemptPayoutForReceipt(
      { developerId: "dev-1", receiptId: "receipt-1", enabled: false },
      deps
    );
    expect(result).toEqual({ kind: "skipped", reason: "disabled" });
    expect(developerWallet).not.toHaveBeenCalled();
    expect(getEarningByReceipt).not.toHaveBeenCalled();
    expect(reserveEarning).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("skips with no_destination when the creator wallet is unset", async () => {
    const { deps, getEarningByReceipt, reserveEarning, broadcast } = makeDeps({ wallet: null });
    const result = await attemptPayoutForReceipt(
      { developerId: "dev-1", receiptId: "receipt-1", enabled: true },
      deps
    );
    expect(result).toEqual({ kind: "skipped", reason: "no_destination" });
    expect(getEarningByReceipt).not.toHaveBeenCalled();
    expect(reserveEarning).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("skips with no_earning when the receipt has no ledger entry", async () => {
    const { deps, reserveEarning, broadcast } = makeDeps({ earning: null });
    const result = await attemptPayoutForReceipt(
      { developerId: "dev-1", receiptId: "receipt-1", enabled: true },
      deps
    );
    expect(result).toEqual({ kind: "skipped", reason: "no_earning" });
    expect(reserveEarning).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("never throws for any broadcast outcome", async () => {
    const outcomes: Awaited<ReturnType<PayoutHandoffDeps["broadcast"]>>[] = [
      { kind: "confirmed", txHash: "0x1", attributionVerified: false },
      { kind: "failed", reason: "preflight_failed" },
      { kind: "ambiguous", reason: "broadcast_hash_mismatch" },
    ];
    for (const outcome of outcomes) {
      const { deps } = makeDeps({ broadcastResult: outcome });
      const result = await attemptPayoutForReceipt(
        { developerId: "dev-1", receiptId: "receipt-1", enabled: true },
        deps
      );
      expect(result.kind).toBe("attempted");
    }
  });

  it("still never throws when the broadcast dep itself throws (reported UNKNOWN, not SUBMITTED)", async () => {
    const { deps } = makeDeps({ broadcastThrows: new Error("network down") });
    const result = await attemptPayoutForReceipt(
      { developerId: "dev-1", receiptId: "receipt-1", enabled: true },
      deps
    );
    expect(result).toEqual({
      kind: "attempted",
      payoutId: "payout-1",
      status: "UNKNOWN",
      txHash: null,
      reason: "network down",
    });
  });

  it("broadcasts exactly once across concurrent attempts on the same earning", async () => {
    const { deps, reserveEarning, broadcast } = makeDeps({ reserved: null });
    let calls = 0;
    reserveEarning.mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? makePayoutRow() : null;
    });

    const first = await attemptPayoutForReceipt(
      { developerId: "dev-1", receiptId: "receipt-1", enabled: true },
      deps
    );
    const second = await attemptPayoutForReceipt(
      { developerId: "dev-1", receiptId: "receipt-1", enabled: true },
      deps
    );

    expect(first.kind).toBe("attempted");
    expect(second).toEqual({ kind: "skipped", reason: "already_handled" });
    expect(reserveEarning).toHaveBeenCalledTimes(2);
    expect(broadcast).toHaveBeenCalledTimes(1);
  });
});
