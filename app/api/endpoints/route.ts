import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionFromCookie } from "@/lib/auth/service";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { endpointService } from "@/lib/endpoints/instance";
import { toEndpointErrorResponse } from "@/lib/endpoints/service";
import type { UpstreamAuthInput } from "@/lib/endpoints/auth-config";

const authSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("bearer"), secret: z.string().max(4096) }),
  z.object({
    type: z.literal("apiKey"),
    headerName: z.string().max(64),
    secret: z.string().max(4096),
  }),
]);

const createBodySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  upstreamUrl: z.string().min(1).max(2048),
  priceUsdc: z.string().min(1).max(32),
  auth: authSchema.optional(),
});

async function requireSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionFromCookie(token);
  if (!session.authenticated) return null;
  return session.developer;
}

export async function GET() {
  const developer = await requireSession();
  if (developer === null) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  try {
    const endpoints = await endpointService.list(developer.id);
    return NextResponse.json({ endpoints });
  } catch (error) {
    const { status, payload } = toEndpointErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(request: Request) {
  const developer = await requireSession();
  if (developer === null) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const input = parsed.data;
  const auth: UpstreamAuthInput | undefined = input.auth ?? { type: "none" };

  try {
    const endpoint = await endpointService.create(developer.id, {
      name: input.name,
      description: input.description,
      upstreamUrl: input.upstreamUrl,
      priceUsdc: input.priceUsdc,
      auth,
    });
    return NextResponse.json({ endpoint }, { status: 200 });
  } catch (error) {
    const { status, payload } = toEndpointErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
