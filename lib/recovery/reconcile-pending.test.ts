import { describe, expect, it, vi } from "vitest";

import { resolvePendingSettlements, type ResolvePendingDeps } from "./reconcile-pending";
import type { EvidenceAssessment } from "./evidence";

const BASE_RECEIPT = {
  id: "pending-1",
  developerId: "dev-1",
  routeId: "route-1",
  amountMicroUsdc: 1000,
  asset: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
  network: "eip155:42220",
  payTo: "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa",
  meta: {
    payer: "0xaa",
    nonceHex: "0x0000000000000000000000000000000000000000000000000000000000000001",
    validBefore: Math.floor(Date.now() / 1000) + 3600,
  },
};


function makeDeps(overrides: {
  pending?: typeof BASE_RECEIPT[];
  evidence?: EvidenceAssessment;
  evidenceError?: Error;
  applyResult?: { earningCreated: boolean };
} = {}) {
  const listPending = vi.fn(async () => overrides.pending ?? [BASE_RECEIPT]);
  const resolveEvidence = vi.fn(async () =>
    overrides.evidenceError
      ? Promise.reject(overrides.evidenceError)
      : (overrides.evidence ?? { status: "settled" as const, transactionHash: "0xsettle" })
  );
  const applySettled = vi.fn(async () => overrides.applyResult ?? { earningCreated: true });
  const markFailed = vi.fn(async () => {});
  const deps = {
    listPending,
    resolveEvidence,
    applySettled,
    markFailed,
  } as unknown as ResolvePendingDeps;
  return { deps, listPending, resolveEvidence, applySettled, markFailed };
}

describe("resolvePendingSettlements", () => {
  it("authoritative evidence → idempotent SETTLED + one earning", async () => {
    const { deps, resolveEvidence, applySettled } = makeDeps();
    const report = await resolvePendingSettlements(deps);

    expect(report.scanned).toBe(1);
    expect(report.outcomes[0]).toMatchObject({
      status: "settled",
      receiptId: "pending-1",
      txHash: "0xsettle",
      earningCreated: true,
    });
    expect(resolveEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        payer: "0xaa",
        nonceHex: BASE_RECEIPT.meta.nonceHex,
        to: BASE_RECEIPT.payTo,
        valueMicroUsdc: BigInt(1000),
      })
    );
    expect(applySettled).toHaveBeenCalledWith(
      expect.objectContaining({ receiptId: "pending-1", x402TxHash: "0xsettle", amountMicroUsdc: 1000 })
    );
  });

  it("conflicting authorization (same nonce, wrong to/value) → stays pending, no earning", async () => {
    const { deps, applySettled, markFailed } = makeDeps({
      evidence: { status: "conflict", reason: "transfer_parameters_mismatch" },
    });
    const report = await resolvePendingSettlements(deps);

    expect(report.outcomes[0]).toMatchObject({
      status: "still_pending",
      reason: "conflicting_authorization:transfer_parameters_mismatch",
    });
    expect(applySettled).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("rerun after settlement → zero pending → zero duplicates", async () => {
    const { deps } = makeDeps({ pending: [] });
    const report = await resolvePendingSettlements(deps);
    expect(report.scanned).toBe(0);
    expect(report.outcomes).toHaveLength(0);
  });

  it("no evidence within validity → stays pending", async () => {
    const { deps, applySettled, markFailed } = makeDeps({ evidence: { status: "not_found" } });
    const report = await resolvePendingSettlements(deps);
    expect(report.outcomes[0]).toMatchObject({ status: "still_pending", reason: "within_validity" });
    expect(applySettled).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("RPC unavailable → stays pending", async () => {
    const { deps, applySettled, markFailed } = makeDeps({ evidenceError: new Error("rpc down") });
    const report = await resolvePendingSettlements(deps);
    expect(report.outcomes[0]).toMatchObject({ status: "still_pending", reason: "evidence_unavailable" });
    expect(applySettled).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("proves failure only when the authorization expired unused", async () => {
    const { deps, markFailed } = makeDeps({
      evidence: { status: "not_found" },
      pending: [
        {
          ...BASE_RECEIPT,
          meta: { ...BASE_RECEIPT.meta, validBefore: Math.floor(Date.now() / 1000) - 60 },
        },
      ],
    });
    const report = await resolvePendingSettlements(deps);
    expect(report.outcomes[0]).toMatchObject({ status: "proven_failed" });
    expect(markFailed).toHaveBeenCalledWith("pending-1");
  });

  it("an already-existing earning (retry) is not duplicated", async () => {
    const { deps } = makeDeps({ applyResult: { earningCreated: false } });
    const report = await resolvePendingSettlements(deps);
    expect(report.outcomes[0]).toMatchObject({ status: "settled", earningCreated: false });
  });
});
