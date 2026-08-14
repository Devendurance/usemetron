import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionFromCookie } from "@/lib/auth/service";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { endpointService } from "@/lib/endpoints/instance";
import { toEndpointErrorResponse } from "@/lib/endpoints/service";
import { isRateLimitProxyTrusted } from "@/lib/env";
import { MAX_CALLER_BODY_BYTES } from "@/lib/gateway/limits";
import { logEvent } from "@/lib/observability/logger";
import { resolveClientIdentifier } from "@/lib/ratelimit/client-ip";
import { rateLimiter } from "@/lib/ratelimit/redis-limiter";
import { RATE_LIMIT_POLICIES, scopeLabel } from "@/lib/ratelimit/policy";

/**
 * POST /api/openapi/publish — publish a reviewed OpenAPI import as a batch
 * of creator-owned endpoints.
 *
 * Thin wiring over the EXISTING create path (`endpointService.create`):
 * ownership, slug generation, AES-256-GCM secret encryption, and the
 * powered URL (from NEXT_PUBLIC_APP_URL) are all inherited from that
 * service — no publishing logic is duplicated here.
 *
 * Batch semantics (partial-failure): each operation is created
 * sequentially (deterministic, no parallel creates and no slug races) and
 * independently. The response is always HTTP 200 with `{ results }` even
 * when some operations fail; per-operation failures carry the existing
 * machine codes from `toEndpointErrorResponse` (INVALID_INPUT,
 * INVALID_PRICE, UNSAFE_UPSTREAM_URL, INVALID_AUTH_CONFIG,
 * INTERNAL_ERROR, ...). The server never accepts developer identity from
 * the body — ownership is always the authenticated session.
 *
 * Machine error contract (top-level): 401 UNAUTHENTICATED,
 * 400 INVALID_BODY, 429 RATE_LIMITED (+ retry-after),
 * 500 INTERNAL_ERROR.
 *
 * Idempotency: per-operation creation is atomic, but there is NO server
 * idempotency key in V1.5A — two identical publishes create two routes
 * (documented limitation; the client uses an in-flight guard and
 * retry-only-failed semantics).
 */
const MAX_BATCH_OPERATIONS = 50;

const authSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("bearer"), secret: z.string().max(4096) }),
  z.object({
    type: z.literal("apiKey"),
    headerName: z.string().max(64),
    secret: z.string().max(4096),
  }),
]);

/** Field bounds mirror the single-create route's schema (`/api/endpoints`). */
const operationSchema = z.object({
  key: z.string().min(1).max(128),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  upstreamUrl: z.string().min(1).max(2048),
  priceUsdc: z.string().min(1).max(32),
  auth: authSchema.optional(),
});

const publishBodySchema = z.object({
  operations: z.array(operationSchema).min(1).max(MAX_BATCH_OPERATIONS),
});

type PublishOperation = z.infer<typeof operationSchema>;

type PublishResult =
  | { key: string; ok: true; id: string; slug: string; poweredUrl: string }
  | { key: string; ok: false; error: string };

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(
    cookieStore.get(SESSION_COOKIE_NAME)?.value
  );
  if (!session.authenticated) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const developer = session.developer;

  // Declared-length guard BEFORE buffering/parsing (mirrors the parse
  // route and the endpoints test route): an oversized batch body is
  // rejected up front. The per-operation schema bounds remain the
  // backstop for undeclared or chunked bodies.
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > MAX_CALLER_BODY_BYTES) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = publishBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  // M11: publish batches are limited by client IP (XFF only when the
  // deployment proxy-trust flag is explicitly enabled). Checked BEFORE
  // any create runs so a limited client never burns server work.
  const verdict = await rateLimiter.check({
    ...RATE_LIMIT_POLICIES.openapiPublish,
    identifier: resolveClientIdentifier(request, isRateLimitProxyTrusted()),
  });

  if (verdict.degraded) {
    // Observable fail-open: logged here, never inside the limiter.
    logEvent("rate_limit_degraded", {
      scope: scopeLabel("openapiPublish"),
    });
  }

  if (!verdict.allowed) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: "Too many publish requests. Try again later.",
        retryAfterSeconds: verdict.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "retry-after": String(verdict.retryAfterSeconds) },
      }
    );
  }

  try {
    const results: PublishResult[] = [];
    // Sequential by design: parallel creates could race on slug
    // generation. Each operation is isolated so one failure never
    // aborts the batch (partial-failure semantics).
    for (const operation of parsed.data.operations) {
      results.push(await publishOperation(developer.id, operation));
    }
    return NextResponse.json({ results }, { status: 200 });
  } catch {
    // Unreachable in practice (every operation is caught), but an
    // unexpected loop failure must map to a safe 500 without leaking
    // internals.
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

async function publishOperation(
  developerId: string,
  operation: PublishOperation
): Promise<PublishResult> {
  try {
    const endpoint = await endpointService.create(developerId, {
      name: operation.name,
      description: operation.description,
      upstreamUrl: operation.upstreamUrl,
      priceUsdc: operation.priceUsdc,
      auth: operation.auth ?? { type: "none" },
    });
    return {
      key: operation.key,
      ok: true,
      id: endpoint.id,
      slug: endpoint.slug,
      poweredUrl: endpoint.poweredUrl,
    };
  } catch (error) {
    // Reuse the existing machine error contract; the HTTP status is
    // intentionally dropped — batch responses are always 200 and each
    // result carries its machine code.
    const { payload } = toEndpointErrorResponse(error);
    return { key: operation.key, ok: false, error: payload.error };
  }
}
