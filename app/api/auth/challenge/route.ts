import { NextResponse } from "next/server"
import { z } from "zod"

import { toAuthErrorResponse } from "@/lib/auth/auth-service"
import { authService } from "@/lib/auth/service"
import { isRateLimitProxyTrusted } from "@/lib/env"
import { logEvent } from "@/lib/observability/logger"
import { resolveClientIdentifier } from "@/lib/ratelimit/client-ip"
import { rateLimiter } from "@/lib/ratelimit/redis-limiter"
import { RATE_LIMIT_POLICIES, scopeLabel } from "@/lib/ratelimit/policy"

const challengeBodySchema = z.object({
  address: z.string().min(1).max(64),
  chainId: z.number().int(),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 })
  }

  const parsed = challengeBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 })
  }

  // M11: auth challenges are limited by client IP (XFF only when the
  // deployment proxy-trust flag is explicitly enabled).
  const verdict = await rateLimiter.check({
    ...RATE_LIMIT_POLICIES.authChallenge,
    identifier: resolveClientIdentifier(request, isRateLimitProxyTrusted()),
  })

  if (verdict.degraded) {
    // Observable fail-open: logged here, never inside the limiter.
    logEvent("rate_limit_degraded", {
      scope: scopeLabel("authChallenge"),
    })
  }

  if (!verdict.allowed) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: "Too many challenge requests. Try again later.",
        retryAfterSeconds: verdict.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "retry-after": String(verdict.retryAfterSeconds) },
      }
    )
  }

  try {
    const { nonce, message } = await authService.challenge(parsed.data)
    return NextResponse.json({ nonce, message })
  } catch (error) {
    const { status, payload } = toAuthErrorResponse(error)
    return NextResponse.json(payload, { status })
  }
}
