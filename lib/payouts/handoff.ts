/**
 * Payout handoff core (pure, injectable, vitest-importable).
 *
 * Attempts the payout for the EXACT earning of one receipt — never a
 * sweep. The caller passes `enabled` so a disabled feature gate short-
 * circuits with zero dependency calls.
 *
 * At most one payout per earning is guaranteed by reserve semantics: the
 * reserve dep returns null when any payout (any status) already exists
 * for that earning, so a concurrent duplicate attempt observes
 * `already_handled` and never broadcasts a second time.
 */

import type { PayoutBroadcastResult } from "./broadcast";
import type { PayoutRow } from "../db/payouts";

export type PayoutHandoffDeps = {
  /** Registered Metron payout wallet (from_wallet on the payout leg). */
  fromWallet: string;
  /** Canonical attribution tag (Track 1, genuine payouts only). */
  attributionTag: string;
  developerWallet(developerId: string): Promise<string | null>;
  getEarningByReceipt(
    developerId: string,
    receiptId: string
  ): Promise<{ id: string; amountMicroUsdc: number } | null>;
  reserveEarning(input: {
    developerId: string;
    fromWallet: string;
    toWallet: string;
    attributionTag: string;
    ledgerEntryId: string;
    now: Date;
  }): Promise<PayoutRow | null>;
  broadcast(payout: PayoutRow): Promise<PayoutBroadcastResult>;
  now(): Date;
};

export type PayoutHandoffResult =
  | { kind: "skipped"; reason: "disabled" | "no_earning" | "no_destination" | "already_handled" }
  | {
      kind: "attempted";
      payoutId: string;
      status: "CONFIRMED" | "FAILED" | "SUBMITTED" | "UNKNOWN";
      txHash: string | null;
      reason?: string;
      attributionVerified?: boolean;
    };

export async function attemptPayoutForReceipt(
  input: { developerId: string; receiptId: string; enabled: boolean },
  deps: PayoutHandoffDeps
): Promise<PayoutHandoffResult> {
  if (!input.enabled) {
    return { kind: "skipped", reason: "disabled" };
  }

  const destination = await deps.developerWallet(input.developerId);
  if (destination === null) {
    return { kind: "skipped", reason: "no_destination" };
  }

  const earning = await deps.getEarningByReceipt(input.developerId, input.receiptId);
  if (earning === null) {
    return { kind: "skipped", reason: "no_earning" };
  }

  const payout = await deps.reserveEarning({
    developerId: input.developerId,
    fromWallet: deps.fromWallet,
    toWallet: destination,
    attributionTag: deps.attributionTag,
    ledgerEntryId: earning.id,
    now: deps.now(),
  });
  if (payout === null) {
    // Any existing payout for this earning (any status) means it is
    // already spoken for — never re-broadcast.
    return { kind: "skipped", reason: "already_handled" };
  }

  // Broadcast the single reserved payout and classify. The function
  // NEVER throws for any broadcast outcome: a throwing broadcast dep is
  // reported as UNKNOWN, never SUBMITTED — a throw before the pre-broadcast
  // checkpoint (e.g. estimateGas, DB write) means no tx was ever built, so
  // "SUBMITTED" would be a false signal; the reservation stays and recovery
  // reconciles it.
  let result: PayoutBroadcastResult;
  try {
    result = await deps.broadcast(payout);
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 300) : "broadcast_error";
    return {
      kind: "attempted",
      payoutId: payout.id,
      status: "UNKNOWN",
      txHash: null,
      reason,
    };
  }

  if (result.kind === "confirmed") {
    return {
      kind: "attempted",
      payoutId: payout.id,
      status: "CONFIRMED",
      txHash: result.txHash,
      attributionVerified: result.attributionVerified,
    };
  }
  if (result.kind === "failed") {
    return {
      kind: "attempted",
      payoutId: payout.id,
      status: "FAILED",
      txHash: null,
      reason: result.reason,
    };
  }
  return {
    kind: "attempted",
    payoutId: payout.id,
    status: "SUBMITTED",
    txHash: null,
    reason: result.reason,
  };
}
