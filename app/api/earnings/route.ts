import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSessionFromCookie } from "@/lib/auth/service";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { creatorTotals, recentCreatorEntries } from "@/lib/ledger/instance";
import { fromMicroUsdc } from "@/lib/celo/amounts";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionFromCookie(token);
  if (!session.authenticated) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const totals = await creatorTotals(session.developer.id);
  const recent = await recentCreatorEntries(session.developer.id, 10);

  return NextResponse.json({
    earnedMicroUsdc: totals.earnedMicroUsdc,
    paidMicroUsdc: totals.paidMicroUsdc,
    outstandingMicroUsdc: totals.outstandingMicroUsdc,
    availableToPayoutMicroUsdc: totals.availableToPayoutMicroUsdc,
    reservedMicroUsdc: totals.reservedMicroUsdc,
    earnedUsdc: fromMicroUsdc(String(totals.earnedMicroUsdc)),
    paidUsdc: fromMicroUsdc(String(totals.paidMicroUsdc)),
    outstandingUsdc: fromMicroUsdc(String(totals.outstandingMicroUsdc)),
    availableToPayoutUsdc: fromMicroUsdc(String(totals.availableToPayoutMicroUsdc)),
    recent: recent.map((entry) => ({
      id: entry.id,
      routeId: entry.routeId,
      routeName: entry.routeName,
      receiptId: entry.receiptId,
      amountMicroUsdc: entry.amountMicroUsdc,
      amountUsdc: fromMicroUsdc(String(entry.amountMicroUsdc)),
      createdAt: entry.createdAt.toISOString(),
      x402TxHash: entry.x402TxHash,
    })),
  });
}
