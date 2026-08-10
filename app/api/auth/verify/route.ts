import { NextResponse } from "next/server"
import { z } from "zod"

import { toAuthErrorResponse } from "@/lib/auth/auth-service"
import { authService } from "@/lib/auth/service"
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session"

const verifyBodySchema = z.object({
  message: z.string().min(1).max(4000),
  signature: z.string().min(1).max(200),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 })
  }

  const parsed = verifyBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 })
  }

  try {
    const { token, developer } = await authService.verify(parsed.data)
    const response = NextResponse.json({ authenticated: true, developer })
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions())
    return response
  } catch (error) {
    const { status, payload } = toAuthErrorResponse(error)
    return NextResponse.json(payload, { status })
  }
}
