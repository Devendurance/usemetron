import { afterEach, describe, expect, it, vi } from "vitest";

// The route modules are server-only; neutralize the guard so the import
// graph loads under vitest. Every heavy dependency is replaced with a
// controllable fake: Redis limiter, DB repositories (routes, receipts,
// settlement-recovery), gateway service, upstream execution, settlement
// wiring, payouts, the x402 payload decoders, and the logger. The pure
// modules (env switches, client-ip, policy, payment-id, requirements,
// limits, @x402/core encoding) run for real so the route-level wiring
// under test is honest.
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  rateLimiterCheck: vi.fn(),
  getRouteBySlug: vi.fn(),
  processSignedRequest: vi.fn(),
  executeUpstream: vi.fn(),
  encryptionKey: vi.fn(),
  decodePaymentSignature: vi.fn(),
  extractPaymentIdentity: vi.fn(),
  markUpstreamResult: vi.fn(),
  markSettlementResult: vi.fn(),
  applySettledSettlement: vi.fn(),
  markSettlementPendingAttempt: vi.fn(),
  createSettlementService: vi.fn(() => ({ settleVerifiedPayment: vi.fn() })),
  runSettlementAttempt: vi.fn(),
  buildSettledDelivery: vi.fn(),
  settlePayment: vi.fn(),
  payoutAttempt: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("@/lib/ratelimit/redis-limiter", () => ({
  rateLimiter: { check: mocks.rateLimiterCheck },
}));
vi.mock("@/lib/db/routes", () => ({ getRouteBySlug: mocks.getRouteBySlug }));
vi.mock("@/lib/db/receipts", () => ({
  insertVerifiedReceipt: vi.fn(),
  getReceiptByPaymentIdentifier: vi.fn(),
  markUpstreamResult: mocks.markUpstreamResult,
  markSettlementResult: mocks.markSettlementResult,
  applySettledSettlement: mocks.applySettledSettlement,
}));
vi.mock("@/lib/db/settlement-recovery", () => ({
  markSettlementPendingAttempt: mocks.markSettlementPendingAttempt,
}));
vi.mock("@/lib/endpoints/gateway", () => ({
  gatewayService: { processSignedRequest: mocks.processSignedRequest },
}));
vi.mock("@/lib/gateway/instance", () => ({
  upstreamService: { executeUpstream: mocks.executeUpstream },
  encryptionKey: mocks.encryptionKey,
}));
vi.mock("@/lib/payouts/instance", () => ({
  payoutHandoff: { attemptPayoutForReceipt: mocks.payoutAttempt },
}));
vi.mock("@/lib/gateway/settlement-service", () => ({
  createSettlementService: mocks.createSettlementService,
}));
vi.mock("@/lib/gateway/settlement-flow", () => ({
  runSettlementAttempt: mocks.runSettlementAttempt,
}));
vi.mock("@/lib/gateway/delivery", () => ({
  buildSettledDelivery: mocks.buildSettledDelivery,
}));
vi.mock("@/lib/x402/client", () => ({ settlePayment: mocks.settlePayment }));
vi.mock("@/lib/x402/payload", () => ({
  decodePaymentSignature: mocks.decodePaymentSignature,
  extractPaymentIdentity: mocks.extractPaymentIdentity,
  authorizationDeadline: vi.fn(),
}));
vi.mock("@/lib/observability/logger", () => ({ logEvent: mocks.logEvent }));

import { GET, POST } from "./route";
import { paymentIdentifierFor, type PaymentIdentity } from "@/lib/x402/payment-id";

const ROUTE = {
  id: "route_1",
  developerId: "dev_1",
  slug: "demo",
  name: "Demo route",
  description: null,
  upstreamUrl: "https://upstream.example.com/resource",
  encryptedUpstreamAuth: null,
  priceMicroUsdc: 1000,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const SIGNATURE = "PAYMENT-SIGNATURE v1;0xdeadbeef";

/** Identity fed to the real paymentIdentifierFor derivation by the mocks. */
const IDENTITY: PaymentIdentity = {
  network: "eip155:42220",
  asset: "0xceba9300f2b030cc430c3b0e5772ff6630a5e4f9",
  payer: "0x1234567890abcdef1234567890abcdef12345678",
  nonceHex: "0x0000000000000000000000000000000000000000000000000000000000000001",
};

const PAYLOAD = { marker: "decoded-payload" };

function proxyContext(): { params: Promise<{ proxy: string[] }> } {
  return { params: Promise.resolve({ proxy: ["demo"] }) };
}

function signedRequest(): Request {
  return new Request("http://metron.test/p/demo", {
    method: "POST",
    headers: { "payment-signature": SIGNATURE },
  });
}

describe("GET/POST /p/[...proxy] (route-level)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("anonymous request under the limit gets 402 PAYMENT_REQUIRED", async () => {
    mocks.getRouteBySlug.mockResolvedValue(ROUTE);
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: false,
    });

    const response = await GET(new Request("http://metron.test/p/demo"), proxyContext());

    expect(response.status).toBe(402);
    expect(response.headers.get("payment-required")).not.toBeNull();
    const body = await response.json();
    expect(body.error).toBe("PAYMENT_REQUIRED");
    // Untrusted bucket by default (proxy-trust flag off).
    expect(mocks.rateLimiterCheck).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "gateway-anonymous", identifier: "untrusted" })
    );
    expect(mocks.processSignedRequest).not.toHaveBeenCalled();
  });

  it("anonymous request over the limit gets 429 RATE_LIMITED with retry-after", async () => {
    mocks.getRouteBySlug.mockResolvedValue(ROUTE);
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 60,
      degraded: false,
    });

    const response = await GET(new Request("http://metron.test/p/demo"), proxyContext());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    const body = await response.json();
    expect(body.error).toBe("RATE_LIMITED");
  });

  it("signed request over the limit gets 429 keyed by payment identifier", async () => {
    mocks.getRouteBySlug.mockResolvedValue(ROUTE);
    mocks.decodePaymentSignature.mockReturnValue(PAYLOAD);
    mocks.extractPaymentIdentity.mockReturnValue(IDENTITY);
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 60,
      degraded: false,
    });

    const response = await POST(signedRequest(), proxyContext());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    const body = await response.json();
    expect(body.error).toBe("RATE_LIMITED");
    // The signed bucket is keyed by the deterministic payment identifier
    // (real derivation), not the shared untrusted bucket.
    expect(mocks.rateLimiterCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "gateway-signed",
        identifier: paymentIdentifierFor(IDENTITY),
      })
    );
    expect(mocks.processSignedRequest).not.toHaveBeenCalled();
  });

  it("signed request allowed but replayed gets 409 PAYMENT_REPLAY", async () => {
    mocks.getRouteBySlug.mockResolvedValue(ROUTE);
    mocks.decodePaymentSignature.mockReturnValue(PAYLOAD);
    mocks.extractPaymentIdentity.mockReturnValue(IDENTITY);
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: false,
    });
    mocks.processSignedRequest.mockResolvedValue({ kind: "replay" });

    const response = await POST(signedRequest(), proxyContext());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("PAYMENT_REPLAY");
  });

  it("verified request with settlement disabled gets 501 SETTLEMENT_DISABLED — paid flow not stranded", async () => {
    mocks.getRouteBySlug.mockResolvedValue(ROUTE);
    mocks.decodePaymentSignature.mockReturnValue(PAYLOAD);
    mocks.extractPaymentIdentity.mockReturnValue(IDENTITY);
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: false,
    });
    mocks.processSignedRequest.mockResolvedValue({
      kind: "verified",
      receiptId: "receipt_1",
      payer: IDENTITY.payer,
      paymentIdentifier: paymentIdentifierFor(IDENTITY),
      paymentPayload: PAYLOAD,
      paymentRequirements: { scheme: "exact" },
    });
    mocks.executeUpstream.mockResolvedValue({
      kind: "success",
      status: 200,
      latencyMs: 12,
      responseBody: Buffer.from("protected bytes"),
      safeResponseHeaders: {},
    });

    const response = await POST(signedRequest(), proxyContext());

    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body.error).toBe("SETTLEMENT_DISABLED");
    expect(body.receiptId).toBe("receipt_1");
    // The verified path ran end-to-end through the limiter (allowed) and
    // reached the truthful 501 boundary — proof that abuse protection
    // never strands the paid flow. Money code never starts.
    expect(mocks.markUpstreamResult).toHaveBeenCalledWith(
      "receipt_1",
      expect.objectContaining({ paymentStatus: "VERIFIED" })
    );
    expect(mocks.runSettlementAttempt).not.toHaveBeenCalled();
    expect(mocks.settlePayment).not.toHaveBeenCalled();
    expect(mocks.payoutAttempt).not.toHaveBeenCalled();
  });
});
