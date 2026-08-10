/**
 * Shared settlement-wallet validation helpers.
 *
 * Pure and side-effect free (no server-only): importable from tests, server
 * code, and the foundation verification script. Nothing in this module is a
 * secret — the settlement address and its match status are public facts.
 */

import { getAddress, isAddress } from "viem";

import { METRON_SETTLEMENT_WALLET } from "../celo/config";

export type WalletValidation =
  | { ok: true; checksummed: `0x${string}` }
  | { ok: false; reason: string };

/**
 * Validates a raw address string and returns its EIP-55 checksummed form.
 * Rejects anything that is not a valid 0x-prefixed 40-character hex address.
 */
export function validateWalletAddress(address: string): WalletValidation {
  if (!isAddress(address)) {
    return { ok: false, reason: "not a valid hex-encoded EVM address" };
  }
  return { ok: true, checksummed: getAddress(address) };
}

/** Status values for comparing a configured signer to the registered wallet. */
export const SIGNER_MATCH = {
  CONFIGURED_MATCH: "configured-match",
  CONFIGURED_MISMATCH: "configured-mismatch",
  NOT_CONFIGURED: "not-configured",
} as const;

export type SignerMatchStatus = (typeof SIGNER_MATCH)[keyof typeof SIGNER_MATCH];

export type RegisteredWalletMatch =
  | { status: "ok"; checksummed: `0x${string}` }
  | { status: "mismatch" | "invalid" | "missing"; message: string };

/**
 * Asserts that a configured settlement address resolves to the registered
 * Metron wallet (`METRON_SETTLEMENT_WALLET`) for the hackathon scope.
 *
 * - `undefined` (not configured) → ok, canonical fallback
 * - valid address matching the registered wallet (any case/format) → ok
 * - valid address that differs → mismatch
 * - malformed address → invalid
 */
export function assertRegisteredWalletMatches(
  configured: string | undefined
): RegisteredWalletMatch {
  if (configured === undefined) {
    return { status: "ok", checksummed: METRON_SETTLEMENT_WALLET };
  }

  const validation = validateWalletAddress(configured);
  if (!validation.ok) {
    return {
      status: "invalid",
      message: "configured settlement wallet is not a valid address",
    };
  }

  if (validation.checksummed !== METRON_SETTLEMENT_WALLET) {
    return {
      status: "mismatch",
      message: `configured settlement wallet does not match the registered wallet (expected ${METRON_SETTLEMENT_WALLET})`,
    };
  }

  return { status: "ok", checksummed: validation.checksummed };
}
