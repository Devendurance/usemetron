import { describe, expect, it } from "vitest";

import { computePayoutAccounting } from "./accounting";

const row = (status: string, txHash: string | null = null, amount = 1000) => ({
  status,
  txHash,
  amountMicroUsdc: amount,
});

describe("computePayoutAccounting", () => {
  it("counts only CONFIRMED payouts as paid", () => {
    expect(
      computePayoutAccounting([row("CONFIRMED", "0x1"), row("CONFIRMED", "0x2", 500)])
    ).toEqual({ paidMicroUsdc: 1500, reservedMicroUsdc: 0 });
  });

  it("reserves PENDING and SUBMITTED amounts", () => {
    expect(
      computePayoutAccounting([row("PENDING"), row("SUBMITTED", "0x1"), row("CONFIRMED", "0x2")])
    ).toEqual({ paidMicroUsdc: 1000, reservedMicroUsdc: 2000 });
  });

  it("a FAILED row WITHOUT a tx hash releases its reservation (pre-broadcast failure)", () => {
    expect(computePayoutAccounting([row("FAILED")])).toEqual({ paidMicroUsdc: 0, reservedMicroUsdc: 0 });
  });

  it("a FAILED row WITH a tx hash stays reserved until onchain reconciliation (M8.1)", () => {
    expect(computePayoutAccounting([row("FAILED", "0xdddacd")])).toEqual({
      paidMicroUsdc: 0,
      reservedMicroUsdc: 1000,
    });
  });

  it("repairing FAILED-with-hash → CONFIRMED moves the amount from reserved to paid exactly once", () => {
    const before = computePayoutAccounting([row("FAILED", "0xdddacd")]);
    expect(before).toEqual({ paidMicroUsdc: 0, reservedMicroUsdc: 1000 });

    const after = computePayoutAccounting([row("CONFIRMED", "0xdddacd")]);
    expect(after).toEqual({ paidMicroUsdc: 1000, reservedMicroUsdc: 0 });

    // A rerun cannot double-count.
    expect(computePayoutAccounting([row("CONFIRMED", "0xdddacd")])).toEqual(after);
  });

  it("outstanding/available cannot contradict reservation state", () => {
    const earned = 1000;
    const accounting = computePayoutAccounting([row("FAILED", "0xdddacd")]);
    // outstanding = earned - paid; available = earned - paid - reserved.
    expect(earned - accounting.paidMicroUsdc - accounting.reservedMicroUsdc).toBe(0);
    expect(earned - accounting.paidMicroUsdc - accounting.reservedMicroUsdc).toBeGreaterThanOrEqual(0);
  });
});
