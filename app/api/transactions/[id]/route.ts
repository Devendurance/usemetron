import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionFromCookie } from "@/lib/auth/service";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getTransactionDetail } from "@/lib/dashboard/instance";

const paramSchema = z.object({
  id: z.uuid(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionFromCookie(token);
  if (!session.authenticated) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = paramSchema.safeParse({ id });
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    // Null for unknown OR foreign ids — both surface as NOT_FOUND so
    // ownership of other creators' transactions is never leaked.
    const transaction = await getTransactionDetail(
      session.developer.id,
      parsed.data.id
    );
    if (transaction === null) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ transaction });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
