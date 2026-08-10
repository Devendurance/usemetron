/**
 * M6 settlement orchestrator (injectable, testable).
 *
 * Runs ONLY after upstream 2xx. Uses the SAME PaymentPayload and
 * PaymentRequirements that were sent to /verify. The facilitator submits
 * the authorization onchain (the settlement wallet private key is never
 * involved). Settlement is gated by the X402_SETTLEMENT_ENABLED switch.
 */

import type { PaymentPayload, PaymentRequirements, SettleRequest, SettleResponse } from "../x402/types";

export type SettlementInput = {
  receiptId: string;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

export type SettlementResult =
  | {
      kind: "settled";
      transaction: string;
      network: string;
      settledAt: Date;
    }
  | { kind: "rejected"; reason: string; errorCode: string }
  | { kind: "ambiguous"; errorCode: string; status: number };

export type SettlementServiceDeps = {
  /** Real implementation: `settlePayment` from lib/x402/client (X-API-Key). */
  settle: (request: SettleRequest) => Promise<SettleResponse>;
  now?: () => Date;
};

export type SettlementService = ReturnType<typeof createSettlementService>;

export function createSettlementService(deps: SettlementServiceDeps) {
  const now = deps.now ?? (() => new Date());

  /**
   * Attempts settlement. Never retries internally (a retry could double
   * the onchain effect for POST resources).
   */
  async function settleVerifiedPayment(input: SettlementInput): Promise<SettlementResult> {
    const request: SettleRequest = {
      x402Version: input.paymentPayload.x402Version,
      paymentPayload: input.paymentPayload,
      paymentRequirements: input.paymentRequirements,
    };

    let response: SettleResponse;
    try {
      response = await deps.settle(request);
    } catch (error) {
      const err = error as { status?: unknown; body?: unknown };
      const status = typeof err.status === "number" ? err.status : 0;
      const body = err.body as { success?: unknown } | undefined;
      // Explicit facilitator rejection (4xx with success:false) is a
      // definite failure; anything else (transport/timeout/5xx) is
      // ambiguous — the onchain outcome may be unknown.
      if (status >= 400 && status < 500 && body?.success === false) {
        return { kind: "rejected", reason: "FACILITATOR_REJECTED", errorCode: "SETTLEMENT_FAILED" };
      }
      return {
        kind: "ambiguous",
        errorCode: "SETTLEMENT_UNKNOWN",
        status: status >= 500 ? 502 : status >= 400 ? 502 : 503,
      };
    }

    if (response.success !== true) {
      return {
        kind: "rejected",
        reason: response.errorReason ?? "SETTLEMENT_FAILED",
        errorCode: "SETTLEMENT_FAILED",
      };
    }
    // Require a real transaction identifier when the mechanism supplies
    // one — never fabricate.
    if (typeof response.transaction !== "string" || response.transaction === "") {
      return {
        kind: "rejected",
        reason: "MISSING_TRANSACTION",
        errorCode: "SETTLEMENT_FAILED",
      };
    }
    if (!response.transaction.startsWith("0x")) {
      return {
        kind: "rejected",
        reason: "INVALID_TRANSACTION",
        errorCode: "SETTLEMENT_FAILED",
      };
    }

    return {
      kind: "settled",
      transaction: response.transaction,
      network: response.network,
      settledAt: now(),
    };
  }

  return { settleVerifiedPayment };
}
