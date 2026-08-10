/**
 * Dashboard production wiring (server-only).
 *
 * Wires the real DB repositories into the pure cores and exposes the
 * server-side dashboard API. Every query is ownership-scoped: developerId
 * flows into every call, so a transaction id can never resolve across
 * creators.
 */

import "server-only";

import {
  getReceiptById,
  listReceiptsByDeveloper,
  listReceiptsByRoute,
  receiptCountsByDeveloper,
} from "../db/receipts";
import {
  failedPayoutCountByDeveloper,
  getPayoutByReceipt,
} from "../db/payouts";
import { listRoutesByDeveloper } from "../db/routes";
import { creatorTotals } from "../db/ledger";
import {
  buildDashboardSummary as buildDashboardSummaryCore,
} from "./summary";
import {
  toPayoutEvidenceView,
  toTransactionDetailView,
  toTransactionView,
} from "./views";
import type { DashboardSummary } from "./types";
import type {
  TransactionDetailView,
  TransactionView,
} from "./types";

/** Newest-first, bounded transaction list for the dashboard. */
export async function listTransactions(
  developerId: string,
  limit: number
): Promise<TransactionView[]> {
  const rows = await listReceiptsByDeveloper(developerId, limit);
  return rows.map(toTransactionView);
}

/** Newest-first, bounded transaction list for one endpoint. */
export async function listRouteTransactions(
  developerId: string,
  routeId: string,
  limit: number
): Promise<TransactionView[]> {
  const rows = await listReceiptsByRoute(developerId, routeId, limit);
  return rows.map(toTransactionView);
}

/**
 * Single transaction with its payout evidence. Returns null for a foreign
 * or unknown id; payout evidence is attached via the exact
 * receipt-scoped lookup (never a bounded history scan, so an older
 * receipt's payout is never silently missed), and never fabricated.
 */
export async function getTransactionDetail(
  developerId: string,
  transactionId: string
): Promise<TransactionDetailView | null> {
  const receipt = await getReceiptById(developerId, transactionId);
  if (receipt === null) return null;

  const payout = await getPayoutByReceipt(developerId, receipt.id);
  return toTransactionDetailView(receipt, payout);
}

/** Dashboard headline summary wired to the real repositories. */
export function buildDashboardSummary(
  developerId: string
): Promise<DashboardSummary> {
  return buildDashboardSummaryCore(developerId, {
    listRoutes: listRoutesByDeveloper,
    receiptCounts: receiptCountsByDeveloper,
    creatorTotals,
    failedPayoutCount: failedPayoutCountByDeveloper,
  });
}

export {
  toTransactionView,
  toPayoutEvidenceView,
  toTransactionDetailView,
};
