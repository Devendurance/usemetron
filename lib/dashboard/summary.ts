/**
 * Dashboard summary core (pure — injectable deps, no server-only import).
 *
 * Combines real route, receipt, ledger and payout data into the dashboard
 * headline. Every dep receives `developerId` so ownership can never leak
 * across creators. Money passes through as integer micro-USDC; the decimal
 * strings are derived with fromMicroUsdc (no float math anywhere).
 */

import { fromMicroUsdc } from "../celo/amounts";
import type { CreatorTotals } from "../db/ledger";
import type { ReceiptCounts } from "../db/receipts";
import type { RouteRow } from "../db/routes";
import type { DashboardSummary } from "./types";

export type DashboardSummaryDeps = {
  listRoutes: (developerId: string) => Promise<RouteRow[]>;
  receiptCounts: (developerId: string) => Promise<ReceiptCounts>;
  creatorTotals: (developerId: string) => Promise<CreatorTotals>;
  failedPayoutCount: (developerId: string) => Promise<number>;
};

export async function buildDashboardSummary(
  developerId: string,
  deps: DashboardSummaryDeps
): Promise<DashboardSummary> {
  const [routes, counts, totals, payoutFailures] = await Promise.all([
    deps.listRoutes(developerId),
    deps.receiptCounts(developerId),
    deps.creatorTotals(developerId),
    deps.failedPayoutCount(developerId),
  ]);

  return {
    publishedEndpoints: routes.length,
    activeEndpoints: routes.filter((route) => route.isActive).length,
    settledCalls: counts.settled,
    verifiedAttempts: counts.verified,
    upstreamFailures: counts.upstreamFailed,
    settlementFailures: counts.settlementFailed,
    settlementPendingCalls: counts.settlementPending,
    payoutFailures,
    earnedMicroUsdc: totals.earnedMicroUsdc,
    paidMicroUsdc: totals.paidMicroUsdc,
    outstandingMicroUsdc: totals.outstandingMicroUsdc,
    availableToPayoutMicroUsdc: totals.availableToPayoutMicroUsdc,
    reservedMicroUsdc: totals.reservedMicroUsdc,
    earnedUsdc: fromMicroUsdc(String(totals.earnedMicroUsdc)),
    paidUsdc: fromMicroUsdc(String(totals.paidMicroUsdc)),
    outstandingUsdc: fromMicroUsdc(String(totals.outstandingMicroUsdc)),
  };
}
