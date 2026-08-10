/**
 * Metron x402 gateway — M3 challenge, M4 verification, M5 upstream execution.
 *
 * Pipeline: unpaid → 402 + PAYMENT-REQUIRED; signed → decode → server
 * requirements → real /verify → replay protection → VERIFIED receipt →
 * safe upstream execution → result persisted. Settlement and protected
 * resource delivery arrive in M6; M5 withholds the upstream body behind a
 * truthful 501.
 */

import { encodePaymentRequiredHeader } from "@x402/core/http";
import { randomBytes } from "node:crypto";

import { getRouteBySlug } from "@/lib/db/routes";
import { applySettledSettlement, markSettlementResult, markUpstreamResult } from "@/lib/db/receipts";
import { buildPaymentRequired } from "@/lib/x402/requirements";
import { gatewayService } from "@/lib/endpoints/gateway";
import { upstreamService, encryptionKey } from "@/lib/gateway/instance";
import {
  MAX_CALLER_BODY_BYTES,
} from "@/lib/gateway/limits";
import { createSettlementService } from "@/lib/gateway/settlement-service";
import { runSettlementAttempt } from "@/lib/gateway/settlement-flow";
import { buildSettledDelivery } from "@/lib/gateway/delivery";
import { markSettlementPendingAttempt } from "@/lib/db/settlement-recovery";
import {
  decodePaymentSignature,
  extractPaymentIdentity,
  authorizationDeadline,
} from "@/lib/x402/payload";
import { paymentIdentifierFor } from "@/lib/x402/payment-id";
import { settlePayment } from "@/lib/x402/client";
import { isPayoutsEnabled, isRateLimitProxyTrusted, isSettlementEnabled } from "@/lib/env";
import { payoutHandoff } from "@/lib/payouts/instance";
import { resolveClientIdentifier } from "@/lib/ratelimit/client-ip";
import { rateLimiter } from "@/lib/ratelimit/redis-limiter";
import { RATE_LIMIT_POLICIES, scopeLabel } from "@/lib/ratelimit/policy";
import { logEvent } from "@/lib/observability/logger";

type ProxyContext = { params: Promise<{ proxy: string[] }> };

const ALLOW = "GET, POST";

const NOT_FOUND_BODY = JSON.stringify({ error: "ENDPOINT_NOT_FOUND" });
const REQUIRED_BODY = JSON.stringify({
  error: "PAYMENT_REQUIRED",
  message: "Payment is required to access this endpoint.",
});
const INVALID_SIGNATURE_BODY = JSON.stringify({
  error: "INVALID_PAYMENT_SIGNATURE",
});
const REPLAY_BODY = JSON.stringify({ error: "PAYMENT_REPLAY" });
const VERIFICATION_UNAVAILABLE_BODY = JSON.stringify({
  error: "PAYMENT_VERIFICATION_UNAVAILABLE",
});
const REQUEST_TOO_LARGE_BODY = JSON.stringify({
  error: "REQUEST_TOO_LARGE",
  message: "Request body exceeds the 1 MiB limit.",
});

/** Machine-readable 429 body; retryAfterSeconds tells the client when to retry. */
function rateLimitedBody(retryAfterSeconds: number): string {
  return JSON.stringify({
    error: "RATE_LIMITED",
    message: "Too many requests. Try again later.",
    retryAfterSeconds,
  });
}

function rateLimitedResponse(retryAfterSeconds: number): Response {
  return new Response(rateLimitedBody(retryAfterSeconds), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfterSeconds),
    },
  });
}

/**
 * Best-effort payment identifier derived from a raw PAYMENT-SIGNATURE
 * header, using the same pure derivation as the gateway service (so the
 * rate-limit bucket matches the replay-lock identity). Returns null when
 * the payload cannot be decoded; callers then fall back to the IP
 * identifier — the Redis replay lock still serializes per-payment.
 */
function paymentIdentifierFromSignature(signatureHeader: string): string | null {
  try {
    const payload = decodePaymentSignature(signatureHeader);
    return paymentIdentifierFor(extractPaymentIdentity(payload));
  } catch {
    return null;
  }
}

function methodNotAllowed() {  return new Response(null, {
    status: 405,
    headers: { Allow: ALLOW },
  });
}

/**
 * Maps a handoff payout status onto its truthful PRD §23 stage name.
 * UNKNOWN is never called "failed": the reservation stands and recovery
 * reconciles it, so it gets its own honest stage.
 */
function payoutStageFor(status: "CONFIRMED" | "FAILED" | "SUBMITTED" | "UNKNOWN"): string {
  switch (status) {
    case "CONFIRMED":
      return "payout_confirmed";
    case "FAILED":
      return "payout_failed";
    case "SUBMITTED":
      return "payout_submitted";
    case "UNKNOWN":
      return "payout_unknown";
  }
}

const settlementService = createSettlementService({ settle: settlePayment });

/** Reads the caller body bounded at 1 MiB; null for GET/HEAD. */
async function readCallerBody(
  request: Request,
  method: string
): Promise<{ body: Buffer | null; tooLarge: boolean }> {
  if (method === "GET") return { body: null, tooLarge: false };

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > MAX_CALLER_BODY_BYTES) {
      return { body: null, tooLarge: true };
    }
  }

  if (request.body === null) return { body: null, tooLarge: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_CALLER_BODY_BYTES) {
      await reader.cancel();
      return { body: null, tooLarge: true };
    }
    chunks.push(value);
  }
  return { body: Buffer.concat(chunks.map((c) => Buffer.from(c))), tooLarge: false };
}

async function handleResourceRequest(
  request: Request,
  context: ProxyContext
): Promise<Response> {
  const requestId = randomBytes(8).toString("hex");
  const { proxy } = await context.params;
  const slug = proxy[0];

  if (typeof slug !== "string" || slug === "") {
    return new Response(NOT_FOUND_BODY, {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const route = await getRouteBySlug(slug);
  if (route === null || !route.isActive) {
    return new Response(NOT_FOUND_BODY, {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const resourceUrl = new URL(request.url).toString();

  const paymentRequired = buildPaymentRequired({
    priceMicroUsdc: route.priceMicroUsdc,
    resourceUrl,
  });
  const encodedRequirement = encodePaymentRequiredHeader(paymentRequired);

  // M11: client identifier for rate limiting — X-Forwarded-For is only
  // consulted when the deployment proxy-trust flag is explicitly enabled.
  const ipIdentifier = resolveClientIdentifier(request, isRateLimitProxyTrusted());

  const signatureHeader = request.headers.get("payment-signature");

  if (signatureHeader !== null && signatureHeader !== "") {
    // M11: signed gateway attempts are limited by payment identifier when
    // the payload parses (same identity as the replay lock), falling back
    // to the IP identifier otherwise. Applies BEFORE processing; when
    // allowed, replay 409 / verification / settlement semantics are
    // untouched. Fail-open (degraded) never strands a paid request.
    const signedVerdict = await rateLimiter.check({
      ...RATE_LIMIT_POLICIES.gatewaySigned,
      identifier: paymentIdentifierFromSignature(signatureHeader) ?? ipIdentifier,
    });

    if (signedVerdict.degraded) {
      // Observable fail-open: logged here, never inside the limiter.
      logEvent("rate_limit_degraded", {
        requestId,
        scope: scopeLabel("gatewaySigned"),
      });
    }

    if (!signedVerdict.allowed) {
      return rateLimitedResponse(signedVerdict.retryAfterSeconds);
    }

    const result = await gatewayService.processSignedRequest({
      route: {
        id: route.id,
        developerId: route.developerId,
        slug: route.slug,
        priceMicroUsdc: route.priceMicroUsdc,
        isActive: route.isActive,
      },
      resourceUrl,
      signatureHeader,
    });

    if (result.kind === "verified") {
      // ---- M5: safe upstream execution after VERIFIED receipt ----
      logEvent("payment_verified", {
        requestId,
        receiptId: result.receiptId,
        paymentIdentifier: result.paymentIdentifier,
        routeId: route.id,
        developerId: route.developerId,
      });

      const callerSegments = proxy.slice(1).map((segment) => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      });
      const { body, tooLarge } = await readCallerBody(request, request.method);
      if (tooLarge) {
        logEvent("upstream_skipped_body_too_large", {
          requestId,
          receiptId: result.receiptId,
          routeId: route.id,
          developerId: route.developerId,
        });
        return new Response(REQUEST_TOO_LARGE_BODY, {
          status: 413,
          headers: { "content-type": "application/json" },
        });
      }

      const callerHeaders = Array.from(request.headers.entries());
      logEvent("upstream_started", {
        requestId,
        receiptId: result.receiptId,
        paymentIdentifier: result.paymentIdentifier,
        routeId: route.id,
        developerId: route.developerId,
        method: request.method,
      });

      const execution = await upstreamService.executeUpstream({
        route: {
          id: route.id,
          developerId: route.developerId,
          slug: route.slug,
          upstreamUrl: route.upstreamUrl,
          encryptedUpstreamAuth: route.encryptedUpstreamAuth,
        },
        encryptionKey: encryptionKey(),
        method: request.method === "POST" ? "POST" : "GET",
        callerPathSegments: callerSegments,
        callerQuery: new URL(request.url).searchParams,
        callerHeaders,
        body,
      });

      if (execution.kind === "request_rejected") {
        logEvent("upstream_failed", {
          requestId,
          receiptId: result.receiptId,
          paymentIdentifier: result.paymentIdentifier,
          routeId: route.id,
          developerId: route.developerId,
          errorCode: execution.errorCode,
        });
        await markUpstreamResult(result.receiptId, {
          paymentStatus: "UPSTREAM_FAILED",
          upstreamStatusCode: null,
          upstreamLatencyMs: null,
          errorCode: execution.errorCode,
        });
        return new Response(
          JSON.stringify({ error: "UPSTREAM_FAILED", code: execution.errorCode }),
          {
            status: 502,
            headers: { "content-type": "application/json" },
          }
        );
      }

      if (execution.kind === "failed") {
        logEvent("upstream_failed", {
          requestId,
          receiptId: result.receiptId,
          paymentIdentifier: result.paymentIdentifier,
          routeId: route.id,
          developerId: route.developerId,
          errorCode: execution.errorCode,
          status: execution.status ?? 0,
          latencyMs: execution.latencyMs,
        });
        await markUpstreamResult(result.receiptId, {
          paymentStatus: "UPSTREAM_FAILED",
          upstreamStatusCode: execution.status,
          upstreamLatencyMs: execution.latencyMs,
          errorCode: execution.errorCode,
        });
        // No /settle. No earnings. Truthful gateway failure.
        return new Response(
          JSON.stringify({
            error: "UPSTREAM_FAILED",
            code: execution.errorCode,
            ...(execution.status !== null ? { upstreamStatusCode: execution.status } : {}),
          }),
          {
            status: 502,
            headers: { "content-type": "application/json" },
          }
        );
      }

      // 2xx upstream work: persist status + latency; payment remains
      // VERIFIED (unsettled) until settlement.
      logEvent("upstream_succeeded", {
        requestId,
        receiptId: result.receiptId,
        paymentIdentifier: result.paymentIdentifier,
        routeId: route.id,
        developerId: route.developerId,
        status: execution.status,
        latencyMs: execution.latencyMs,
      });
      await markUpstreamResult(result.receiptId, {
        paymentStatus: "VERIFIED",
        upstreamStatusCode: execution.status,
        upstreamLatencyMs: execution.latencyMs,
        errorCode: null,
      });

      // ---- M6/M7.1: settlement (money switch gated) ----
      if (!isSettlementEnabled()) {
        logEvent("settlement_disabled", {
          requestId,
          receiptId: result.receiptId,
          routeId: route.id,
          developerId: route.developerId,
        });
        return new Response(
          JSON.stringify({
            error: "SETTLEMENT_DISABLED",
            message:
              "Upstream execution succeeded. Settlement is currently disabled; the payment has NOT been settled and the resource is withheld.",
            receiptId: result.receiptId,
          }),
          {
            status: 501,
            headers: {
              "content-type": "application/json",
              "payment-required": encodedRequirement,
            },
          }
        );
      }

      logEvent("settlement_started", {
        requestId,
        receiptId: result.receiptId,
        paymentIdentifier: result.paymentIdentifier,
        routeId: route.id,
        developerId: route.developerId,
      });

      // Durable pre-settle state + exactly-once /settle + classification.
      const identity = extractPaymentIdentity(result.paymentPayload);
      const settlementFlow = runSettlementAttempt(
        {
          receiptId: result.receiptId,
          developerId: route.developerId,
          routeId: route.id,
          amountMicroUsdc: route.priceMicroUsdc,
          paymentPayload: result.paymentPayload,
          paymentRequirements: result.paymentRequirements,
        },
        {
          markPending: (receiptId) =>
            markSettlementPendingAttempt(receiptId, {
              kind: "settlement_attempt",
              paymentIdentifier: result.paymentIdentifier,
              payer: identity.payer,
              nonceHex: identity.nonceHex,
              validBefore: authorizationDeadline(result.paymentPayload),
            }),
          classify: settlementService.settleVerifiedPayment,
          applySettled: applySettledSettlement,
          markFailed: (receiptId, errorCode) =>
            markSettlementResult(receiptId, {
              paymentStatus: "SETTLEMENT_FAILED",
              x402TxHash: null,
              settledAt: null,
              errorCode,
            }),
          markAmbiguous: (receiptId, errorCode) =>
            markSettlementResult(receiptId, {
              paymentStatus: "SETTLEMENT_PENDING",
              x402TxHash: null,
              settledAt: null,
              errorCode,
            }),
        }
      );

      const settlement = await settlementFlow;

      if (settlement.kind === "settled") {
        logEvent("settlement_succeeded", {
          requestId,
          receiptId: result.receiptId,
          paymentIdentifier: result.paymentIdentifier,
          routeId: route.id,
          developerId: route.developerId,
        });

        // M10 exact-earning ledger entry (applied atomically with SETTLED).
        if (settlement.earningCreated) {
          logEvent("ledger_created", {
            requestId,
            receiptId: result.receiptId,
            paymentIdentifier: result.paymentIdentifier,
            routeId: route.id,
            developerId: route.developerId,
            amountMicroUsdc: route.priceMicroUsdc,
          });
        }

        // ---- M10: exact-earning creator payout handoff (best effort) ----
        // The payout outcome NEVER affects caller delivery: success,
        // failure status, skip (disabled gate) and even a thrown handoff
        // all produce the identical response below. Any throw is absorbed
        // so a payout wiring problem can never break the delivered
        // resource. Only safe fields are logged (no secrets, signatures,
        // or error messages; the tx hash is only logged as a presence
        // boolean — full hashes live in the payouts table).
        logEvent("payout_started", {
          requestId,
          receiptId: result.receiptId,
          paymentIdentifier: result.paymentIdentifier,
          routeId: route.id,
          developerId: route.developerId,
        });
        try {
          const payout = await payoutHandoff.attemptPayoutForReceipt(
            route.developerId,
            result.receiptId,
            isPayoutsEnabled()
          );
          if (payout.kind === "skipped") {
            logEvent("payout_skipped", {
              requestId,
              receiptId: result.receiptId,
              paymentIdentifier: result.paymentIdentifier,
              routeId: route.id,
              developerId: route.developerId,
              kind: payout.kind,
              reason: payout.reason,
            });
          } else {
            logEvent(payoutStageFor(payout.status), {
              requestId,
              receiptId: result.receiptId,
              paymentIdentifier: result.paymentIdentifier,
              routeId: route.id,
              developerId: route.developerId,
              status: payout.status,
              payoutId: payout.payoutId,
              txHashPresent: payout.txHash !== null ? 1 : 0,
            });
          }
        } catch {
          logEvent("payout_failed", {
            requestId,
            receiptId: result.receiptId,
            paymentIdentifier: result.paymentIdentifier,
            routeId: route.id,
            developerId: route.developerId,
            kind: "error",
          });
        }

        // Confirmed settlement → deliver the real protected upstream
        // response with the official PAYMENT-RESPONSE header.
        const delivery = buildSettledDelivery({
          upstreamStatus: execution.status,
          upstreamBody: execution.responseBody,
          safeResponseHeaders: execution.safeResponseHeaders,
          transaction: settlement.transaction,
          network: settlement.network,
          receiptId: result.receiptId,
        });
        logEvent("response_delivered", {
          requestId,
          receiptId: result.receiptId,
          paymentIdentifier: result.paymentIdentifier,
          routeId: route.id,
          developerId: route.developerId,
          status: delivery.status,
          latencyMs: execution.latencyMs,
        });
        return new Response(delivery.body, {
          status: delivery.status,
          headers: delivery.headers,
        });
      }

      if (settlement.kind === "ambiguous") {
        // Durable SETTLEMENT_PENDING was written before /settle; the
        // onchain outcome is unknown and must be reconciled.
        logEvent("settlement_pending", {
          requestId,
          receiptId: result.receiptId,
          paymentIdentifier: result.paymentIdentifier,
          routeId: route.id,
          developerId: route.developerId,
          errorCode: "SETTLEMENT_UNKNOWN",
          status: settlement.status,
        });
        // Durable SETTLEMENT_PENDING was written before /settle; outcome
        // unknown, never expose the protected body.
        return new Response(
          JSON.stringify({
            error: "SETTLEMENT_UNKNOWN",
            message:
              "Settlement outcome is unknown and must be reconciled. The resource was not delivered.",
            receiptId: result.receiptId,
          }),
          {
            status: settlement.status,
            headers: { "content-type": "application/json" },
          }
        );
      }

      if (settlement.kind === "persist_failed") {
        logEvent("settlement_persist_failed", {
          requestId,
          receiptId: result.receiptId,
          routeId: route.id,
          developerId: route.developerId,
        });
        // Onchain outcome confirmed but final persistence failed; the
        // receipt remains durably SETTLEMENT_PENDING and recovery
        // tooling will reconcile it. Never deliver the resource.
        return new Response(
          JSON.stringify({
            error: "SETTLEMENT_UNKNOWN",
            message:
              "Settlement was confirmed but its record could not be persisted. The resource was not delivered and the payment will be reconciled.",
            receiptId: result.receiptId,
          }),
          {
            status: 502,
            headers: { "content-type": "application/json" },
          }
        );
      }

      // Explicit rejection/failure (durably persisted by the flow).
      logEvent("settlement_failed", {
        requestId,
        receiptId: result.receiptId,
        paymentIdentifier: result.paymentIdentifier,
        routeId: route.id,
        developerId: route.developerId,
        errorCode: settlement.errorCode,
      });
      return new Response(
        JSON.stringify({
          error: "SETTLEMENT_FAILED",
          message:
            "Settlement was rejected by the facilitator. The resource was not delivered.",
          receiptId: result.receiptId,
        }),
        {
          status: 402,
          headers: {
            "content-type": "application/json",
            "payment-required": encodedRequirement,
          },
        }
      );
    }

    switch (result.kind) {
      case "replay":
        return new Response(REPLAY_BODY, {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      case "invalid":
        if (result.reason === "MALFORMED_PAYMENT_SIGNATURE") {
          return new Response(INVALID_SIGNATURE_BODY, {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(REQUIRED_BODY, {
          status: 402,
          headers: {
            "content-type": "application/json",
            "payment-required": encodedRequirement,
          },
        });
      case "verification_unavailable": {
        const status = result.status >= 500 ? 502 : 503;
        return new Response(VERIFICATION_UNAVAILABLE_BODY, {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    }
  }

  // M11: anonymous (unpaid) traffic is limited by IP before the 402. The
  // settled/paid flow above is NEVER limited here — already-paid requests
  // must never be stranded by abuse protection.
  const anonVerdict = await rateLimiter.check({
    ...RATE_LIMIT_POLICIES.gatewayAnonymous,
    identifier: ipIdentifier,
  });

  if (anonVerdict.degraded) {
    // Observable fail-open: logged here, never inside the limiter.
    logEvent("rate_limit_degraded", {
      requestId,
      scope: scopeLabel("gatewayAnonymous"),
    });
  }

  if (!anonVerdict.allowed) {
    return rateLimitedResponse(anonVerdict.retryAfterSeconds);
  }

  return new Response(REQUIRED_BODY, {
    status: 402,
    headers: {
      "content-type": "application/json",
      "payment-required": encodedRequirement,
    },
  });
}

export async function GET(request: Request, context: ProxyContext) {
  return handleResourceRequest(request, context);
}

export async function POST(request: Request, context: ProxyContext) {
  return handleResourceRequest(request, context);
}

// HEAD is served automatically through GET by Next.js.

export async function PUT(): Promise<Response> {
  return methodNotAllowed();
}

export async function PATCH(): Promise<Response> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}
