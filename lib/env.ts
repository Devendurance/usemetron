/**
 * Metron typed environment contract.
 *
 * Pure schema and parsers only: no side effects, no `process.env` reads at
 * import time. This module is importable from tests, server code, and the
 * foundation verification script.
 *
 * Sensitive variables are validated here by name/format only; their values
 * are never logged or printed.
 */

import { z } from "zod";

export const ENV_NAMES = {
  DATABASE_URL: "DATABASE_URL",
  UPSTASH_REDIS_REST_URL: "UPSTASH_REDIS_REST_URL",
  UPSTASH_REDIS_REST_TOKEN: "UPSTASH_REDIS_REST_TOKEN",
  SESSION_SECRET: "SESSION_SECRET",
  UPSTREAM_SECRET_ENCRYPTION_KEY: "UPSTREAM_SECRET_ENCRYPTION_KEY",
  NEXT_PUBLIC_APP_URL: "NEXT_PUBLIC_APP_URL",
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
  CELO_CHAIN_ID: "CELO_CHAIN_ID",
  CELO_NETWORK: "CELO_NETWORK",
  CELO_USDC_ADDRESS: "CELO_USDC_ADDRESS",
  CELO_RPC_URL: "CELO_RPC_URL",
  X402_FACILITATOR_URL: "X402_FACILITATOR_URL",
  X402_API_KEY: "X402_API_KEY",
  /** Explicit switch: settlement code refuses to call /settle unless "true". */
  X402_SETTLEMENT_ENABLED: "X402_SETTLEMENT_ENABLED",
  /** Explicit switch: payout code refuses to sign/broadcast unless "true". */
  PAYOUTS_ENABLED: "PAYOUTS_ENABLED",
  METRON_SETTLEMENT_WALLET: "METRON_SETTLEMENT_WALLET",
  METRON_SETTLEMENT_PRIVATE_KEY: "METRON_SETTLEMENT_PRIVATE_KEY",
  CELO_ATTRIBUTION_TAG: "CELO_ATTRIBUTION_TAG",
} as const;

export type EnvName = (typeof ENV_NAMES)[keyof typeof ENV_NAMES];

/**
 * Variables that must be present for production operation.
 *
 * METRON_SETTLEMENT_PRIVATE_KEY is intentionally excluded: a payout signer
 * may be added lazily at a later milestone.
 */
export const REQUIRED_ENV_VARS: readonly EnvName[] = [
  ENV_NAMES.DATABASE_URL,
  ENV_NAMES.UPSTASH_REDIS_REST_URL,
  ENV_NAMES.UPSTASH_REDIS_REST_TOKEN,
  ENV_NAMES.SESSION_SECRET,
  ENV_NAMES.UPSTREAM_SECRET_ENCRYPTION_KEY,
  ENV_NAMES.NEXT_PUBLIC_APP_URL,
  ENV_NAMES.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  ENV_NAMES.CELO_CHAIN_ID,
  ENV_NAMES.CELO_NETWORK,
  ENV_NAMES.CELO_USDC_ADDRESS,
  ENV_NAMES.CELO_RPC_URL,
  ENV_NAMES.X402_FACILITATOR_URL,
  ENV_NAMES.X402_API_KEY,
  ENV_NAMES.METRON_SETTLEMENT_WALLET,
  ENV_NAMES.CELO_ATTRIBUTION_TAG,
];

/** Variables safe to reference in browser bundles. */
export const PUBLIC_ENV_VARS: readonly EnvName[] = [
  ENV_NAMES.NEXT_PUBLIC_APP_URL,
  ENV_NAMES.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
];

/** Variables whose values must never be printed or logged. */
export const SECRET_ENV_VARS: readonly EnvName[] = [
  ENV_NAMES.UPSTASH_REDIS_REST_TOKEN,
  ENV_NAMES.SESSION_SECRET,
  ENV_NAMES.UPSTREAM_SECRET_ENCRYPTION_KEY,
  ENV_NAMES.X402_API_KEY,
  ENV_NAMES.METRON_SETTLEMENT_PRIVATE_KEY,
];

/** Treat empty strings as absent. */
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional()
);

export const envSchema = z.object({
  [ENV_NAMES.DATABASE_URL]: optionalString,
  [ENV_NAMES.UPSTASH_REDIS_REST_URL]: optionalString,
  [ENV_NAMES.UPSTASH_REDIS_REST_TOKEN]: optionalString,
  [ENV_NAMES.SESSION_SECRET]: optionalString,
  [ENV_NAMES.UPSTREAM_SECRET_ENCRYPTION_KEY]: optionalString,
  [ENV_NAMES.NEXT_PUBLIC_APP_URL]: optionalString,
  [ENV_NAMES.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID]: optionalString,
  [ENV_NAMES.CELO_CHAIN_ID]: optionalString,
  [ENV_NAMES.CELO_NETWORK]: optionalString,
  [ENV_NAMES.CELO_USDC_ADDRESS]: optionalString,
  [ENV_NAMES.CELO_RPC_URL]: optionalString,
  [ENV_NAMES.X402_FACILITATOR_URL]: optionalString,
  [ENV_NAMES.X402_API_KEY]: optionalString,
  [ENV_NAMES.X402_SETTLEMENT_ENABLED]: optionalString,
  [ENV_NAMES.PAYOUTS_ENABLED]: optionalString,
  [ENV_NAMES.METRON_SETTLEMENT_WALLET]: optionalString,
  [ENV_NAMES.METRON_SETTLEMENT_PRIVATE_KEY]: optionalString,
  [ENV_NAMES.CELO_ATTRIBUTION_TAG]: optionalString,
});

export type EnvValues = z.infer<typeof envSchema>;

export type EnvVarStatus = {
  name: EnvName;
  status: "configured" | "missing";
  /** Present only when status is "configured". Never printed by callers. */
  hasValue: boolean;
};

export type EnvValidationResult = {
  ok: boolean;
  values: EnvValues;
  /** Required variables that are not set. */
  missing: EnvName[];
  /** Variables present but failing format validation. */
  invalid: EnvName[];
  report: EnvVarStatus[];
};

export class EnvValidationError extends Error {
  constructor(readonly result: EnvValidationResult) {
    super(`Environment validation failed: missing ${result.missing.join(", ")}`);
    this.name = "EnvValidationError";
  }
}

/**
 * Validates a raw environment record without reading `process.env`.
 * Values are never included in the result beyond their presence status.
 */
export function validateEnv(
  source: Record<string, string | undefined>
): EnvValidationResult {
  const parsed = envSchema.safeParse(source);
  const values: EnvValues = parsed.success ? parsed.data : ({} as EnvValues);

  const report: EnvVarStatus[] = [];
  const missing: EnvName[] = [];
  const invalid: EnvName[] = [];

  for (const name of REQUIRED_ENV_VARS) {
    const value = values[name];
    if (value === undefined) {
      missing.push(name);
      report.push({ name, status: "missing", hasValue: false });
    } else {
      report.push({ name, status: "configured", hasValue: true });
    }
  }

  if (parsed.success === false) {
    for (const issue of parsed.error.issues) {
      if (issue.path.length > 0) {
        invalid.push(String(issue.path[0]) as EnvName);
      }
    }
  }

  return {
    ok: missing.length === 0 && invalid.length === 0,
    values,
    missing,
    invalid,
    report,
  };
}

/** Client-safe accessor for the NEXT_PUBLIC_* subset of the environment. */
export function getPublicEnvValues(source: Record<string, string | undefined> = process.env) {
  return {
    appUrl: source[ENV_NAMES.NEXT_PUBLIC_APP_URL] ?? "",
    walletConnectProjectId: source[ENV_NAMES.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID] ?? "",
  };
}

/**
 * Parses the X402_SETTLEMENT_ENABLED switch. Only the explicit values
 * "true" / "1" (case-insensitive) enable settlement; anything else
 * (including unset) disables it. Server-side money gate.
 */
export function isSettlementEnabled(
  source: Record<string, string | undefined> = process.env
): boolean {
  const raw = source[ENV_NAMES.X402_SETTLEMENT_ENABLED]?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * Parses the PAYOUTS_ENABLED switch. Only "true" / "1" enable payout
 * signing/broadcasting; anything else refuses before any signer or
 * transaction is touched. Server-side money gate.
 */
export function isPayoutsEnabled(
  source: Record<string, string | undefined> = process.env
): boolean {
  const raw = source[ENV_NAMES.PAYOUTS_ENABLED]?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
