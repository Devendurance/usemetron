/**
 * Payout confirmation evidence (pure, M8/M8.1).
 *
 * FINANCIAL confirmation requires authoritative onchain evidence that the
 * money moved: successful Celo receipt + a matching USDC Transfer event
 * from the canonical token contract (treasury → creator, exact reserved
 * amount). The Transfer log originates from the token contract itself, so
 * it is self-authoritative for token/amount/parties.
 *
 * ATTRIBUTION is separate evidence: it is reported as verified/unverified
 * and never blocks financial confirmation. A financially confirmed payout
 * is never FAILED merely because attribution or any secondary diagnostic
 * check failed, and can never become eligible for resend.
 */

import { fromDataSuffix } from "@celo/attribution-tags";

import { METRON_ATTRIBUTION_TAG } from "../celo/config";

export type PayoutConfirmationInput = {
  txStatus: "success" | "reverted" | "unknown";
  /**
   * Transaction `to` address — corroborating evidence only. The
   * authoritative financial evidence is the canonical-USDC Transfer log.
   */
  txTo: string | null;
  /** USDC Transfer events from the receipt (same tx, canonical token). */
  transfers: Array<{ from: string; to: string; value: bigint }>;
  /** Raw transaction input (for attribution decoding). */
  txInput: `0x${string}` | null;
  expected: {
    payer: string;
    to: string;
    amountMicroUsdc: bigint;
    attributionTag: string;
  };
};

export type PayoutConfirmationAssessment =
  | { status: "confirmed"; attributionVerified: boolean }
  | { status: "not_confirmed"; reason: string };

export function assessPayoutConfirmation(
  input: PayoutConfirmationInput
): PayoutConfirmationAssessment {
  if (input.txStatus === "unknown") {
    return { status: "not_confirmed", reason: "receipt_unavailable" };
  }
  if (input.txStatus !== "success") {
    return { status: "not_confirmed", reason: "tx_reverted" };
  }

  // Financial truth: the canonical USDC contract emitted the exact
  // expected transfer. Wrong token = no matching canonical-USDC Transfer.
  const matching = input.transfers.find(
    (t) =>
      t.from.toLowerCase() === input.expected.payer.toLowerCase() &&
      t.to.toLowerCase() === input.expected.to.toLowerCase() &&
      t.value === input.expected.amountMicroUsdc
  );
  if (matching === undefined) {
    return { status: "not_confirmed", reason: "transfer_mismatch" };
  }

  // Attribution is separate evidence — never blocks confirmation.
  let attributionVerified = false;
  if (input.txInput !== null) {
    try {
      const decoded = fromDataSuffix(input.txInput);
      attributionVerified =
        decoded !== null && decoded.codes.includes(METRON_ATTRIBUTION_TAG);
    } catch {
      attributionVerified = false;
    }
  }

  return { status: "confirmed", attributionVerified };
}
