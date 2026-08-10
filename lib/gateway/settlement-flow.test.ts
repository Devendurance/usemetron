import { describe, expect, it, vi } from "vitest";

import { runSettlementAttempt, type SettlementFlowDeps } from "./settlement-flow";
import type { PaymentPayload, PaymentRequirements } from "../x402/types";

const REQUIREMENTS = {
  scheme: "exact",
  network: "eip155:42220",
  amount: "1000",
  asset: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  payTo: "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa",
  maxTimeoutSeconds: 3600,
  extra: { name: "USDC", version: "2" },
} as PaymentRequirements;

const PAYLOAD = {
  x402Version: 2,
  resource: { url: "http://localhost:3000/p/abc" },
  accepted: REQUIREMENTS,
  payload: { authorization: {} },
} as unknown as PaymentPayload;

const INPUT = {
  receiptId: "receipt-1",
  developerId: "dev-1",
  routeId: "route-1",
  amountMicroUsdc: 1000,
  paymentPayload: PAYLOAD,
  paymentRequirements: REQUIREMENTS,
};

type Mock = ReturnType<typeof vi.fn>;

function makeDeps(overrides: Partial<SettlementFlowDeps> = {}) {
  const markPending = overrides.markPending ?? vi.fn(async () => {});
  const classify = vi.fn(
    overrides.classify ??
      (async () => ({
        kind: "settled" as const,
        transaction: "0xabc",
        network: "eip155:42220",
        settledAt: new Date("2026-08-10T00:00:00.000Z"),
      }))
  );
  const applySettled = overrides.applySettled ?? vi.fn(async () => ({ earningCreated: true }));
  const markFailed = overrides.markFailed ?? vi.fn(async () => {});
  const markAmbiguous = overrides.markAmbiguous ?? vi.fn(async () => {});
  const deps: SettlementFlowDeps = {
    markPending,
    classify: classify as SettlementFlowDeps["classify"],
    applySettled,
    markFailed,
    markAmbiguous,
  };
  return { deps, markPending, classify, applySettled, markFailed, markAmbiguous } as unknown as {
    deps: SettlementFlowDeps;
    markPending: Mock;
    classify: Mock;
    applySettled: Mock;
    markFailed: Mock;
    markAmbiguous: Mock;
  };
}

describe("settlement flow — crash windows", () => {
  it("A: PENDING → /settle success → final tx → SETTLED + one earning", async () => {
    const { deps, markPending, applySettled } = makeDeps();
    const result = await runSettlementAttempt(INPUT, deps);

    expect(result).toMatchObject({ kind: "settled", earningCreated: true, transaction: "0xabc" });
    expect(markPending).toHaveBeenCalledWith("receipt-1");
    expect(applySettled).toHaveBeenCalledWith(
      expect.objectContaining({ receiptId: "receipt-1", x402TxHash: "0xabc", amountMicroUsdc: 1000 })
    );
  });

  it("B: PENDING → explicit failure → SETTLEMENT_FAILED, no earning", async () => {
    const { deps, applySettled, markFailed } = makeDeps({
      classify: async () => ({ kind: "rejected" as const, errorCode: "SETTLEMENT_FAILED" }),
    });
    const result = await runSettlementAttempt(INPUT, deps);

    expect(result).toEqual({ kind: "rejected", errorCode: "SETTLEMENT_FAILED" });
    expect(markFailed).toHaveBeenCalledWith("receipt-1", "SETTLEMENT_FAILED");
    expect(applySettled).not.toHaveBeenCalled();
  });

  it("C: PENDING → transport/timeout ambiguity → stays PENDING, no earning", async () => {
    const { deps, markAmbiguous, applySettled } = makeDeps({
      classify: async () => ({ kind: "ambiguous" as const, errorCode: "SETTLEMENT_UNKNOWN", status: 503 }),
    });
    const result = await runSettlementAttempt(INPUT, deps);

    expect(result).toEqual({ kind: "ambiguous", status: 503 });
    expect(markAmbiguous).toHaveBeenCalledWith("receipt-1", "SETTLEMENT_UNKNOWN");
    expect(applySettled).not.toHaveBeenCalled();
    expect(result.kind === "ambiguous" ? result.status : 0).toBe(503);
  });

  it("D: PENDING → success → final DB tx fails → durably pending, no fake failure", async () => {
    const { deps, applySettled, markFailed } = makeDeps({
      applySettled: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const result = await runSettlementAttempt(INPUT, deps);

    expect(result).toEqual({ kind: "persist_failed" });
    // The receipt was marked PENDING before /settle; no fake failure state.
    expect(markFailed).not.toHaveBeenCalled();
    expect(applySettled).toHaveBeenCalledTimes(1);
  });

  it("the durable PENDING mark always happens before /settle classification", async () => {
    const order: string[] = [];
    const { deps } = makeDeps();
    deps.markPending = vi.fn(async () => { order.push("pending"); });
    deps.classify = vi.fn(async () => { order.push("classify"); return { kind: "rejected" as const, errorCode: "SETTLEMENT_FAILED" }; });

    await runSettlementAttempt(INPUT, deps);

    expect(order[0]).toBe("pending");
    expect(order[1]).toBe("classify");
  });

  it("classify (the /settle step) is invoked exactly once even when it throws", async () => {
    const { deps, classify } = makeDeps({
      classify: async () => {
        throw new Error("transport");
      },
    });
    const result = await runSettlementAttempt(INPUT, deps);
    expect(result).toEqual({ kind: "ambiguous", status: 503 });
    expect(classify).toHaveBeenCalledTimes(1);
  });
});
