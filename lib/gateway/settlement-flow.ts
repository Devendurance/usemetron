/**
 * Settlement attempt pipeline (M7.1 crash-window hardening).
 *
 * Ordering: durable SETTLEMENT_PENDING → /settle exactly once → classify.
 * A failure of the FINAL persistence transaction leaves the receipt in the
 * durable pending state so recovery tooling can establish the onchain
 * outcome without ever guessing or double-charging.
 */

import type { PaymentPayload, PaymentRequirements } from "../x402/types";

export type SettlementFlowDeps = {
  /** Durable pre-settle state (receipt → SETTLEMENT_PENDING + attempt meta). */
  markPending(receiptId: string): Promise<void>;
  /** Performs the real /settle call exactly once and classifies the result. */
  classify: (input: {
    receiptId: string;
    paymentPayload: PaymentPayload;
    paymentRequirements: PaymentRequirements;
  }) => Promise<
    | { kind: "settled"; transaction: string; network: string; settledAt: Date }
    | { kind: "rejected"; errorCode: string }
    | { kind: "ambiguous"; errorCode: string; status: number }
  >;
  /** Atomic SETTLED + exactly one EARNING. */
  applySettled(data: {
    receiptId: string;
    developerId: string;
    routeId: string;
    amountMicroUsdc: number;
    x402TxHash: string;
    settledAt: Date;
  }): Promise<{ earningCreated: boolean }>;
  markFailed(receiptId: string, errorCode: string): Promise<void>;
  /** Durable error_code update for ambiguous outcomes. */
  markAmbiguous(receiptId: string, errorCode: string): Promise<void>;
};

export type SettlementFlowResult =
  | { kind: "settled"; earningCreated: boolean; transaction: string; network: string }
  | { kind: "rejected"; errorCode: string }
  | { kind: "ambiguous"; status: number }
  | { kind: "persist_failed" };

export async function runSettlementAttempt(input: {
  receiptId: string;
  developerId: string;
  routeId: string;
  amountMicroUsdc: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}, deps: SettlementFlowDeps): Promise<SettlementFlowResult> {
  // 1. Durable pre-settlement state — crash-safe checkpoint BEFORE /settle.
  await deps.markPending(input.receiptId);

  // 2. Call /settle exactly once.
  let classified: Awaited<ReturnType<SettlementFlowDeps["classify"]>>;
  try {
    classified = await deps.classify({
      receiptId: input.receiptId,
      paymentPayload: input.paymentPayload,
      paymentRequirements: input.paymentRequirements,
    });
  } catch {
    // Transport error surfaced by classify itself; treat as ambiguous.
    return { kind: "ambiguous", status: 503 };
  }

  if (classified.kind === "rejected") {
    await deps.markFailed(input.receiptId, classified.errorCode);
    return { kind: "rejected", errorCode: classified.errorCode };
  }

  if (classified.kind === "ambiguous") {
    await deps.markAmbiguous(input.receiptId, classified.errorCode);
    return { kind: "ambiguous", status: classified.status };
  }

  // 3. Confirmed success → atomic SETTLED + EARNING.
  let applied: { earningCreated: boolean };
  try {
    applied = await deps.applySettled({
      receiptId: input.receiptId,
      developerId: input.developerId,
      routeId: input.routeId,
      amountMicroUsdc: input.amountMicroUsdc,
      x402TxHash: classified.transaction,
      settledAt: classified.settledAt,
    });
  } catch {
    // Final persistence failed: the receipt remains durably
    // SETTLEMENT_PENDING (step 1) and recovery will reconcile it.
    return { kind: "persist_failed" };
  }

  return {
    kind: "settled",
    earningCreated: applied.earningCreated,
    transaction: classified.transaction,
    network: classified.network,
  };
}
