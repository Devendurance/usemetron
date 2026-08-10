import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { authService } from "@/lib/auth/service"
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session"

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  await authService.logout(token)

  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  })
  return response
}
