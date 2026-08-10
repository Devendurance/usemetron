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
import { extractPaymentIdentity, authorizationDeadline } from "@/lib/x402/payload";
import { settlePayment } from "@/lib/x402/client";
import { isSettlementEnabled } from "@/lib/env";

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

function methodNotAllowed() {  return new Response(null, {
    status: 405,
    headers: { Allow: ALLOW },
  });
}

/** Secret-safe stage log (never logs payloads, signatures, or secrets). */
function stageLog(stage: string, fields: Record<string, string | number>) {
  console.log(
    JSON.stringify({ stage, ts: new Date().toISOString(), ...fields })
  );
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

  const signatureHeader = request.headers.get("payment-signature");

  if (signatureHeader !== null && signatureHeader !== "") {
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
      const callerSegments = proxy.slice(1).map((segment) => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      });
      const { body, tooLarge } = await readCallerBody(request, request.method);
      if (tooLarge) {
        stageLog("upstream_skipped_body_too_large", {
          requestId,
          receiptId: result.receiptId,
          routeId: route.id,
        });
        return new Response(REQUEST_TOO_LARGE_BODY, {
          status: 413,
          headers: { "content-type": "application/json" },
        });
      }

      const callerHeaders = Array.from(request.headers.entries());
      stageLog("upstream_started", {
        requestId,
        receiptId: result.receiptId,
        paymentIdentifier: result.paymentIdentifier,
        routeId: route.id,
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
        stageLog("upstream_failed", {
          requestId,
          receiptId: result.receiptId,
          routeId: route.id,
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
        stageLog("upstream_failed", {
          requestId,
          receiptId: result.receiptId,
          paymentIdentifier: result.paymentIdentifier,
          routeId: route.id,
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
      stageLog("upstream_succeeded", {
        requestId,
        receiptId: result.receiptId,
        paymentIdentifier: result.paymentIdentifier,
        routeId: route.id,
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
        stageLog("settlement_disabled", {
          requestId,
          receiptId: result.receiptId,
          routeId: route.id,
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

      stageLog("settlement_started", {
        requestId,
        receiptId: result.receiptId,
        paymentIdentifier: result.paymentIdentifier,
        routeId: route.id,
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
        stageLog("settlement_succeeded", {
          requestId,
          receiptId: result.receiptId,
          paymentIdentifier: result.paymentIdentifier,
          routeId: route.id,
        });

        // Confirmed settlement → deliver the real protected upstream
        // response with the official PAYMENT-RESPONSE header.
        const delivery = buildSettledDelivery({
          upstreamStatus: execution.status,
          upstreamBody: execution.responseBody,
          safeResponseHeaders: execution.safeResponseHeaders,
          transaction: settlement.transaction,
          network: settlement.network,
        });
        return new Response(delivery.body, {
          status: delivery.status,
          headers: delivery.headers,
        });
      }

      if (settlement.kind === "ambiguous") {
        stageLog("settlement_failed", {
          requestId,
          receiptId: result.receiptId,
          paymentIdentifier: result.paymentIdentifier,
          routeId: route.id,
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
        stageLog("settlement_persist_failed", {
          requestId,
          receiptId: result.receiptId,
          routeId: route.id,
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
      stageLog("settlement_failed", {
        requestId,
        receiptId: result.receiptId,
        paymentIdentifier: result.paymentIdentifier,
        routeId: route.id,
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
