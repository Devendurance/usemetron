import { describe, expect, it, vi } from "vitest";

import { requestPayout, type PayoutServiceDeps } from "./service";
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

function makeDeps(overrides: {
  wallet?: string | null;
  reserved?: PayoutRow[];
  broadcastResult?: Awaited<ReturnType<NonNullable<PayoutServiceDeps["broadcast"]>>>;
} = {}) {
  const developerWallet = vi.fn(async () => (overrides.wallet === undefined ? CREATOR : overrides.wallet));
  const reserve = vi.fn(async () => overrides.reserved ?? [makePayoutRow()]);
  const broadcast = vi.fn(async () => overrides.broadcastResult ?? { kind: "confirmed" as const, txHash: "0xabc", attributionVerified: true });
  const deps: PayoutServiceDeps = {
    fromWallet: METRON_SETTLEMENT_WALLET,
    attributionTag: "celo_91fed90b97fc",
    developerWallet,
    reserve,
    broadcast,
    now: () => new Date("2026-08-10T00:00:00.000Z"),
  };
  return { deps, developerWallet, reserve, broadcast };
}

describe("requestPayout", () => {
  it("derives the destination server-side (never from the client)", async () => {
    const { deps, reserve } = makeDeps();
    await requestPayout("dev-1", deps);
    const reservation = (reserve.mock.calls[0] as unknown[] | undefined)?.[0] as unknown as {
      toWallet: string;
      fromWallet: string;
      attributionTag: string;
    };
    expect(reservation.toWallet).toBe(CREATOR);
    expect(reservation.fromWallet).toBe(METRON_SETTLEMENT_WALLET);
    expect(reservation.attributionTag).toBe("celo_91fed90b97fc");
  });

  it("returns nothing_to_payout when no earnings are available", async () => {
    const { deps, broadcast } = makeDeps({ reserved: [] });
    const outcome = await requestPayout("dev-1", deps);
    expect(outcome.status).toBe("nothing_to_payout");
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("broadcasts each reserved payout and reports results", async () => {
    const { deps, broadcast } = makeDeps({
      reserved: [makePayoutRow({ id: "p1" }), makePayoutRow({ id: "p2" })],
    });
    const outcome = await requestPayout("dev-1", deps);
    expect(outcome.status).toBe("ok");
    expect(outcome.payouts).toHaveLength(2);
    expect(broadcast).toHaveBeenCalledTimes(2);
  });

  it("reports failed/ambiguous broadcasts truthfully", async () => {
    const { deps } = makeDeps({
      broadcastResult: { kind: "failed" as const, reason: "insufficient_usdc_balance" },
    });
    const outcome = await requestPayout("dev-1", deps);
    expect(outcome.payouts[0]?.status).toBe("FAILED");
  });

  it("throws when the developer wallet cannot be resolved", async () => {
    const { deps, reserve } = makeDeps({ wallet: null });
    await expect(requestPayout("dev-1", deps)).rejects.toThrow("developer wallet unavailable");
    expect(reserve).not.toHaveBeenCalled();
  });
});
