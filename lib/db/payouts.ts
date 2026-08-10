/**
 * Payout repository (server-only).
 *
 * Reservation model: an EARNING is available until it has a payout row.
 * One payout row per earning (UNIQUE ledger_entry_id), created inside a
 * Postgres transaction with row locks so concurrent payout requests can
 * never reserve the same earnings twice. A payout is "active/reserved"
 * while PENDING or SUBMITTED; only CONFIRMED counts as paid.
 */

import "server-only";

import { and, count, desc, eq, inArray, isNotNull, or } from "drizzle-orm";

import { db } from "./client";
import { creatorLedgerEntries, developers, payouts, proxyRoutes, callReceipts } from "./schema";

export const PAYOUT_STATUS = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  CONFIRMED: "CONFIRMED",
  FAILED: "FAILED",
  PENDING_RETRY: "PENDING_RETRY",
} as const;

export type PayoutRow = {
  id: string;
  developerId: string;
  callReceiptId: string;
  ledgerEntryId: string;
  fromWallet: string;
  toWallet: string;
  amountMicroUsdc: number;
  status: string;
  attributionTag: string | null;
  txHash: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: Date;
  submittedAt: Date | null;
  confirmedAt: Date | null;
};

function mapRow(row: typeof payouts.$inferSelect): PayoutRow {
  return {
    id: row.id,
    developerId: row.developer_id,
    callReceiptId: row.call_receipt_id,
    ledgerEntryId: row.ledger_entry_id,
    fromWallet: row.from_wallet,
    toWallet: row.to_wallet,
    amountMicroUsdc: row.amount_micro_usdc,
    status: row.status,
    attributionTag: row.attribution_tag,
    txHash: row.tx_hash,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    confirmedAt: row.confirmed_at,
  };
}

export type ReserveInput = {
  developerId: string;
  fromWallet: string;
  toWallet: string;
  attributionTag: string;
  now: Date;
};

/**
 * Reserves every unreserved EARNING for the developer as a PENDING payout.
 * Inside a transaction: the developer's EARNING rows are locked with
 * `FOR UPDATE SKIP LOCKED`, existing payouts are re-checked, and inserts
 * are guarded by the UNIQUE ledger_entry_id constraint. Concurrent payout
 * requests therefore can never reserve the same earnings twice.
 */
export async function reserveOutstandingEarnings(
  input: ReserveInput
): Promise<PayoutRow[]> {
  return db.transaction(async (tx) => {
    // Lock the developer's EARNING ledger rows (skip already-locked rows
    // held by a concurrent reservation).
    const earnings = await tx
      .select({
        id: creatorLedgerEntries.id,
        callReceiptId: creatorLedgerEntries.call_receipt_id,
        amountMicroUsdc: creatorLedgerEntries.amount_micro_usdc,
      })
      .from(creatorLedgerEntries)
      .where(
        and(
          eq(creatorLedgerEntries.developer_id, input.developerId),
          eq(creatorLedgerEntries.type, "EARNING")
        )
      )
      .for("update", { skipLocked: true });

    const earningIds = earnings.map((e) => e.id);
    if (earningIds.length === 0) return [];

    const existingPayouts = await tx
      .select({ ledgerEntryId: payouts.ledger_entry_id })
      .from(payouts)
      .where(inArray(payouts.ledger_entry_id, earningIds));
    const existing = new Set(existingPayouts.map((p) => p.ledgerEntryId));

    const toReserve = earnings.filter((e) => !existing.has(e.id));
    if (toReserve.length === 0) return [];

    const rows = await tx
      .insert(payouts)
      .values(
        toReserve.map((e) => ({
          developer_id: input.developerId,
          call_receipt_id: e.callReceiptId,
          ledger_entry_id: e.id,
          from_wallet: input.fromWallet,
          to_wallet: input.toWallet,
          amount_micro_usdc: e.amountMicroUsdc,
          status: PAYOUT_STATUS.PENDING,
          attribution_tag: input.attributionTag,
          attempt_count: 0,
          created_at: input.now,
          updated_at: input.now,
        }))
      )
      .returning();

    return rows.map(mapRow);
  });
}

export type ReserveEarningInput = {
  developerId: string;
  fromWallet: string;
  toWallet: string;
  attributionTag: string;
  ledgerEntryId: string;
  now: Date;
};

/**
 * Reserves exactly ONE EARNING as a PENDING payout (never sweeps).
 * Inside a transaction: the single ledger row is locked FOR UPDATE (no
 * SKIP LOCKED — the caller targets a specific row) and verified as an
 * EARNING owned by the developer. Any existing payout for the entry
 * (any status) short-circuits to null; a FAILED record is recovered
 * operationally, never re-broadcast here. The UNIQUE ledger_entry_id
 * constraint is the concurrency guard: a racing insert conflicts and is
 * swallowed (onConflictDoNothing → empty returning → null).
 */
export async function reserveEarningForPayout(
  input: ReserveEarningInput
): Promise<PayoutRow | null> {
  return db.transaction(async (tx) => {
    // Lock the single EARNING row for this ledger entry. An unknown id,
    // foreign entry, or non-EARNING row matches nothing → null.
    const [earning] = await tx
      .select({
        id: creatorLedgerEntries.id,
        callReceiptId: creatorLedgerEntries.call_receipt_id,
        amountMicroUsdc: creatorLedgerEntries.amount_micro_usdc,
      })
      .from(creatorLedgerEntries)
      .where(
        and(
          eq(creatorLedgerEntries.id, input.ledgerEntryId),
          eq(creatorLedgerEntries.developer_id, input.developerId),
          eq(creatorLedgerEntries.type, "EARNING")
        )
      )
      .for("update");

    if (!earning) return null;

    // At most one payout per earning — any existing row means this
    // earning is already spoken for.
    const existing = await tx
      .select({ ledgerEntryId: payouts.ledger_entry_id })
      .from(payouts)
      .where(eq(payouts.ledger_entry_id, earning.id));
    if (existing.length > 0) return null;

    const rows = await tx
      .insert(payouts)
      .values({
        developer_id: input.developerId,
        call_receipt_id: earning.callReceiptId,
        ledger_entry_id: earning.id,
        from_wallet: input.fromWallet,
        to_wallet: input.toWallet,
        amount_micro_usdc: earning.amountMicroUsdc,
        status: PAYOUT_STATUS.PENDING,
        attribution_tag: input.attributionTag,
        attempt_count: 0,
        created_at: input.now,
        updated_at: input.now,
      })
      .onConflictDoNothing({ target: payouts.ledger_entry_id })
      .returning();

    const row = rows[0];
    return row ? mapRow(row) : null;
  });
}

export async function listPayoutsByDeveloper(
  developerId: string
): Promise<PayoutRow[]> {
  const rows = await db
    .select()
    .from(payouts)
    .where(eq(payouts.developer_id, developerId))
    .orderBy(desc(payouts.created_at))
    .limit(50);
  return rows.map(mapRow);
}

/** Marks a payout as broadcast (crash-safe checkpoint BEFORE sending). */
export async function markPayoutSubmitted(
  payoutId: string,
  data: { txHash: string; submittedAt: Date }
): Promise<void> {
  await db
    .update(payouts)
    .set({
      status: PAYOUT_STATUS.SUBMITTED,
      tx_hash: data.txHash,
      submitted_at: data.submittedAt,
      attempt_count: 1,
      updated_at: new Date(),
    })
    .where(eq(payouts.id, payoutId));
}

export async function markPayoutFailed(
  payoutId: string,
  error: string
): Promise<void> {
  await db
    .update(payouts)
    .set({
      status: PAYOUT_STATUS.FAILED,
      last_error: error.slice(0, 500),
      updated_at: new Date(),
    })
    .where(eq(payouts.id, payoutId));
}

export async function finalizePayoutConfirmed(
  payoutId: string,
  confirmedAt: Date
): Promise<void> {
  await db
    .update(payouts)
    .set({
      status: PAYOUT_STATUS.CONFIRMED,
      confirmed_at: confirmedAt,
      last_error: null,
      updated_at: new Date(),
    })
    .where(eq(payouts.id, payoutId));
}

/**
 * All payouts that may still be onchain-in-flight (recovery input):
 * PENDING and SUBMITTED rows, plus FAILED rows that carry a tx hash — a
 * FAILED classification with a persisted hash can be a false negative
 * (the M8.1 incident), so onchain evidence decides their final state.
 */
export async function listNonFinalPayouts(): Promise<PayoutRow[]> {
  const rows = await db
    .select()
    .from(payouts)
    .where(
      or(
        inArray(payouts.status, [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.SUBMITTED]),
        and(
          eq(payouts.status, PAYOUT_STATUS.FAILED),
          isNotNull(payouts.tx_hash)
        )
      )
    );
  return rows.map(mapRow);
}

export type PayoutAccounting = {
  paidMicroUsdc: number;
  reservedMicroUsdc: number;
};

/**
 * paid = CONFIRMED amounts only; reserved = PENDING + SUBMITTED amounts,
 * plus FAILED-with-hash amounts that are still awaiting onchain
 * reconciliation (they can never be reserved or paid again meanwhile).
 */
export async function payoutAccounting(
  developerId: string
): Promise<PayoutAccounting> {
  const rows = await db
    .select({
      status: payouts.status,
      txHash: payouts.tx_hash,
      amountMicroUsdc: payouts.amount_micro_usdc,
    })
    .from(payouts)
    .where(eq(payouts.developer_id, developerId));

  const { computePayoutAccounting } = await import("../payouts/accounting");
  return computePayoutAccounting(
    rows.map((r) => ({
      status: r.status,
      txHash: r.txHash,
      amountMicroUsdc: r.amountMicroUsdc,
    }))
  );
}

export async function getDeveloperWallet(
  developerId: string
): Promise<string | null> {
  const [row] = await db
    .select({ walletAddress: developers.wallet_address })
    .from(developers)
    .where(eq(developers.id, developerId))
    .limit(1);
  return row?.walletAddress ?? null;
}

/** Payout rows joined with route names (for history UI). */
export async function listPayoutHistory(
  developerId: string
): Promise<Array<PayoutRow & { routeName: string }>> {
  const rows = await db
    .select({
      id: payouts.id,
      developer_id: payouts.developer_id,
      call_receipt_id: payouts.call_receipt_id,
      ledger_entry_id: payouts.ledger_entry_id,
      from_wallet: payouts.from_wallet,
      to_wallet: payouts.to_wallet,
      amount_micro_usdc: payouts.amount_micro_usdc,
      status: payouts.status,
      attribution_tag: payouts.attribution_tag,
      tx_hash: payouts.tx_hash,
      attempt_count: payouts.attempt_count,
      last_error: payouts.last_error,
      created_at: payouts.created_at,
      submitted_at: payouts.submitted_at,
      confirmed_at: payouts.confirmed_at,
      updated_at: payouts.updated_at,
      routeName: proxyRoutes.name,
    })
    .from(payouts)
    .innerJoin(callReceipts, eq(callReceipts.id, payouts.call_receipt_id))
    .innerJoin(proxyRoutes, eq(proxyRoutes.id, callReceipts.route_id))
    .where(eq(payouts.developer_id, developerId))
    .orderBy(desc(payouts.created_at))
    .limit(50);
  return rows.map((row) => ({ ...mapRow(row), routeName: row.routeName }));
}

/**
 * Single payout for one receipt, ownership-scoped. At most one row can
 * exist per receipt (UNIQUE ledger_entry_id → UNIQUE call_receipt_id), so
 * limit(1) is exact — a foreign receipt resolves to null, never to another
 * creator's payout. Used by the dashboard detail view so payout evidence
 * is never missed on older receipts (unlike a bounded history list).
 */
export async function getPayoutByReceipt(
  developerId: string,
  callReceiptId: string
): Promise<(PayoutRow & { routeName: string }) | null> {
  const rows = await db
    .select({
      id: payouts.id,
      developer_id: payouts.developer_id,
      call_receipt_id: payouts.call_receipt_id,
      ledger_entry_id: payouts.ledger_entry_id,
      from_wallet: payouts.from_wallet,
      to_wallet: payouts.to_wallet,
      amount_micro_usdc: payouts.amount_micro_usdc,
      status: payouts.status,
      attribution_tag: payouts.attribution_tag,
      tx_hash: payouts.tx_hash,
      attempt_count: payouts.attempt_count,
      last_error: payouts.last_error,
      created_at: payouts.created_at,
      submitted_at: payouts.submitted_at,
      confirmed_at: payouts.confirmed_at,
      updated_at: payouts.updated_at,
      routeName: proxyRoutes.name,
    })
    .from(payouts)
    .innerJoin(callReceipts, eq(callReceipts.id, payouts.call_receipt_id))
    .innerJoin(proxyRoutes, eq(proxyRoutes.id, callReceipts.route_id))
    .where(
      and(
        eq(payouts.developer_id, developerId),
        eq(payouts.call_receipt_id, callReceiptId)
      )
    )
    .limit(1);
  const row = rows[0];
  return row ? { ...mapRow(row), routeName: row.routeName } : null;
}

/**
 * Payouts that failed or are queued for retry (dashboard failure badge).
 * PENDING_RETRY counts as a failure until the retry sweep succeeds.
 */
export async function failedPayoutCountByDeveloper(
  developerId: string
): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(payouts)
    .where(
      and(
        eq(payouts.developer_id, developerId),
        inArray(payouts.status, [PAYOUT_STATUS.FAILED, PAYOUT_STATUS.PENDING_RETRY])
      )
    );
  return rows[0]?.count ?? 0;
}
