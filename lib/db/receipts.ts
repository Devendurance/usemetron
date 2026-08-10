/**
 * Drizzle repository for call_receipts (server-only).
 *
 * M4 creates receipts ONLY after successful facilitator verification and a
 * successful replay reservation. The UNIQUE payment_identifier constraint
 * is the durable second line of replay defense; a conflicting insert
 * returns null so the caller can map it to PAYMENT_REPLAY.
 */

import "server-only";

import { and, count, desc, eq } from "drizzle-orm";

import { db } from "./client";
import {
  callReceipts,
  creatorLedgerEntries,
  LEDGER_TYPE,
  PAYMENT_STATUS,
  proxyRoutes,
} from "./schema";export type InsertVerifiedReceipt = {
  routeId: string;
  developerId: string;
  callerWallet: string | null;
  paymentIdentifier: string;
  amountMicroUsdc: number;
  asset: string;
  network: string;
  scheme: string;
  payTo: string;
  verifiedAt: Date;
};

export async function insertVerifiedReceipt(
  data: InsertVerifiedReceipt
): Promise<{ id: string } | null> {
  const rows = await db
    .insert(callReceipts)
    .values({
      route_id: data.routeId,
      developer_id: data.developerId,
      caller_wallet: data.callerWallet,
      payment_identifier: data.paymentIdentifier,
      amount_micro_usdc: data.amountMicroUsdc,
      asset: data.asset,
      network: data.network,
      scheme: data.scheme,
      pay_to: data.payTo,
      payment_status: PAYMENT_STATUS.VERIFIED,
      verified_at: data.verifiedAt,
    })
    .onConflictDoNothing({ target: callReceipts.payment_identifier })
    .returning({ id: callReceipts.id });
  return rows[0] ? { id: rows[0].id } : null;
}

export async function getReceiptByPaymentIdentifier(
  paymentIdentifier: string
): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: callReceipts.id })
    .from(callReceipts)
    .where(eq(callReceipts.payment_identifier, paymentIdentifier))
    .limit(1);
  return rows[0] ? { id: rows[0].id } : null;
}

export type UpstreamResultUpdate = {
  paymentStatus: (typeof PAYMENT_STATUS.VERIFIED) | (typeof PAYMENT_STATUS.UPSTREAM_FAILED);
  upstreamStatusCode: number | null;
  upstreamLatencyMs: number | null;
  errorCode: string | null;
};

/**
 * Records the upstream result on an existing verified receipt.
 * 2xx keeps payment_status VERIFIED (settlement is M6); failures move it
 * to UPSTREAM_FAILED. Never writes a SETTLED state.
 */
export async function markUpstreamResult(
  id: string,
  data: UpstreamResultUpdate
): Promise<void> {
  await db
    .update(callReceipts)
    .set({
      payment_status: data.paymentStatus,
      upstream_status_code: data.upstreamStatusCode,
      upstream_latency_ms: data.upstreamLatencyMs,
      error_code: data.errorCode,
    })
    .where(eq(callReceipts.id, id));
}

export type SettlementResultUpdate = {
  paymentStatus: (typeof PAYMENT_STATUS.SETTLED) | (typeof PAYMENT_STATUS.SETTLEMENT_FAILED) | (typeof PAYMENT_STATUS.SETTLEMENT_PENDING);
  x402TxHash: string | null;
  settledAt: Date | null;
  errorCode: string | null;
};

/**
 * Records the x402 settlement outcome. SETTLED persists the facilitator's
 * transaction hash and settled_at; failure/pending states never carry a
 * fabricated hash.
 */
export async function markSettlementResult(
  id: string,
  data: SettlementResultUpdate
): Promise<void> {
  await db
    .update(callReceipts)
    .set({
      payment_status: data.paymentStatus,
      x402_tx_hash: data.x402TxHash,
      settled_at: data.settledAt,
      error_code: data.errorCode,
    })
    .where(eq(callReceipts.id, id));
}

export type ApplySettledSettlementData = {
  receiptId: string;
  developerId: string;
  routeId: string;
  amountMicroUsdc: number;
  x402TxHash: string;
  settledAt: Date;
};

export type ApplySettledSettlementResult = {
  /** False when the earning already existed (retry/reconciliation race). */
  earningCreated: boolean;
};

/**
 * Atomically applies a confirmed settlement: receipt → SETTLED (+ hash,
 * settled_at) AND exactly one creator EARNING (UNIQUE call_receipt_id
 * guards against duplicates). A crash cannot produce a SETTLED receipt
 * with a duplicated earning, nor an earning without the SETTLED receipt.
 */
export async function applySettledSettlement(
  data: ApplySettledSettlementData
): Promise<ApplySettledSettlementResult> {
  return db.transaction(async (tx) => {
    await tx
      .update(callReceipts)
      .set({
        payment_status: PAYMENT_STATUS.SETTLED,
        x402_tx_hash: data.x402TxHash,
        settled_at: data.settledAt,
        error_code: null,
      })
      .where(eq(callReceipts.id, data.receiptId));

    const rows = await tx
      .insert(creatorLedgerEntries)
      .values({
        developer_id: data.developerId,
        route_id: data.routeId,
        call_receipt_id: data.receiptId,
        amount_micro_usdc: data.amountMicroUsdc,
        type: LEDGER_TYPE.EARNING,
      })
      .onConflictDoNothing({ target: creatorLedgerEntries.call_receipt_id })
      .returning({ id: creatorLedgerEntries.id });

    return { earningCreated: rows.length > 0 };
  });
}

/* ------------------------------------------------------------------ */
/* Dashboard read path (M9). Every query is scoped by developer_id —   */
/* a receipt can never leak across creators.                           */
/* ------------------------------------------------------------------ */

export type ReceiptRow = {
  id: string;
  routeId: string;
  routeName: string;
  callerWallet: string | null;
  amountMicroUsdc: number;
  asset: string;
  network: string;
  scheme: string;
  payTo: string;
  paymentStatus: string;
  upstreamStatusCode: number | null;
  upstreamLatencyMs: number | null;
  x402TxHash: string | null;
  errorCode: string | null;
  verifiedAt: Date | null;
  settledAt: Date | null;
  createdAt: Date;
};

/** Columns shared by the dashboard read queries (route name joined in). */
const receiptSelect = {
  id: callReceipts.id,
  route_id: callReceipts.route_id,
  routeName: proxyRoutes.name,
  caller_wallet: callReceipts.caller_wallet,
  amount_micro_usdc: callReceipts.amount_micro_usdc,
  asset: callReceipts.asset,
  network: callReceipts.network,
  scheme: callReceipts.scheme,
  pay_to: callReceipts.pay_to,
  payment_status: callReceipts.payment_status,
  upstream_status_code: callReceipts.upstream_status_code,
  upstream_latency_ms: callReceipts.upstream_latency_ms,
  x402_tx_hash: callReceipts.x402_tx_hash,
  error_code: callReceipts.error_code,
  verified_at: callReceipts.verified_at,
  settled_at: callReceipts.settled_at,
  created_at: callReceipts.created_at,
};

type ReceiptQueryRow = Pick<
  typeof callReceipts.$inferSelect,
  | "id"
  | "route_id"
  | "caller_wallet"
  | "amount_micro_usdc"
  | "asset"
  | "network"
  | "scheme"
  | "pay_to"
  | "payment_status"
  | "upstream_status_code"
  | "upstream_latency_ms"
  | "x402_tx_hash"
  | "error_code"
  | "verified_at"
  | "settled_at"
  | "created_at"
> & { routeName: string | null };

function mapReceiptRow(row: ReceiptQueryRow): ReceiptRow {
  return {
    id: row.id,
    routeId: row.route_id,
    // leftJoin types the route side as nullable; the FK guarantees a
    // route exists, so a missing name is unreachable in practice.
    routeName: row.routeName ?? "",
    callerWallet: row.caller_wallet,
    amountMicroUsdc: row.amount_micro_usdc,
    asset: row.asset,
    network: row.network,
    scheme: row.scheme,
    payTo: row.pay_to,
    paymentStatus: row.payment_status,
    upstreamStatusCode: row.upstream_status_code,
    upstreamLatencyMs: row.upstream_latency_ms,
    x402TxHash: row.x402_tx_hash,
    errorCode: row.error_code,
    verifiedAt: row.verified_at,
    settledAt: row.settled_at,
    createdAt: row.created_at,
  };
}

/** Newest-first receipts for a creator's dashboard list. */
export async function listReceiptsByDeveloper(
  developerId: string,
  limit: number
): Promise<ReceiptRow[]> {
  const rows = await db
    .select(receiptSelect)
    .from(callReceipts)
    .leftJoin(proxyRoutes, eq(proxyRoutes.id, callReceipts.route_id))
    .where(eq(callReceipts.developer_id, developerId))
    .orderBy(desc(callReceipts.created_at))
    .limit(limit);
  return rows.map(mapReceiptRow);
}

/**
 * Single receipt by id, ownership-scoped: a foreign receipt id resolves to
 * null, never to another creator's data.
 */
export async function getReceiptById(
  developerId: string,
  receiptId: string
): Promise<ReceiptRow | null> {
  const [row] = await db
    .select(receiptSelect)
    .from(callReceipts)
    .leftJoin(proxyRoutes, eq(proxyRoutes.id, callReceipts.route_id))
    .where(
      and(
        eq(callReceipts.developer_id, developerId),
        eq(callReceipts.id, receiptId)
      )
    )
    .limit(1);
  return row ? mapReceiptRow(row) : null;
}

/** Newest-first receipts for one route (endpoint detail view). */
export async function listReceiptsByRoute(
  developerId: string,
  routeId: string,
  limit: number
): Promise<ReceiptRow[]> {
  const rows = await db
    .select(receiptSelect)
    .from(callReceipts)
    .leftJoin(proxyRoutes, eq(proxyRoutes.id, callReceipts.route_id))
    .where(
      and(
        eq(callReceipts.developer_id, developerId),
        eq(callReceipts.route_id, routeId)
      )
    )
    .orderBy(desc(callReceipts.created_at))
    .limit(limit);
  return rows.map(mapReceiptRow);
}

export type ReceiptCounts = {
  settled: number;
  verified: number;
  upstreamFailed: number;
  settlementFailed: number;
  settlementPending: number;
  total: number;
};

/** Per-status receipt counts for a creator, zero-defaulted. */
export async function receiptCountsByDeveloper(
  developerId: string
): Promise<ReceiptCounts> {
  const rows = await db
    .select({
      paymentStatus: callReceipts.payment_status,
      count: count(),
    })
    .from(callReceipts)
    .where(eq(callReceipts.developer_id, developerId))
    .groupBy(callReceipts.payment_status);

  const counts: ReceiptCounts = {
    settled: 0,
    verified: 0,
    upstreamFailed: 0,
    settlementFailed: 0,
    settlementPending: 0,
    total: 0,
  };
  for (const row of rows) {
    counts.total += row.count;
    switch (row.paymentStatus) {
      case PAYMENT_STATUS.SETTLED:
        counts.settled = row.count;
        break;
      case PAYMENT_STATUS.VERIFIED:
        counts.verified = row.count;
        break;
      case PAYMENT_STATUS.UPSTREAM_FAILED:
        counts.upstreamFailed = row.count;
        break;
      case PAYMENT_STATUS.SETTLEMENT_FAILED:
        counts.settlementFailed = row.count;
        break;
      case PAYMENT_STATUS.SETTLEMENT_PENDING:
        counts.settlementPending = row.count;
        break;
    }
  }
  return counts;
}
