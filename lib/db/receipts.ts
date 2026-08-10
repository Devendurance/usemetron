/**
 * Drizzle repository for call_receipts (server-only).
 *
 * M4 creates receipts ONLY after successful facilitator verification and a
 * successful replay reservation. The UNIQUE payment_identifier constraint
 * is the durable second line of replay defense; a conflicting insert
 * returns null so the caller can map it to PAYMENT_REPLAY.
 */

import "server-only";

import { eq } from "drizzle-orm";

import { db } from "./client";
import { callReceipts, creatorLedgerEntries, LEDGER_TYPE, PAYMENT_STATUS } from "./schema";export type InsertVerifiedReceipt = {
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
