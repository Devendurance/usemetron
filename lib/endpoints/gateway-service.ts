/**
 * M4 gateway verification orchestration (injectable, testable).
 *
 * Signed-request pipeline:
 *   decode PAYMENT-SIGNATURE (official V2)
 *   → rebuild server-authoritative requirements from the real route
 *   → validate the payload binds to this route (policy + resource)
 *   → real Celo facilitator POST /verify
 *   → replay reservation (Redis SET NX + Postgres UNIQUE)
 *   → durable VERIFIED receipt (exactly once)
 *
 * No upstream execution. No /settle. No funds move.
 */

import { CELO_NETWORK, METRON_SETTLEMENT_WALLET, USDC_ADDRESS, X402_SCHEME } from "../celo/config";
import type { PaymentPayload, PaymentRequirements, VerifyRequest, VerifyResponse } from "../x402/types";
import {
  authorizationDeadline,
  decodePaymentSignature,
  extractPaymentIdentity,
  validatePayloadAgainstRequirements,
} from "../x402/payload";
import { paymentIdentifierFor, type PaymentIdentity } from "../x402/payment-id";

export type VerifiedRouteContext = {
  id: string;
  developerId: string;
  slug: string;
  priceMicroUsdc: number;
  isActive: boolean;
};

export type GatewayServiceDeps = {
  /** Real implementation: `verifyPayment` from lib/x402/client (facilitator POST /verify). */
  verify: (request: VerifyRequest) => Promise<VerifyResponse>;
  replayLock: {
    acquire(identifier: string, ttlSeconds: number): Promise<boolean>;
    release(identifier: string): Promise<void>;
  };
  receipts: {
    insertVerified(data: {
      routeId: string;
      developerId: string;
      callerWallet: string | null;
      paymentIdentifier: string;
      amountMicroUsdc: number;
      asset: string;
      network: string;
      scheme: string;
      payTo: string;
      verifiedAt: Date;
    }): Promise<{ id: string } | null>;
    /**
     * Durable replay precheck: any existing receipt for the deterministic
     * payment identifier (VERIFIED/UPSTREAM_FAILED/SETTLEMENT_FAILED/
     * SETTLEMENT_PENDING/SETTLED) means the authorization is already known
     * and must be rejected before another facilitator request.
     */
    findByPaymentIdentifier(identifier: string): Promise<{ id: string } | null>;
  };
  now?: () => Date;
};

export type SignedRequestResult =
  | {
      kind: "verified";
      receiptId: string;
      payer: string | null;
      paymentIdentifier: string;
      /** The exact payload+requirements used for /verify — reused for /settle. */
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    }
  | { kind: "invalid"; reason: string }
  | { kind: "replay" }
  | { kind: "verification_unavailable"; status: number };

const MIN_LOCK_TTL_SECONDS = 600;
const MAX_LOCK_TTL_SECONDS = 86_400;
const DEFAULT_LOCK_TTL_SECONDS = 3_600;

export type GatewayService = ReturnType<typeof createGatewayService>;

export function createGatewayService(deps: GatewayServiceDeps) {
  const now = deps.now ?? (() => new Date());

  function serverRequirements(route: VerifiedRouteContext): PaymentRequirements {
    return {
      scheme: X402_SCHEME,
      network: CELO_NETWORK,
      amount: String(route.priceMicroUsdc),
      asset: USDC_ADDRESS,
      payTo: METRON_SETTLEMENT_WALLET,
      maxTimeoutSeconds: 3600,
      extra: { name: "USDC", version: "2" },
    };
  }

  function lockTtlSeconds(deadline: number | null): number {
    if (deadline === null || !Number.isFinite(deadline)) {
      return DEFAULT_LOCK_TTL_SECONDS;
    }
    const remaining = Math.floor(deadline - now().getTime() / 1000);
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return DEFAULT_LOCK_TTL_SECONDS;
    }
    return Math.min(MAX_LOCK_TTL_SECONDS, Math.max(MIN_LOCK_TTL_SECONDS, remaining));
  }

  function payerFrom(payload: PaymentPayload): string | null {
    const identity = extractPaymentIdentity(payload);
    return identity.payer ?? null;
  }

  /**
   * Processes a signed retry. Returns a discriminated result; the route
   * handler maps it to an HTTP response. Never throws for client-caused
   * conditions; facilitator transport failures surface as
   * `verification_unavailable`.
   */
  async function processSignedRequest(input: {
    route: VerifiedRouteContext;
    resourceUrl: string;
    signatureHeader: string;
  }): Promise<SignedRequestResult> {
    const { route, resourceUrl, signatureHeader } = input;

    // 1. Decode the official V2 payload.
    let payload: PaymentPayload;
    try {
      payload = decodePaymentSignature(signatureHeader);
    } catch {
      return { kind: "invalid", reason: "MALFORMED_PAYMENT_SIGNATURE" };
    }

    // 2. Server-authoritative requirements from the real route.
    const requirements = serverRequirements(route);

    // 3. The payload must bind to THIS route's policy and resource.
    const issues = validatePayloadAgainstRequirements(
      payload,
      requirements,
      resourceUrl
    );
    if (issues.length > 0) {
      return { kind: "invalid", reason: `PAYMENT_POLICY_MISMATCH:${issues.join(",")}` };
    }

    // 4. Deterministic identifier (derived before /verify so a known
    //    authorization is rejected locally without another facilitator
    //    request).
    const identity: PaymentIdentity = extractPaymentIdentity(payload);
    const identifier = paymentIdentifierFor(identity);

    // 4.5. Replay PRECHECK against durable Postgres. Any existing receipt
    //      for this identifier — in ANY payment state — means the
    //      authorization is already known (e.g. it already settled). The
    //      precheck is read-only: the existing receipt is never mutated
    //      and its payment outcome is never revealed. Redis locks are not
    //      relied on here because they expire; Postgres is authoritative.
    const existingReceipt = await deps.receipts.findByPaymentIdentifier(identifier);
    if (existingReceipt !== null) {
      return { kind: "replay" };
    }

    // 5. Real facilitator verification (verification only — never settle).
    let verifyResponse: VerifyResponse;
    try {
      verifyResponse = await deps.verify({
        x402Version: payload.x402Version,
        paymentPayload: payload,
        paymentRequirements: requirements,
      });
    } catch (error) {
      const err = error as { status?: unknown; body?: unknown };
      const status = typeof err.status === "number" ? err.status : 0;
      const body = err.body as { isValid?: unknown } | undefined;
      // The facilitator reports verification failures with a 4xx status
      // carrying `isValid: false`; that is a rejection, not an outage.
      if (status >= 400 && status < 500 && body?.isValid === false) {
        return { kind: "invalid", reason: "FACILITATOR_REJECTED" };
      }
      return { kind: "verification_unavailable", status };
    }
    if (verifyResponse.isValid !== true) {
      return { kind: "invalid", reason: "FACILITATOR_REJECTED" };
    }

    // 6. Atomic replay reservation (Redis SET NX) — first-use concurrency.
    const ttl = lockTtlSeconds(authorizationDeadline(payload));
    const locked = await deps.replayLock.acquire(identifier, ttl);
    if (!locked) {
      return { kind: "replay" };
    }

    // 7. Durable receipt — exactly once (DB UNIQUE is the second defense).
    const receipt = await deps.receipts.insertVerified({
      routeId: route.id,
      developerId: route.developerId,
      callerWallet: payerFrom(payload),
      paymentIdentifier: identifier,
      amountMicroUsdc: route.priceMicroUsdc,
      asset: USDC_ADDRESS,
      network: CELO_NETWORK,
      scheme: X402_SCHEME,
      payTo: METRON_SETTLEMENT_WALLET,
      verifiedAt: now(),
    });

    if (receipt === null) {
      // A concurrent request won the durable insert — this is a replay.
      // Release our reservation so the lock does not linger as an orphan.
      await deps.replayLock.release(identifier);
      return { kind: "replay" };
    }

    return {
      kind: "verified",
      receiptId: receipt.id,
      payer: payerFrom(payload),
      paymentIdentifier: identifier,
      paymentPayload: payload,
      paymentRequirements: requirements,
    };
  }

  return { processSignedRequest, serverRequirements };
}
