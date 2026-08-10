import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSessionFromCookie } from "@/lib/auth/service";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { payoutAccounting } from "@/lib/db/payouts";

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

  const { listPayoutHistory } = await import("@/lib/db/payouts");
  const { fromMicroUsdc } = await import("@/lib/celo/amounts");
  const history = await listPayoutHistory(developer.id);
  const accounting = await payoutAccounting(developer.id);

  return NextResponse.json({
    paidMicroUsdc: accounting.paidMicroUsdc,
    reservedMicroUsdc: accounting.reservedMicroUsdc,
    paidUsdc: fromMicroUsdc(String(accounting.paidMicroUsdc)),
    payouts: history.map((p) => ({
      id: p.id,
      routeName: p.routeName,
      toWallet: p.toWallet,
      amountMicroUsdc: p.amountMicroUsdc,
      amountUsdc: fromMicroUsdc(String(p.amountMicroUsdc)),
      status: p.status,
      txHash: p.txHash,
      lastError: p.lastError,
      createdAt: p.createdAt.toISOString(),
      confirmedAt: p.confirmedAt?.toISOString() ?? null,
    })),
  });
}
