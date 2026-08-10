/**
 * Pending-settlement resolution (M7.1 recovery).
 *
 * For every SETTLEMENT_PENDING receipt with attempt metadata, establish
 * finality using authoritative onchain evidence (EIP-3009
 * AuthorizationUsed). Results:
 *   - authorization used onchain  → idempotent SETTLED + exactly one
 *     EARNING (UNIQUE call_receipt_id guards duplicates)
 *   - authorization expired unused → SETTLEMENT_FAILED (no earning)
 *   - within validity / evidence error → remains SETTLEMENT_PENDING for
 *     operator review (never guessed, never auto-settled)
 *
 * Never marks SETTLED without authoritative evidence of the transfer.
 */

import { CELO_NETWORK, USDC_ADDRESS } from "../celo/config";
import type { EvidenceAssessment } from "./evidence";

export type PendingReceipt = {
  id: string;
  developerId: string;
  routeId: string;
  amountMicroUsdc: number;
  asset: string;
  network: string;
  payTo: string;
  meta: { payer: string; nonceHex: string; validBefore: number | null } | null;
};

export type ResolvePendingDeps = {
  listPending(): Promise<PendingReceipt[]>;
  resolveEvidence(params: {
    asset: string;
    payer: string;
    nonceHex: string;
    to: string;
    valueMicroUsdc: bigint;
  }): Promise<EvidenceAssessment>;
  applySettled(data: {
    receiptId: string;
    developerId: string;
    routeId: string;
    amountMicroUsdc: number;
    x402TxHash: string;
    settledAt: Date;
  }): Promise<{ earningCreated: boolean }>;
  markFailed(receiptId: string): Promise<void>;
  now?: () => Date;
};

export type ResolutionOutcome =
  | { status: "settled"; receiptId: string; txHash: string; earningCreated: boolean }
  | { status: "proven_failed"; receiptId: string }
  | { status: "still_pending"; receiptId: string; reason: string };

export type ResolutionReport = {
  scanned: number;
  outcomes: ResolutionOutcome[];
};

export async function resolvePendingSettlements(
  deps: ResolvePendingDeps
): Promise<ResolutionReport> {
  const now = deps.now ?? (() => new Date());
  const pending = await deps.listPending();
  const outcomes: ResolutionOutcome[] = [];

  for (const receipt of pending) {
    // Only reconcile canonical-Metron payments.
    if (
      receipt.network !== CELO_NETWORK ||
      receipt.asset.toLowerCase() !== USDC_ADDRESS.toLowerCase()
    ) {
      outcomes.push({ status: "still_pending", receiptId: receipt.id, reason: "non_canonical" });
      continue;
    }
    if (receipt.meta === null) {
      outcomes.push({ status: "still_pending", receiptId: receipt.id, reason: "missing_attempt_meta" });
      continue;
    }

    let evidence: EvidenceAssessment;
    try {
      evidence = await deps.resolveEvidence({
        asset: receipt.asset,
        payer: receipt.meta.payer,
        nonceHex: receipt.meta.nonceHex,
        to: receipt.payTo,
        valueMicroUsdc: BigInt(receipt.amountMicroUsdc),
      });
    } catch {
      outcomes.push({ status: "still_pending", receiptId: receipt.id, reason: "evidence_unavailable" });
      continue;
    }

    if (evidence.status === "settled") {
      const result = await deps.applySettled({
        receiptId: receipt.id,
        developerId: receipt.developerId,
        routeId: receipt.routeId,
        amountMicroUsdc: receipt.amountMicroUsdc,
        x402TxHash: evidence.transactionHash,
        settledAt: now(),
      });
      outcomes.push({
        status: "settled",
        receiptId: receipt.id,
        txHash: evidence.transactionHash,
        earningCreated: result.earningCreated,
      });
      continue;
    }

    if (evidence.status === "conflict") {
      // The nonce was consumed but the expected Metron transfer is absent
      // (or mismatched). Metron's payment is not proven settled and must
      // not become creator-payable; keep it pending for operator review.
      outcomes.push({
        status: "still_pending",
        receiptId: receipt.id,
        reason: `conflicting_authorization:${evidence.reason}`,
      });
      continue;
    }

    // Not found: settled iff within the authorization validity window.
    const validBefore = receipt.meta.validBefore;
    if (validBefore !== null && validBefore < now().getTime() / 1000) {
      await deps.markFailed(receipt.id);
      outcomes.push({ status: "proven_failed", receiptId: receipt.id });
      continue;
    }

    outcomes.push({ status: "still_pending", receiptId: receipt.id, reason: "within_validity" });
  }

  return { scanned: pending.length, outcomes };
}
