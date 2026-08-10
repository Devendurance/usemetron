/**
 * Pure authoritative-settlement evidence assessment (M7.2).
 *
 * A pending Metron settlement is proven SETTLED only when the transaction
 * that consumed the authorization also moved the expected USDC to the
 * registered Metron wallet for the exact receipt amount. Evidence is
 * assessed fail-closed: any mismatch → NOT settled.
 */

import { USDC_ADDRESS } from "../celo/config";

export type ExpectedSettlement = {
  asset: string;
  payer: string;
  payTo: string;
  /** Receipt amount in micro-USDC (bigint-safe). */
  valueMicroUsdc: bigint;
  nonceHex: string;
};

export type AuthorizationUsedLog = {
  authorizer: string;
  nonce: string;
  transactionHash: string;
};

export type TransferLog = {
  from: string;
  to: string;
  value: bigint;
};

export type TxStatus = "success" | "reverted";

/** Decoded calldata of the authorization call, when decodable. */
export type DecodedAuthorizationCall = {
  from: string;
  to: string;
  value: bigint;
  nonce: string;
};

export type AssessmentInput = {
  expected: ExpectedSettlement;
  /** null when no AuthorizationUsed event exists for payer+nonce. */
  authUsed: AuthorizationUsedLog | null;
  /** Transfer events in the SAME transaction as the AuthorizationUsed log. */
  transferLogs: TransferLog[];
  txStatus: TxStatus;
  /** Decoded authorization calldata (optional; null when unsupported). */
  calldata: DecodedAuthorizationCall | null;
};

export type EvidenceAssessment =
  | { status: "settled"; transactionHash: string }
  | { status: "not_found" }
  | { status: "conflict"; reason: string };

function canonicalAsset(asset: string): string {
  return asset.toLowerCase();
}

/**
 * Assesses whether the consuming transaction is authoritative evidence of
 * THIS Metron settlement. Never infers success from nonce consumption
 * alone.
 */
export function assessSettlementEvidence(
  input: AssessmentInput
): EvidenceAssessment {
  const { expected, authUsed, transferLogs, txStatus, calldata } = input;

  // 1. The authorization must have been consumed by this payer+nonce.
  if (authUsed === null) return { status: "not_found" };
  if (
    authUsed.authorizer.toLowerCase() !== expected.payer.toLowerCase() ||
    authUsed.nonce.toLowerCase() !== expected.nonceHex.toLowerCase()
  ) {
    return { status: "conflict", reason: "authused_payer_nonce_mismatch" };
  }

  // 2. The consuming transaction must have succeeded.
  if (txStatus === "reverted") {
    return { status: "conflict", reason: "tx_reverted" };
  }

  // 3. The SAME transaction must contain the expected USDC transfer:
  //    canonical token, payer → registered payTo, exact receipt amount.
  const canonical = canonicalAsset(expected.asset);
  if (canonical !== canonicalAsset(USDC_ADDRESS)) {
    return { status: "conflict", reason: "wrong_token" };
  }

  const matchingTransfer = transferLogs.find(
    (t) =>
      t.from.toLowerCase() === expected.payer.toLowerCase() &&
      t.to.toLowerCase() === expected.payTo.toLowerCase() &&
      t.value === expected.valueMicroUsdc
  );
  if (matchingTransfer === undefined) {
    // Distinguish "no transfer at all" from "transfer with wrong params".
    const anyFromPayer = transferLogs.some(
      (t) => t.from.toLowerCase() === expected.payer.toLowerCase()
    );
    return {
      status: "conflict",
      reason: anyFromPayer
        ? "transfer_parameters_mismatch"
        : "expected_transfer_absent",
    };
  }

  // 4. Where decodable, the authorization call must match exactly.
  if (calldata !== null) {
    const callMatches =
      calldata.from.toLowerCase() === expected.payer.toLowerCase() &&
      calldata.to.toLowerCase() === expected.payTo.toLowerCase() &&
      calldata.value === expected.valueMicroUsdc &&
      calldata.nonce.toLowerCase() === expected.nonceHex.toLowerCase();
    if (!callMatches) {
      return { status: "conflict", reason: "calldata_mismatch" };
    }
  }

  return { status: "settled", transactionHash: authUsed.transactionHash };
}
