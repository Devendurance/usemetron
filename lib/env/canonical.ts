/**
 * Canonical Celo mainnet production values for the environment contract.
 *
 * Configured values that must match the deployed mainnet identity exactly:
 * chain id, CAIP-2 network, USDC contract, settlement wallet, attribution
 * tag, and x402 facilitator. A configured deviation fails fast rather than
 * silently pointing money at the wrong network.
 *
 * The constants are re-exported from `lib/celo/config.ts` (the single source
 * of truth). Import direction is safe: `lib/celo/config` never imports
 * `lib/env`, so there is no cycle. This module is pure — no `server-only`,
 * no `process.env` reads, no values ever appear in results (names only).
 */

import {
  CELO_CHAIN_ID,
  CELO_NETWORK,
  METRON_ATTRIBUTION_TAG,
  METRON_SETTLEMENT_WALLET,
  USDC_ADDRESS,
  X402_FACILITATOR_URL,
} from "../celo/config";
import { ENV_NAMES, type EnvName } from "../env";

/** Canonical production values, keyed by environment variable name. */
export const CANONICAL_PRODUCTION_VALUES = {
  [ENV_NAMES.CELO_CHAIN_ID]: String(CELO_CHAIN_ID),
  [ENV_NAMES.CELO_NETWORK]: CELO_NETWORK,
  [ENV_NAMES.CELO_USDC_ADDRESS]: USDC_ADDRESS,
  [ENV_NAMES.METRON_SETTLEMENT_WALLET]: METRON_SETTLEMENT_WALLET,
  [ENV_NAMES.CELO_ATTRIBUTION_TAG]: METRON_ATTRIBUTION_TAG,
  [ENV_NAMES.X402_FACILITATOR_URL]: X402_FACILITATOR_URL,
} as const;

export type CanonicalEnvName = keyof typeof CANONICAL_PRODUCTION_VALUES;

/**
 * Addresses compare case-insensitively: EIP-55 casing is error detection,
 * not identity, and `lib/celo/config` accepts any case variant of the
 * canonical address. Everything else (chain id, network, tag, URLs)
 * compares exactly.
 */
const ADDRESS_VARS: ReadonlySet<EnvName> = new Set([
  ENV_NAMES.CELO_USDC_ADDRESS,
  ENV_NAMES.METRON_SETTLEMENT_WALLET,
]);

/**
 * Returns the names of configured variables whose value deviates from the
 * canonical production constant. Only variables that ARE set are checked;
 * unset variables are left to the presence checks. Values are never
 * included in the result.
 */
export function validateCanonicalProductionValues(
  values: Partial<Record<EnvName, string | undefined>>
): EnvName[] {
  const invalid: EnvName[] = [];
  for (const [name, canonical] of Object.entries(
    CANONICAL_PRODUCTION_VALUES
  ) as Array<[EnvName, string]>) {
    const raw = values[name];
    if (raw === undefined) continue;
    const matches = ADDRESS_VARS.has(name)
      ? raw.toLowerCase() === canonical.toLowerCase()
      : raw === canonical;
    if (!matches) {
      invalid.push(name);
    }
  }
  return invalid;
}
