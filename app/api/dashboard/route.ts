import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSessionFromCookie } from "@/lib/auth/service";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { buildDashboardSummary } from "@/lib/dashboard/instance";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionFromCookie(token);
  if (!session.authenticated) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const summary = await buildDashboardSummary(session.developer.id);
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
