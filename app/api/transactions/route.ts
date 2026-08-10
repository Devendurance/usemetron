import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionFromCookie } from "@/lib/auth/service";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  listRouteTransactions,
  listTransactions,
} from "@/lib/dashboard/instance";
import { getRouteById } from "@/lib/db/routes";

/** Default page size; newest-first ordering is enforced by the service. */
const TRANSACTION_LIMIT = 100;

const querySchema = z.object({
  // Optional: filter transactions to a single owned endpoint.
  routeId: z.uuid().optional(),
});

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionFromCookie(token);
  if (!session.authenticated) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    routeId: url.searchParams.get("routeId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const routeId = parsed.data.routeId;
    if (routeId !== undefined) {
      // Ownership check: a foreign or unknown route must not be distinguishable.
      const route = await getRouteById(routeId);
      if (route === null || route.developerId !== session.developer.id) {
        return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      }
      const transactions = await listRouteTransactions(
        session.developer.id,
        routeId,
        TRANSACTION_LIMIT
      );
      return NextResponse.json({ transactions });
    }

    const transactions = await listTransactions(
      session.developer.id,
      TRANSACTION_LIMIT
    );
    return NextResponse.json({ transactions });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
