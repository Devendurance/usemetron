/**
 * Durable settlement-attempt records (M7.1 recovery).
 *
 * The receipt row itself is the durable attempt record: before the first
 * /settle call the receipt is marked SETTLEMENT_PENDING with a small
 * non-secret metadata envelope in `facilitator_response` so recovery can
 * re-identify the authorization (payer + EIP-3009 nonce + validity
 * deadline) without any signature material.
 */

import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "./client";
import { callReceipts, PAYMENT_STATUS } from "./schema";

export type SettlementAttemptMeta = {
  kind: "settlement_attempt";
  paymentIdentifier: string;
  payer: string;
  nonceHex: string;
  validBefore: number | null;
};

/**
 * Durably records that a settlement attempt is about to be (or has been)
 * submitted. Called BEFORE the real /settle request so a crash anywhere in
 * the settlement path leaves a discoverable, recoverable record.
 */
export async function markSettlementPendingAttempt(
  receiptId: string,
  meta: SettlementAttemptMeta
): Promise<void> {
  await db
    .update(callReceipts)
    .set({
      payment_status: PAYMENT_STATUS.SETTLEMENT_PENDING,
      error_code: "SETTLEMENT_ATTEMPT",
      facilitator_response: JSON.stringify(meta),
    })
    .where(eq(callReceipts.id, receiptId));
}

export type PendingSettlementReceipt = {
  id: string;
  developerId: string;
  routeId: string;
  amountMicroUsdc: number;
  asset: string;
  network: string;
  payTo: string;
  callerWallet: string | null;
  meta: SettlementAttemptMeta | null;
};

/** All receipts awaiting settlement-outcome resolution. */
export async function listPendingSettlementReceipts(): Promise<PendingSettlementReceipt[]> {
  const rows = await db
    .select({
      id: callReceipts.id,
      developer_id: callReceipts.developer_id,
      route_id: callReceipts.route_id,
      amount_micro_usdc: callReceipts.amount_micro_usdc,
      asset: callReceipts.asset,
      network: callReceipts.network,
      pay_to: callReceipts.pay_to,
      caller_wallet: callReceipts.caller_wallet,
      facilitator_response: callReceipts.facilitator_response,
    })
    .from(callReceipts)
    .where(
      and(
        eq(callReceipts.payment_status, PAYMENT_STATUS.SETTLEMENT_PENDING),
        isNotNull(callReceipts.facilitator_response)
      )
    );

  return rows.map((row) => {
    let meta: SettlementAttemptMeta | null = null;
    if (typeof row.facilitator_response === "string") {
      try {
        const parsed = JSON.parse(row.facilitator_response) as SettlementAttemptMeta;
        if (parsed.kind === "settlement_attempt") meta = parsed;
      } catch {
        meta = null;
      }
    }
    return {
      id: row.id,
      developerId: row.developer_id,
      routeId: row.route_id,
      amountMicroUsdc: row.amount_micro_usdc,
      asset: row.asset,
      network: row.network,
      payTo: row.pay_to,
      callerWallet: row.caller_wallet,
      meta,
    };
  });
}

/** Marks a proven-failed pending settlement (authorization expired unused). */
export async function markPendingSettlementFailed(receiptId: string): Promise<void> {
  await db
    .update(callReceipts)
    .set({
      payment_status: PAYMENT_STATUS.SETTLEMENT_FAILED,
      error_code: "SETTLEMENT_EXPIRED_UNUSED",
    })
    .where(
      and(
        eq(callReceipts.id, receiptId),
        eq(callReceipts.payment_status, PAYMENT_STATUS.SETTLEMENT_PENDING)
      )
    );
}
