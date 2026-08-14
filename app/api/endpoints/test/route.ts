import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionFromCookie } from "@/lib/auth/service";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { decryptUpstreamSecret, encryptUpstreamSecret } from "@/lib/crypto/upstream-secrets";
import { getRouteById } from "@/lib/db/routes";
import { isRateLimitProxyTrusted } from "@/lib/env";
import { filterCallerHeaders } from "@/lib/gateway/headers";
import { encryptionKey, upstreamService } from "@/lib/gateway/instance";
import { MAX_CALLER_BODY_BYTES } from "@/lib/gateway/limits";
import { logEvent } from "@/lib/observability/logger";
import { resolveClientIdentifier } from "@/lib/ratelimit/client-ip";
import { rateLimiter } from "@/lib/ratelimit/redis-limiter";
import { RATE_LIMIT_POLICIES, scopeLabel } from "@/lib/ratelimit/policy";
import { runUpstreamTest, type TestAuth } from "@/lib/testconsole";

/**
 * POST /api/endpoints/test — creator test console.
 *
 * Executes one request through the REAL hardened upstream path
 * (`upstreamService` from lib/gateway/instance.ts — runtime SSRF
 * revalidation + DNS pin, decrypt, creator-header injection, compression
 * normalization, response bounds) with NO payment/ledger/payout side
 * effects. Existing endpoints test with the stored encrypted credential
 * (never disclosed); drafts test with a transient submitted secret
 * (encrypted in-transit, never persisted, automatically redacted from
 * logs by the M11.1 onDecrypt wiring).
 *
 * Machine error contract: 401 UNAUTHENTICATED, 400 INVALID_BODY /
 * REQUEST_TOO_LARGE, 404 ENDPOINT_NOT_FOUND, 429 RATE_LIMITED (+
 * retry-after), 500 INTERNAL_ERROR. Executed tests return 200 with a
 * `TestResult` (kind: success | non_2xx | upstream_failed | ssrf_blocked
 * | invalid_config | timeout). The secret is never returned.
 */
const authSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("bearer"), secret: z.string().min(1).max(4096) }),
  z.object({
    type: z.literal("apiKey"),
    headerName: z.string().min(1).max(64),
    secret: z.string().min(1).max(4096),
  }),
]);

const MAX_QUERY_HEADER_ENTRIES = 64;

const testRequestSchema = z.object({
  method: z.enum(["GET", "POST"]),
  path: z.string().max(2048).optional(),
  query: z
    .record(z.string().min(1).max(64), z.string().max(2048))
    .refine((value) => Object.keys(value).length <= MAX_QUERY_HEADER_ENTRIES)
    .optional(),
  headers: z
    .record(z.string().min(1).max(64), z.string().max(2048))
    .refine((value) => Object.keys(value).length <= MAX_QUERY_HEADER_ENTRIES)
    .optional(),
  body: z.string().optional(),
});

const testBodySchema = z
  .object({
    endpointId: z.string().min(1).max(128).optional(),
    draft: z
      .object({
        upstreamUrl: z.string().min(1).max(2048),
        auth: authSchema,
      })
      .optional(),
    request: testRequestSchema,
  })
  .refine(
    (value) => (value.endpointId !== undefined) !== (value.draft !== undefined),
    { message: "exactly one of endpointId or draft is required" }
  );

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(
    cookieStore.get(SESSION_COOKIE_NAME)?.value
  );
  if (!session.authenticated) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const developer = session.developer;

  // Declared-length guard BEFORE buffering/parsing (mirrors the gateway
  // route's readCallerBody): an oversized payload is rejected up front.
  // The post-parse byte check below remains the backstop for undeclared
  // or chunked bodies.
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > MAX_CALLER_BODY_BYTES) {
      return NextResponse.json(
        { error: "REQUEST_TOO_LARGE", message: "Request body exceeds the 1 MiB limit" },
        { status: 400 }
      );
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = testBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  // Bounds BEFORE any execution: the upstream request body follows the
  // gateway's 1 MiB caller cap (byte-based, like the paid path), and GET
  // never carries a body.
  if (
    parsed.data.request.body !== undefined &&
    Buffer.byteLength(parsed.data.request.body, "utf8") > MAX_CALLER_BODY_BYTES
  ) {
    return NextResponse.json(
      { error: "REQUEST_TOO_LARGE", message: "Request body exceeds the 1 MiB limit" },
      { status: 400 }
    );
  }
  if (parsed.data.request.method === "GET" && parsed.data.request.body !== undefined) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  // Test executions are limited by client IP (XFF only when the deployment
  // proxy-trust flag is explicitly enabled).
  const verdict = await rateLimiter.check({
    ...RATE_LIMIT_POLICIES.endpointTest,
    identifier: resolveClientIdentifier(request, isRateLimitProxyTrusted()),
  });
  if (verdict.degraded) {
    logEvent("rate_limit_degraded", { scope: scopeLabel("endpointTest") });
  }
  if (!verdict.allowed) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: "Too many endpoint tests. Try again later.",
        retryAfterSeconds: verdict.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "retry-after": String(verdict.retryAfterSeconds) },
      }
    );
  }

  try {
    let upstreamUrl: string;
    let auth: TestAuth;

    if (parsed.data.endpointId !== undefined) {
      // Stored-credential path: ownership is always session-derived; the
      // encrypted credential is decrypted server-side and re-encrypted
      // transiently for execution — never disclosed to the caller.
      const route = await getRouteById(parsed.data.endpointId);
      if (route === null || route.developerId !== developer.id) {
        return NextResponse.json({ error: "ENDPOINT_NOT_FOUND" }, { status: 404 });
      }
      upstreamUrl = route.upstreamUrl;
      if (route.encryptedUpstreamAuth === null) {
        auth = { type: "NONE" };
      } else {
        const decrypted = decryptUpstreamSecret(
          route.encryptedUpstreamAuth,
          encryptionKey()
        );
        auth =
          decrypted.authType === "NONE"
            ? { type: "NONE" }
            : decrypted.authType === "BEARER"
              ? { type: "BEARER", secret: decrypted.secret }
              : { type: "API_KEY", headerName: decrypted.headerName ?? "", secret: decrypted.secret };
      }
    } else {
      // Draft path: the submitted secret is transient (encrypted -> the
      // service decrypts it); nothing is persisted.
      const draft = parsed.data.draft;
      if (draft === undefined) {
        // Unreachable: the schema refines to exactly one of the two.
        return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
      }
      upstreamUrl = draft.upstreamUrl;
      const submitted = draft.auth;
      auth =
        submitted.type === "none"
          ? { type: "NONE" }
          : submitted.type === "bearer"
            ? { type: "BEARER", secret: submitted.secret }
            : { type: "API_KEY", headerName: submitted.headerName, secret: submitted.secret };
    }

    const segments =
      parsed.data.request.path === undefined
        ? []
        : parsed.data.request.path.split("/").filter((segment) => segment !== "");

    // The gateway's header policy applies before the core: only allowlisted
    // caller headers survive, so creator auth can never be overridden (the
    // service filters again and injects the credential after).
    const callerHeaders = filterCallerHeaders(parsed.data.request.headers ?? {});

    const result = await runUpstreamTest(
      {
        upstreamUrl,
        auth,
        request: {
          method: parsed.data.request.method,
          callerPathSegments: segments,
          callerQuery: new URLSearchParams(parsed.data.request.query ?? {}),
          callerHeaders,
          body:
            parsed.data.request.body === undefined
              ? null
              : Buffer.from(parsed.data.request.body, "utf8"),
        },
      },
      {
        executeUpstream: upstreamService.executeUpstream,
        encryptSecret: encryptUpstreamSecret,
        encryptionKey: encryptionKey(),
        now: () => Date.now(),
      }
    );

    return NextResponse.json({ result });
  } catch (error) {
    // Never log raw error text: an error message could embed attacker- or
    // credential-derived content. Only the error class name is safe, and
    // the logger's redactor (incl. M11.1 registered secrets) still applies.
    logEvent("endpoint_test_error", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    // The core never rejects; an unexpected failure (e.g. an undecryptable
    // stored envelope or a repository error) maps to a safe 500 without
    // leaking internals or secrets.
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
