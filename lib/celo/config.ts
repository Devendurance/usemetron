/**
 * Canonical Celo Mainnet configuration for Metron.
 *
 * Single source of truth for chain, USDC, x402 scheme, settlement wallet,
 * attribution tag, and facilitator constants. Values that are *configured*
 * in the environment are validated against these canonical values; a
 * configured mismatch is rejected rather than silently accepted.
 *
 * This module is intentionally shared (no server-only): none of these
 * constants are secrets.
 */

import { getAddress } from "viem";

export const CELO_CHAIN_ID = 42220;
export const CELO_NETWORK = "eip155:42220" as const;

export const USDC_ADDRESS = getAddress("0xcEBA9300f2b948710d2653dD7B07f33A8B32118C");
export const USDC_DECIMALS = 6;

export const X402_SCHEME = "exact" as const;
export const X402_DASHBOARD_URL = "https://x402.celo.org";
export const X402_FACILITATOR_URL = "https://api.x402.celo.org";

/** Registered Metron x402 payTo / settlement wallet (hackathon scope). */
export const METRON_SETTLEMENT_WALLET = getAddress("0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa");

/** Metron assigned Celo attribution tag (Track 1, genuine payouts only). */
export const METRON_ATTRIBUTION_TAG = "celo_91fed90b97fc";

export type CeloConfig = {
  chainId: number;
  network: string;
  usdcAddress: `0x${string}`;
  usdcDecimals: number;
  x402Scheme: string;
  x402DashboardUrl: string;
  facilitatorUrl: string;
  settlementWallet: `0x${string}`;
  attributionTag: string;
};

export type CeloConfigCheck = {
  name: string;
  status: "ok" | "mismatch" | "invalid";
  message: string;
};

export type CeloConfigValidation = {
  ok: boolean;
  checks: CeloConfigCheck[];
  config: CeloConfig;
};

/** A configured environment value: absent, or its raw string. */
type RawEnv = Partial<Record<string, string | undefined>>;

/** Normalizes an EVM address to EIP-55 checksummed form, or null when invalid. */
function normalizeAddress(raw: string): `0x${string}` | null {
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}

/**
 * Validates configured environment values against the canonical Mainnet
 * configuration. Unset values fall back to canonical constants; set values
 * must resolve to the same address (any case variant) or exact value.
 */
export function validateCeloConfig(env: RawEnv): CeloConfigValidation {
  const checks: CeloConfigCheck[] = [];

  const rawChainId = env.CELO_CHAIN_ID;
  const chainId =
    rawChainId === undefined ? CELO_CHAIN_ID : Number(rawChainId);
  if (rawChainId !== undefined && rawChainId !== String(CELO_CHAIN_ID)) {
    checks.push({
      name: "CELO_CHAIN_ID",
      status: "mismatch",
      message: `expected ${CELO_CHAIN_ID}, got ${rawChainId}`,
    });
  } else {
    checks.push({ name: "CELO_CHAIN_ID", status: "ok", message: String(CELO_CHAIN_ID) });
  }

  const rawNetwork = env.CELO_NETWORK;
  const network = rawNetwork === undefined ? CELO_NETWORK : rawNetwork;
  if (rawNetwork !== undefined && rawNetwork !== CELO_NETWORK) {
    checks.push({
      name: "CELO_NETWORK",
      status: "mismatch",
      message: `expected ${CELO_NETWORK}, got ${rawNetwork}`,
    });
  } else {
    checks.push({ name: "CELO_NETWORK", status: "ok", message: CELO_NETWORK });
  }

  const rawUsdc = env.CELO_USDC_ADDRESS;
  if (rawUsdc !== undefined) {
    const normalized = normalizeAddress(rawUsdc);
    if (normalized === null) {
      checks.push({ name: "CELO_USDC_ADDRESS", status: "invalid", message: "not a valid address" });
    } else if (normalized !== USDC_ADDRESS) {
      checks.push({
        name: "CELO_USDC_ADDRESS",
        status: "mismatch",
        message: `expected ${USDC_ADDRESS}, got ${normalized}`,
      });
    } else {
      checks.push({ name: "CELO_USDC_ADDRESS", status: "ok", message: USDC_ADDRESS });
    }
  } else {
    checks.push({ name: "CELO_USDC_ADDRESS", status: "ok", message: USDC_ADDRESS });
  }

  const rawWallet = env.METRON_SETTLEMENT_WALLET;
  if (rawWallet !== undefined) {
    const normalized = normalizeAddress(rawWallet);
    if (normalized === null) {
      checks.push({
        name: "METRON_SETTLEMENT_WALLET",
        status: "invalid",
        message: "not a valid address",
      });
    } else if (normalized !== METRON_SETTLEMENT_WALLET) {
      checks.push({
        name: "METRON_SETTLEMENT_WALLET",
        status: "mismatch",
        message: `expected ${METRON_SETTLEMENT_WALLET}, got ${normalized}`,
      });
    } else {
      checks.push({ name: "METRON_SETTLEMENT_WALLET", status: "ok", message: METRON_SETTLEMENT_WALLET });
    }
  } else {
    checks.push({ name: "METRON_SETTLEMENT_WALLET", status: "ok", message: METRON_SETTLEMENT_WALLET });
  }

  const rawTag = env.CELO_ATTRIBUTION_TAG;
  const tag = rawTag === undefined ? METRON_ATTRIBUTION_TAG : rawTag;
  if (rawTag !== undefined && rawTag !== METRON_ATTRIBUTION_TAG) {
    checks.push({
      name: "CELO_ATTRIBUTION_TAG",
      status: "mismatch",
      message: `expected ${METRON_ATTRIBUTION_TAG}, got ${rawTag}`,
    });
  } else {
    checks.push({ name: "CELO_ATTRIBUTION_TAG", status: "ok", message: tag });
  }

  const rawFacilitator = env.X402_FACILITATOR_URL;
  const facilitatorUrl =
    rawFacilitator === undefined ? X402_FACILITATOR_URL : rawFacilitator;
  if (rawFacilitator !== undefined && rawFacilitator !== X402_FACILITATOR_URL) {
    checks.push({
      name: "X402_FACILITATOR_URL",
      status: "mismatch",
      message: `expected ${X402_FACILITATOR_URL}, got ${rawFacilitator}`,
    });
  } else {
    checks.push({ name: "X402_FACILITATOR_URL", status: "ok", message: facilitatorUrl });
  }

  const config: CeloConfig = {
    chainId,
    network,
    usdcAddress: getAddress(USDC_ADDRESS),
    usdcDecimals: USDC_DECIMALS,
    x402Scheme: X402_SCHEME,
    x402DashboardUrl: X402_DASHBOARD_URL,
    facilitatorUrl,
    settlementWallet: METRON_SETTLEMENT_WALLET,
    attributionTag: tag,
  };

  return { ok: checks.every((c) => c.status === "ok"), checks, config };
}

/**
 * Validated canonical config. Throws when a configured value contradicts
 * the canonical Mainnet constants. Never returns a guessed alternative.
 */
export function getCeloConfig(env: RawEnv = process.env): CeloConfig {
  const result = validateCeloConfig(env);
  if (!result.ok) {
    const problems = result.checks
      .filter((c) => c.status !== "ok")
      .map((c) => `${c.name}: ${c.message}`)
      .join("; ");
    throw new Error(`Celo config validation failed: ${problems}`);
  }
  return result.config;
}
