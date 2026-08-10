/**
 * Payout orchestration (injectable, testable).
 *
 * Request flow: derive destination server-side → transactionally reserve
 * unreserved earnings → broadcast each payout crash-safely → classify.
 */

import type { PayoutBroadcastResult } from "./broadcast";
import type { PayoutRow } from "../db/payouts";

export type PayoutServiceDeps = {
  /** Registered Metron payout wallet (from_wallet on every payout). */
  fromWallet: string;
  /** Canonical attribution tag. */
  attributionTag: string;
  developerWallet(developerId: string): Promise<string | null>;
  reserve(input: {
    developerId: string;
    fromWallet: string;
    toWallet: string;
    attributionTag: string;
    now: Date;
  }): Promise<PayoutRow[]>;
  broadcast(payout: PayoutRow): Promise<PayoutBroadcastResult>;
  now(): Date;
};

export type PayoutRequestOutcome = {
  status: "ok" | "nothing_to_payout";
  payouts: Array<{
    id: string;
    amountMicroUsdc: number;
    status: string;
    txHash: string | null;
    attributionVerified?: boolean;
    reason?: string;
  }>;
};

export async function requestPayout(
  developerId: string,
  deps: PayoutServiceDeps
): Promise<PayoutRequestOutcome> {
  const destination = await deps.developerWallet(developerId);
  if (destination === null) {
    throw new Error("developer wallet unavailable");
  }

  const reserved = await deps.reserve({
    developerId,
    fromWallet: deps.fromWallet,
    toWallet: destination,
    attributionTag: deps.attributionTag,
    now: deps.now(),
  });

  if (reserved.length === 0) {
    return { status: "nothing_to_payout", payouts: [] };
  }

  const payouts: PayoutRequestOutcome["payouts"] = [];
  for (const payout of reserved) {
    const result = await deps.broadcast(payout);
    if (result.kind === "confirmed") {
      payouts.push({
        id: payout.id,
        amountMicroUsdc: payout.amountMicroUsdc,
        status: "CONFIRMED",
        txHash: result.txHash,
        attributionVerified: result.attributionVerified,
      });
    } else if (result.kind === "failed") {
      payouts.push({
        id: payout.id,
        amountMicroUsdc: payout.amountMicroUsdc,
        status: "FAILED",
        txHash: null,
        reason: result.reason,
      });
    } else {
      payouts.push({
        id: payout.id,
        amountMicroUsdc: payout.amountMicroUsdc,
        status: "SUBMITTED",
        txHash: null,
        reason: result.reason,
      });
    }
  }

  return { status: "ok", payouts };
}
