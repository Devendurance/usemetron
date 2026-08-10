import { NextResponse } from "next/server"
import { z } from "zod"

import { toAuthErrorResponse } from "@/lib/auth/auth-service"
import { authService } from "@/lib/auth/service"

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

  try {
    const { nonce, message } = await authService.challenge(parsed.data)
    return NextResponse.json({ nonce, message })
  } catch (error) {
    const { status, payload } = toAuthErrorResponse(error)
    return NextResponse.json(payload, { status })
  }
}
