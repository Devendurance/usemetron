/**
 * Creator ledger repository (server-only).
 *
 * `creator_ledger_entries` is immutable accounting: one earning per
 * SETTLED receipt, enforced by the UNIQUE `call_receipt_id` constraint.
 * Idempotency never relies on Redis.
 */

import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "./client";
import { callReceipts, creatorLedgerEntries, LEDGER_TYPE, PAYMENT_STATUS, proxyRoutes } from "./schema";

export type LedgerEntryRow = {
  id: string;
  developerId: string;
  routeId: string;
  callReceiptId: string;
  amountMicroUsdc: number;
  type: string;
  createdAt: Date;
};

function mapEntry(row: typeof creatorLedgerEntries.$inferSelect): LedgerEntryRow {
  return {
    id: row.id,
    developerId: row.developer_id,
    routeId: row.route_id,
    callReceiptId: row.call_receipt_id,
    amountMicroUsdc: row.amount_micro_usdc,
    type: row.type,
    createdAt: row.created_at,
  };
}

export type SettledReceiptRow = {
  id: string;
  developerId: string;
  routeId: string;
  paymentStatus: string;
  amountMicroUsdc: number;
  x402TxHash: string | null;
  settledAt: Date | null;
};

export type EarningCreationResult =
  | { kind: "created"; entry: LedgerEntryRow }
  | { kind: "already_exists" }
  | { kind: "not_settled" };

/**
 * Creates exactly one EARNING for a SETTLED receipt. Returns
 * "already_exists" when the UNIQUE call_receipt_id already has an entry
 * (retries/reconciliation/concurrency safe). Never creates an earning for
 * non-SETTLED receipts.
 */
export async function createEarningForReceipt(
  receiptId: string
): Promise<EarningCreationResult> {
  const [receipt] = await db
    .select({
      id: callReceipts.id,
      developer_id: callReceipts.developer_id,
      route_id: callReceipts.route_id,
      payment_status: callReceipts.payment_status,
      amount_micro_usdc: callReceipts.amount_micro_usdc,
    })
    .from(callReceipts)
    .where(eq(callReceipts.id, receiptId))
    .limit(1);

  if (!receipt) return { kind: "not_settled" };
  if (receipt.payment_status !== PAYMENT_STATUS.SETTLED) {
    return { kind: "not_settled" };
  }

  const rows = await db
    .insert(creatorLedgerEntries)
    .values({
      developer_id: receipt.developer_id,
      route_id: receipt.route_id,
      call_receipt_id: receipt.id,
      amount_micro_usdc: receipt.amount_micro_usdc,
      type: LEDGER_TYPE.EARNING,
    })
    .onConflictDoNothing({ target: creatorLedgerEntries.call_receipt_id })
    .returning();
  const entry = rows[0];
  return entry ? { kind: "created", entry: mapEntry(entry) } : { kind: "already_exists" };
}

/** SETTLED receipts that have no ledger entry yet (reconciliation input). */
export async function listSettledReceiptsMissingEarnings(): Promise<SettledReceiptRow[]> {
  const rows = await db
    .select({
      id: callReceipts.id,
      developer_id: callReceipts.developer_id,
      route_id: callReceipts.route_id,
      payment_status: callReceipts.payment_status,
      amount_micro_usdc: callReceipts.amount_micro_usdc,
      x402_tx_hash: callReceipts.x402_tx_hash,
      settled_at: callReceipts.settled_at,
    })
    .from(callReceipts)
    .leftJoin(
      creatorLedgerEntries,
      eq(creatorLedgerEntries.call_receipt_id, callReceipts.id)
    )
    .where(
      and(
        eq(callReceipts.payment_status, PAYMENT_STATUS.SETTLED),
        sql`${creatorLedgerEntries.id} is null`
      )
    );
  return rows.map((row) => ({
    id: row.id,
    developerId: row.developer_id,
    routeId: row.route_id,
    paymentStatus: row.payment_status,
    amountMicroUsdc: row.amount_micro_usdc,
    x402TxHash: row.x402_tx_hash,
    settledAt: row.settled_at,
  }));
}

export type CreatorTotals = {
  earnedMicroUsdc: number;
  paidMicroUsdc: number;
  outstandingMicroUsdc: number;
  /** earned - paid - active reservations (withdrawable right now). */
  availableToPayoutMicroUsdc: number;
  /** Amount locked in PENDING/SUBMITTED payout reservations. */
  reservedMicroUsdc: number;
};

/**
 * Canonical creator totals from real ledger + payout records.
 * earned = sum of EARNING credits; paid = CONFIRMED payouts only;
 * outstanding = earned - paid; available = outstanding - reservations.
 */
export async function creatorTotals(developerId: string): Promise<CreatorTotals> {
  const [earnedRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${creatorLedgerEntries.amount_micro_usdc}), 0)`,
    })
    .from(creatorLedgerEntries)
    .where(
      and(
        eq(creatorLedgerEntries.developer_id, developerId),
        eq(creatorLedgerEntries.type, LEDGER_TYPE.EARNING)
      )
    );

  const { payoutAccounting } = await import("./payouts");
  const payout = await payoutAccounting(developerId);

  const earnedMicroUsdc = Number(earnedRow?.total ?? 0);
  const paidMicroUsdc = payout.paidMicroUsdc;
  const reservedMicroUsdc = payout.reservedMicroUsdc;
  const outstandingMicroUsdc = earnedMicroUsdc - paidMicroUsdc;
  return {
    earnedMicroUsdc,
    paidMicroUsdc,
    outstandingMicroUsdc,
    availableToPayoutMicroUsdc: outstandingMicroUsdc - reservedMicroUsdc,
    reservedMicroUsdc,
  };
}

export type RecentEarning = {
  id: string;
  routeId: string;
  routeName: string;
  receiptId: string;
  amountMicroUsdc: number;
  createdAt: Date;
  x402TxHash: string | null;
};

/** Most recent ledger entries for one creator with route/receipt context. */
export async function recentCreatorEntries(
  developerId: string,
  limit = 10
): Promise<RecentEarning[]> {
  const rows = await db
    .select({
      id: creatorLedgerEntries.id,
      routeId: creatorLedgerEntries.route_id,
      routeName: proxyRoutes.name,
      receiptId: creatorLedgerEntries.call_receipt_id,
      amountMicroUsdc: creatorLedgerEntries.amount_micro_usdc,
      createdAt: creatorLedgerEntries.created_at,
      x402TxHash: callReceipts.x402_tx_hash,
    })
    .from(creatorLedgerEntries)
    .innerJoin(proxyRoutes, eq(proxyRoutes.id, creatorLedgerEntries.route_id))
    .innerJoin(callReceipts, eq(callReceipts.id, creatorLedgerEntries.call_receipt_id))
    .where(eq(creatorLedgerEntries.developer_id, developerId))
    .orderBy(desc(creatorLedgerEntries.created_at))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    routeId: row.routeId,
    routeName: row.routeName,
    receiptId: row.receiptId,
    amountMicroUsdc: row.amountMicroUsdc,
    createdAt: row.createdAt,
    x402TxHash: row.x402TxHash,
  }));
}
