import { describe, expect, it, vi } from "vitest";

import { decodePaymentResponseHeader } from "@x402/core/http";

import { buildPaymentRequirements } from "../x402/requirements";
import { createSettlementService, type SettlementServiceDeps } from "./settlement-service";
import { buildSettledDelivery } from "./delivery";
import { isSettlementEnabled } from "../env";
import type { PaymentPayload, SettleRequest, SettleResponse } from "../x402/types";

const REQUIREMENTS = buildPaymentRequirements({
  priceMicroUsdc: 5000,
  resourceUrl: "http://localhost:3000/p/abc123",
});

const PAYLOAD: PaymentPayload = {
  x402Version: 2,
  resource: { url: "http://localhost:3000/p/abc123" },
  accepted: REQUIREMENTS,
  payload: {
    authorization: {
      from: "0xAaE584e729EDa3D3bB2eCb3b6Fb8C1dC4a9E5f7B",
      to: "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa",
      value: "5000",
      validAfter: "0",
      validBefore: "9999999999",
      nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
    },
  },
};

type Mock = ReturnType<typeof vi.fn>;

function makeSettle(overrides: Partial<SettlementServiceDeps> = {}) {
  const settle =
    (overrides.settle as Mock | undefined) ??
    vi.fn(async (): Promise<SettleResponse> => ({
      success: true,
      transaction: "0xabc123def456",
      network: "eip155:42220",
    }));
  const service = createSettlementService({ settle: settle as SettlementServiceDeps["settle"] });
  return { service, settle: settle as Mock };
}

const INPUT = { receiptId: "receipt-1", paymentPayload: PAYLOAD, paymentRequirements: REQUIREMENTS };

describe("settlement service — success and failure", () => {
  it("settles with the SAME payload+requirements used for verify", async () => {
    const { service, settle } = makeSettle();
    const result = await service.settleVerifiedPayment(INPUT);

    expect(result.kind).toBe("settled");
    if (result.kind === "settled") {
      expect(result.transaction).toBe("0xabc123def456");
      expect(result.network).toBe("eip155:42220");
      expect(result.settledAt).toBeInstanceOf(Date);
    }
    const [request] = settle.mock.calls[0] as [SettleRequest];
    expect(request.x402Version).toBe(2);
    expect(request.paymentPayload).toBe(PAYLOAD);
    expect(request.paymentRequirements).toBe(REQUIREMENTS);
  });

  it("rejects when the facilitator reports explicit failure", async () => {
    const { service } = makeSettle({
      settle: vi.fn(async (): Promise<SettleResponse> => ({
        success: false,
        errorReason: "out_of_credits",
        transaction: "",
        network: "eip155:42220" as `${string}:${string}`,
      })),
    });
    const result = await service.settleVerifiedPayment(INPUT);
    expect(result).toMatchObject({ kind: "rejected", errorCode: "SETTLEMENT_FAILED" });
  });

  it("rejects a 4xx facilitator response carrying success:false", async () => {
    const rejection = Object.assign(new Error("rejected"), {
      status: 402,
      body: { success: false, errorReason: "out_of_credits" },
    });
    const { service } = makeSettle({ settle: vi.fn(async () => { throw rejection; }) });
    const result = await service.settleVerifiedPayment(INPUT);
    expect(result.kind).toBe("rejected");
  });

  it("treats transport/5xx outcomes as ambiguous, never definitely unpaid", async () => {
    for (const error of [
      Object.assign(new Error("timeout"), { status: 0 }),
      Object.assign(new Error("boom"), { status: 500 }),
    ]) {
      const { service } = makeSettle({ settle: vi.fn(async () => { throw error; }) });
      const result = await service.settleVerifiedPayment(INPUT);
      expect(result.kind).toBe("ambiguous");
      if (result.kind === "ambiguous") {
        expect(result.errorCode).toBe("SETTLEMENT_UNKNOWN");
      }
    }
  });

  it("refuses to fabricate a transaction hash", async () => {
    for (const transaction of ["", "not-a-hash"]) {
      const { service } = makeSettle({
        settle: vi.fn(async (): Promise<SettleResponse> => ({
          success: true,
          transaction,
          network: "eip155:42220" as `${string}:${string}`,
        })),
      });
      const result = await service.settleVerifiedPayment(INPUT);
      expect(result.kind).toBe("rejected");
    }
  });

  it("never retries settlement automatically", async () => {
    const settle = vi.fn(async () => {
      throw Object.assign(new Error("boom"), { status: 500 });
    });
    const { service } = makeSettle({ settle });
    await service.settleVerifiedPayment(INPUT);
    expect(settle).toHaveBeenCalledTimes(1);
  });
});

describe("settlement switch", () => {
  it("is disabled by default and for any non-true value", () => {
    expect(isSettlementEnabled({})).toBe(false);
    expect(isSettlementEnabled({ X402_SETTLEMENT_ENABLED: "false" })).toBe(false);
    expect(isSettlementEnabled({ X402_SETTLEMENT_ENABLED: "0" })).toBe(false);
    expect(isSettlementEnabled({ X402_SETTLEMENT_ENABLED: "yes" })).toBe(false);
  });

  it("enables only for explicit true/1", () => {
    expect(isSettlementEnabled({ X402_SETTLEMENT_ENABLED: "true" })).toBe(true);
    expect(isSettlementEnabled({ X402_SETTLEMENT_ENABLED: "TRUE" })).toBe(true);
    expect(isSettlementEnabled({ X402_SETTLEMENT_ENABLED: "1" })).toBe(true);
  });
});

describe("settled delivery", () => {
  const DELIVERY_INPUT = {
    upstreamStatus: 200,
    upstreamBody: Buffer.from('{"data":"protected"}'),
    safeResponseHeaders: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "set-cookie": "session=evil",
      "x-internal-token": "secret",
    },
    transaction: "0xabc123def456",
    network: "eip155:42220",
  };

  it("returns the exact bounded upstream body with the upstream status", () => {
    const delivery = buildSettledDelivery(DELIVERY_INPUT);
    expect(delivery.status).toBe(200);
    expect(Buffer.from(delivery.body as Uint8Array).toString()).toBe('{"data":"protected"}');
  });

  it("preserves safe headers and strips unsafe ones", () => {
    const delivery = buildSettledDelivery(DELIVERY_INPUT);
    expect(delivery.headers["content-type"]).toBe("application/json");
    expect(delivery.headers["cache-control"]).toBe("no-store");
    expect(delivery.headers["set-cookie"]).toBeUndefined();
    expect(delivery.headers["x-internal-token"]).toBeUndefined();
  });

  it("always includes a PAYMENT-RESPONSE decodable by the official decoder", () => {
    const delivery = buildSettledDelivery(DELIVERY_INPUT);
    const header = delivery.headers["payment-response"];
    expect(header).toBeDefined();
    const decoded = decodePaymentResponseHeader(header!);
    expect(decoded.success).toBe(true);
    expect(decoded.transaction).toBe("0xabc123def456");
    expect(decoded.network).toBe("eip155:42220");
  });
});

describe("payouts switch", () => {
  it("is disabled by default and enables only for explicit true/1", async () => {
    const { isPayoutsEnabled } = await import("../env");
    expect(isPayoutsEnabled({})).toBe(false);
    expect(isPayoutsEnabled({ PAYOUTS_ENABLED: "false" })).toBe(false);
    expect(isPayoutsEnabled({ PAYOUTS_ENABLED: "0" })).toBe(false);
    expect(isPayoutsEnabled({ PAYOUTS_ENABLED: "true" })).toBe(true);
    expect(isPayoutsEnabled({ PAYOUTS_ENABLED: "TRUE" })).toBe(true);
    expect(isPayoutsEnabled({ PAYOUTS_ENABLED: "1" })).toBe(true);
  });
});
