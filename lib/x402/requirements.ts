/**
 * x402 V2 PaymentRequired construction for the Metron gateway.
 *
 * Shapes follow the CURRENT official `@x402/core` package types
 * (verified against v2.21.0):
 *
 *   PaymentRequirements = {
 *     scheme: string;            // "exact"
 *     network: Network;          // "eip155:42220"
 *     amount: string;            // base units as string (never a number)
 *     asset: string;             // canonical Celo USDC
 *     payTo: string;             // registered Metron settlement wallet
 *     maxTimeoutSeconds: number; // positive
 *     extra: Record<string, unknown>; // EIP-712 domain metadata for USDC
 *   }
 *
 *   PaymentRequired = {
 *     x402Version: 2,
 *     error?: string,
 *     resource: ResourceInfo,    // { url }
 *     accepts: PaymentRequirements[],
 *     extensions?: Record<string, unknown>
 *   }
 *
 * Encoding uses the official `encodePaymentRequiredHeader` (standard
 * Base64 of the JSON object). The `extra: { name: "USDC", version: "2" }`
 * field is the USDC token EIP-712 domain (name/version) required by the
 * exact EVM scheme on Celo, matching the project's established canonical
 * configuration.
 */

import { CELO_NETWORK, METRON_SETTLEMENT_WALLET, USDC_ADDRESS, X402_SCHEME } from "../celo/config";
import type { PaymentRequired, PaymentRequirements } from "./types";

/** Authorization window advertised to callers (1 hour). */
export const MAX_TIMEOUT_SECONDS = 3600;

/** USDC EIP-712 domain metadata required by the exact EVM scheme on Celo. */
export const USDC_EIP712_EXTRA = { name: "USDC", version: "2" } as const;

export type PaymentRequirementsSource = {
  /** Authoritative price in USDC base units from the persisted route. */
  priceMicroUsdc: number;
  /** The real requested resource URL (slug + path + query). */
  resourceUrl: string;
};

/** Builds the single accepted requirement for a Metron route. */
export function buildPaymentRequirements(
  source: PaymentRequirementsSource
): PaymentRequirements {
  if (!Number.isSafeInteger(source.priceMicroUsdc) || source.priceMicroUsdc <= 0) {
    throw new Error("route price must be a positive safe integer in base units");
  }
  return {
    scheme: X402_SCHEME,
    network: CELO_NETWORK,
    amount: String(source.priceMicroUsdc),
    asset: USDC_ADDRESS,
    payTo: METRON_SETTLEMENT_WALLET,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: { ...USDC_EIP712_EXTRA },
  };
}

/** Builds the complete V2 PaymentRequired object for an unpaid request. */
export function buildPaymentRequired(
  source: PaymentRequirementsSource
): PaymentRequired {
  return {
    x402Version: 2,
    resource: { url: source.resourceUrl },
    accepts: [buildPaymentRequirements(source)],
  };
}
