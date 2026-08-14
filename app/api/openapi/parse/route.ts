import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionFromCookie } from "@/lib/auth/service";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { isRateLimitProxyTrusted } from "@/lib/env";
import { DEFAULT_MAX_SPEC_BYTES, parseOpenApiSpec } from "@/lib/openapi";
import { logEvent } from "@/lib/observability/logger";
import { resolveClientIdentifier } from "@/lib/ratelimit/client-ip";
import { rateLimiter } from "@/lib/ratelimit/redis-limiter";
import { RATE_LIMIT_POLICIES, scopeLabel } from "@/lib/ratelimit/policy";
import { validateUpstreamUrl } from "@/lib/ssrf/validate";

/**
 * POST /api/openapi/parse — parse an OpenAPI spec into normalized
 * operations for review.
 *
 * Thin wiring over the pure parse core (`lib/openapi/parse.ts`): session
 * auth, zod body validation, a 1 MiB byte bound checked BEFORE parsing
 * (declared content-length, then the parsed spec as backstop), an
 * IP-scoped rate limit, and a publication-grade `resolveServerUrl` hook
 * so every operation's publishability is DNS-verified at parse time, not
 * only at publish. The spec is never persisted and never echoed back;
 * responses carry the normalized model only.
 *
 * Machine error contract: 401 UNAUTHENTICATED, 400 INVALID_BODY,
 * 413 SPEC_TOO_LARGE, 429 RATE_LIMITED (+ retry-after),
 * 400 INVALID_SPEC (+ machine `reason`), 500 INTERNAL_ERROR. Raw parser
 * internals and spec text are never surfaced.
 */
const parseBodySchema = z.object({
  spec: z.string(),
});

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(
    cookieStore.get(SESSION_COOKIE_NAME)?.value
  );
  if (!session.authenticated) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // Declared-length guard BEFORE buffering/parsing (mirrors the endpoints
  // test route): an oversized payload is rejected up front. The post-parse
  // byte check below remains the backstop for undeclared or chunked bodies.
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > DEFAULT_MAX_SPEC_BYTES) {
      return NextResponse.json(
        {
          error: "SPEC_TOO_LARGE",
          message: `Spec exceeds the ${DEFAULT_MAX_SPEC_BYTES}-byte limit`,
        },
        { status: 413 }
      );
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = parseBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  // Bound BEFORE any parsing. Byte-based (not char-based): a multibyte
  // UTF-8 spec can exceed the limit while staying short in characters.
  if (Buffer.byteLength(parsed.data.spec, "utf8") > DEFAULT_MAX_SPEC_BYTES) {
    return NextResponse.json(
      {
        error: "SPEC_TOO_LARGE",
        message: `Spec exceeds the ${DEFAULT_MAX_SPEC_BYTES}-byte limit`,
      },
      { status: 413 }
    );
  }

  // M11: parse attempts are limited by client IP (XFF only when the
  // deployment proxy-trust flag is explicitly enabled).
  const verdict = await rateLimiter.check({
    ...RATE_LIMIT_POLICIES.openapiParse,
    identifier: resolveClientIdentifier(request, isRateLimitProxyTrusted()),
  });

  if (verdict.degraded) {
    // Observable fail-open: logged here, never inside the limiter.
    logEvent("rate_limit_degraded", {
      scope: scopeLabel("openapiParse"),
    });
  }

  if (!verdict.allowed) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: "Too many spec parse requests. Try again later.",
        retryAfterSeconds: verdict.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "retry-after": String(verdict.retryAfterSeconds) },
      }
    );
  }

  try {
    // Publication-grade DNS check per operation's effective server URL:
    // the same SSRF validation the publish path runs, so a server whose
    // hostname resolves to a private IP is flagged at review time with
    // the truthful reason instead of failing only at publish.
    const result = await parseOpenApiSpec(parsed.data.spec, {
      resolveServerUrl: async (url) => {
        const verdict = await validateUpstreamUrl(url, { resolveDns: true });
        return verdict.ok ? { ok: true } : { ok: false, reason: verdict.reason };
      },
    });
    if (!result.ok) {
      if (result.error === "too_large") {
        // Defensive: the route pre-bounds at the same threshold, so this
        // is normally unreachable. SPEC_TOO_LARGE stays a 413.
        return NextResponse.json({ error: "SPEC_TOO_LARGE" }, { status: 413 });
      }
      // Machine reason only: the parse core's message is already sanitized
      // (never spec content, never parser internals).
      return NextResponse.json(
        {
          error: "INVALID_SPEC",
          reason: result.error,
          ...(result.message !== undefined ? { message: result.message } : {}),
        },
        { status: 400 }
      );
    }
    // Normalized model only: raw spec text, warnings, and parser internals
    // are never part of the response.
    return NextResponse.json({ operations: result.operations });
  } catch {
    // The core never rejects in practice, but an unexpected failure must
    // map to a safe 500 without leaking internals.
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
