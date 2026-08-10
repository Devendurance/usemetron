/**
 * Server-only settlement wallet: the canonical registered payout address plus
 * an optional payout signer derived from `METRON_SETTLEMENT_PRIVATE_KEY`.
 *
 * The signer is created lazily and only when the private key is configured;
 * no account is ever derived, and no transaction is ever constructed or
 * signed, in this module. The private key is never printed, logged, or
 * included in any return value — only its public address may be exposed.
 */

import "server-only";

import type { Account } from "viem";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { METRON_SETTLEMENT_WALLET } from "../celo/config";
import { validateEnv } from "../env";
import { SIGNER_MATCH, type SignerMatchStatus } from "./validate";

/**
 * Typed error raised when `METRON_SETTLEMENT_PRIVATE_KEY` is configured but
 * cannot be used to derive an account. The key value is never included.
 */
export class InvalidPrivateKeyError extends Error {
  constructor() {
    super("METRON_SETTLEMENT_PRIVATE_KEY is configured but invalid");
    this.name = "InvalidPrivateKeyError";
  }
}

/**
 * The canonical registered settlement wallet (hackathon scope). Always the
 * registered constant: `validateCeloConfig`/`getCeloConfig` own environment
 * mismatch detection separately, so wallet address checks never depend on
 * unrelated environment variables.
 */
export function getSettlementAddress(): `0x${string}` {
  return METRON_SETTLEMENT_WALLET;
}

/** Normalizes a configured private key to the 0x-prefixed hex form. */
function normalizePrivateKey(raw: string): `0x${string}` {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return `0x${trimmed}`;
  return trimmed as `0x${string}`;
}

/**
 * Lazily creates the payout signer account from
 * `METRON_SETTLEMENT_PRIVATE_KEY`, or returns null when the key is not
 * configured. Throws `InvalidPrivateKeyError` if the configured key is
 * unusable. Never signs or constructs a transaction.
 *
 * Uses the non-throwing validation path so the signer status can be reported
 * independently of unrelated missing environment variables.
 */
export function createPayoutSigner(): Account | null {
  const privateKey = validateEnv(process.env).values.METRON_SETTLEMENT_PRIVATE_KEY;
  if (privateKey === undefined) return null;

  try {
    return privateKeyToAccount(normalizePrivateKey(privateKey));
  } catch {
    throw new InvalidPrivateKeyError();
  }
}

/**
 * Public address of the payout signer when one is configured, else null.
 * Deriving the address is safe (public); the private key is never exposed.
 */
export function getSignerAddress(): `0x${string}` | null {
  const signer = createPayoutSigner();
  return signer === null ? null : signer.address;
}

/**
 * Verifies the configured payout signer against the registered settlement
 * wallet using a checksum-insensitive comparison. The private key is never
 * included in the result.
 */
export function verifyPayoutSigner(): {
  status: SignerMatchStatus;
  signerAddress?: `0x${string}`;
} {
  const signerAddress = getSignerAddress();
  if (signerAddress === null) {
    return { status: SIGNER_MATCH.NOT_CONFIGURED };
  }

  if (getAddress(signerAddress) === getAddress(getSettlementAddress())) {
    return { status: SIGNER_MATCH.CONFIGURED_MATCH, signerAddress };
  }
  return { status: SIGNER_MATCH.CONFIGURED_MISMATCH, signerAddress };
}
