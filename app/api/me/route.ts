import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { authService } from "@/lib/auth/service"
import { SESSION_COOKIE_NAME } from "@/lib/auth/session"

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  const session = await authService.me(token)
  return NextResponse.json(session)
}
