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

const patchBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  upstreamUrl: z.string().min(1).max(2048).optional(),
  priceUsdc: z.string().min(1).max(32).optional(),
  isActive: z.boolean().optional(),
  // undefined = preserve credential, null = clear, object = replace.
  auth: z.union([authSchema, z.null()]).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

async function requireSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionFromCookie(token);
  if (!session.authenticated) return null;
  return session.developer;
}

export async function GET(_request: Request, context: RouteContext) {
  const developer = await requireSession();
  if (developer === null) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const endpoint = await endpointService.get(developer.id, id);
    return NextResponse.json({ endpoint });
  } catch (error) {
    const { status, payload } = toEndpointErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const developer = await requireSession();
  if (developer === null) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const input = parsed.data;
  const auth: UpstreamAuthInput | null | undefined =
    input.auth === undefined ? undefined : input.auth;

  try {
    const endpoint = await endpointService.update(developer.id, id, {
      name: input.name,
      description: input.description ?? undefined,
      upstreamUrl: input.upstreamUrl,
      priceUsdc: input.priceUsdc,
      isActive: input.isActive,
      auth,
    });
    return NextResponse.json({ endpoint });
  } catch (error) {
    const { status, payload } = toEndpointErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const developer = await requireSession();
  if (developer === null) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const result = await endpointService.remove(developer.id, id);
    return NextResponse.json(result);
  } catch (error) {
    const { status, payload } = toEndpointErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
