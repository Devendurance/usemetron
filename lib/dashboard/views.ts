/**
 * Dashboard view mappers (pure — no server-only import).
 *
 * Maps DB rows to the public DTOs. Redaction is a hard requirement: the
 * output carries only the fields declared in the view types, so facilitator
 * internals (payment_identifier, facilitator_response, signatures) can
 * never reach the UI even if present on the input row.
 */

import { fromMicroUsdc } from "../celo/amounts";
import type { PayoutRow } from "../db/payouts";
import type { ReceiptRow } from "../db/receipts";
import { toExplorerTxUrlOrNull } from "./explorer";
import type {
  PayoutEvidenceView,
  TransactionDetailView,
  TransactionView,
} from "./types";

export function toTransactionView(receipt: ReceiptRow): TransactionView {
  return {
    id: receipt.id,
    routeId: receipt.routeId,
    routeName: receipt.routeName,
    createdAt: receipt.createdAt.toISOString(),
    paymentStatus: receipt.paymentStatus,
    amountMicroUsdc: receipt.amountMicroUsdc,
    amountUsdc: fromMicroUsdc(String(receipt.amountMicroUsdc)),
    callerWallet: receipt.callerWallet,
    asset: receipt.asset,
    network: receipt.network,
    upstreamStatusCode: receipt.upstreamStatusCode,
    upstreamLatencyMs: receipt.upstreamLatencyMs,
    verifiedAt: receipt.verifiedAt ? receipt.verifiedAt.toISOString() : null,
    settledAt: receipt.settledAt ? receipt.settledAt.toISOString() : null,
    x402TxHash: receipt.x402TxHash,
    errorCode: receipt.errorCode,
    explorerUrl: toExplorerTxUrlOrNull(receipt.x402TxHash),
  };
}

export function toPayoutEvidenceView(
  payout: PayoutRow & { routeName: string }
): PayoutEvidenceView {
  return {
    id: payout.id,
    routeName: payout.routeName,
    toWallet: payout.toWallet,
    amountMicroUsdc: payout.amountMicroUsdc,
    amountUsdc: fromMicroUsdc(String(payout.amountMicroUsdc)),
    status: payout.status,
    txHash: payout.txHash,
    attributionTag: payout.attributionTag,
    createdAt: payout.createdAt.toISOString(),
    submittedAt: payout.submittedAt ? payout.submittedAt.toISOString() : null,
    confirmedAt: payout.confirmedAt ? payout.confirmedAt.toISOString() : null,
    explorerUrl: toExplorerTxUrlOrNull(payout.txHash),
  };
}

export function toTransactionDetailView(
  receipt: ReceiptRow,
  payout: (PayoutRow & { routeName: string }) | null
): TransactionDetailView {
  return {
    ...toTransactionView(receipt),
    payout: payout ? toPayoutEvidenceView(payout) : null,
  };
}
