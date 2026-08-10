import { describe, expect, it } from "vitest";

import { earningAmountMicroUsdc, isEarningEligible } from "./eligibility";

const RECEIPT = {
  id: "receipt-1",
  developerId: "dev-1",
  routeId: "route-1",
  amountMicroUsdc: 1000,
};

describe("isEarningEligible", () => {
  it("only SETTLED receipts earn", () => {
    expect(isEarningEligible({ ...RECEIPT, paymentStatus: "SETTLED" })).toBe(true);
    for (const status of ["VERIFIED", "UPSTREAM_FAILED", "SETTLEMENT_FAILED", "SETTLEMENT_PENDING", "PAYMENT_REQUIRED"]) {
      expect(isEarningEligible({ ...RECEIPT, paymentStatus: status }), status).toBe(false);
    }
  });
});

describe("earningAmountMicroUsdc", () => {
  it("a 1000-micro settled call earns exactly 1000 (protocol fee = 0)", () => {
    expect(earningAmountMicroUsdc({ ...RECEIPT, paymentStatus: "SETTLED" })).toBe(1000);
  });

  it("never uses floats", () => {
    expect(Number.isInteger(earningAmountMicroUsdc({ ...RECEIPT, paymentStatus: "SETTLED" }))).toBe(true);
  });

  it("throws for non-SETTLED receipts", () => {
    expect(() =>
      earningAmountMicroUsdc({ ...RECEIPT, paymentStatus: "VERIFIED" })
    ).toThrow();
  });

  it("rejects invalid amounts", () => {
    expect(() =>
      earningAmountMicroUsdc({ ...RECEIPT, paymentStatus: "SETTLED", amountMicroUsdc: -1 })
    ).toThrow();
    expect(() =>
      earningAmountMicroUsdc({ ...RECEIPT, paymentStatus: "SETTLED", amountMicroUsdc: 1.5 })
    ).toThrow();
  });
});
