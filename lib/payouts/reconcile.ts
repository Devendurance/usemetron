/**
 * Payout recovery (M8).
 *
 * For every non-final payout with a persisted tx hash, inspect the
 * onchain outcome read-only:
 *   - success + matching USDC transfer → CONFIRMED
 *   - reverted → FAILED (reservation released)
 *   - pending/unknown → remains SUBMITTED (reserved), NEVER re-broadcast
 *
 * Never infers success from wallet balances alone.
 */

import type { PayoutRow } from "../db/payouts";
import { assessPayoutConfirmation } from "./evidence";

export type PayoutReceiptEvidence = {
  status: "success" | "reverted" | "unknown";
  txTo: string | null;
  transfers: Array<{ from: string; to: string; value: bigint }>;
  txInput: `0x${string}` | null;
};

export type ReconcilePayoutDeps = {
  listNonFinal(): Promise<PayoutRow[]>;
  fetchReceipt(txHash: string): Promise<PayoutReceiptEvidence>;
  finalize(payoutId: string, confirmedAt: Date): Promise<void>;
  markFailed(payoutId: string, error: string): Promise<void>;
  now(): Date;
};

export type PayoutReconcileReport = {
  scanned: number;
  confirmed: Array<{ payoutId: string; txHash: string; attributionVerified: boolean }>;
  failed: Array<{ payoutId: string; txHash: string }>;
  keptReserved: Array<{ payoutId: string; txHash: string | null; reason: string }>;
};

export async function reconcilePayouts(
  deps: ReconcilePayoutDeps
): Promise<PayoutReconcileReport> {
  const nonFinal = await deps.listNonFinal();
  const report: PayoutReconcileReport = {
    scanned: nonFinal.length,
    confirmed: [],
    failed: [],
    keptReserved: [],
  };

  for (const payout of nonFinal) {
    if (payout.txHash === null) {
      // Reserved but never broadcast: keep reserved for operator review.
      report.keptReserved.push({ payoutId: payout.id, txHash: null, reason: "never_broadcast" });
      continue;
    }

    let evidence: PayoutReceiptEvidence;
    try {
      evidence = await deps.fetchReceipt(payout.txHash);
    } catch {
      report.keptReserved.push({ payoutId: payout.id, txHash: payout.txHash, reason: "receipt_unavailable" });
      continue;
    }

    const assessment = assessPayoutConfirmation({
      txStatus: evidence.status,
      txTo: evidence.txTo,
      transfers: evidence.transfers,
      txInput: evidence.txInput,
      expected: {
        payer: payout.fromWallet,
        to: payout.toWallet,
        amountMicroUsdc: BigInt(payout.amountMicroUsdc),
        attributionTag: payout.attributionTag ?? "",
      },
    });

    if (assessment.status === "confirmed") {
      await deps.finalize(payout.id, deps.now());
      report.confirmed.push({
        payoutId: payout.id,
        txHash: payout.txHash,
        attributionVerified: assessment.attributionVerified,
      });
    } else if (evidence.status === "reverted") {
      await deps.markFailed(payout.id, assessment.reason);
      report.failed.push({ payoutId: payout.id, txHash: payout.txHash });
    } else {
      report.keptReserved.push({
        payoutId: payout.id,
        txHash: payout.txHash,
        reason: assessment.reason,
      });
    }
  }

  return report;
}
