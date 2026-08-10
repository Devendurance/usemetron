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
  /**
   * Explicit switch: only "true"/"1" lets the rate limiter trust the
   * X-Forwarded-For header (set it only when a trusted proxy strips
   * spoofable client-supplied values).
   */
  RATE_LIMIT_TRUST_PROXY_HEADER: "RATE_LIMIT_TRUST_PROXY_HEADER",
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
  [ENV_NAMES.RATE_LIMIT_TRUST_PROXY_HEADER]: optionalString,
  [ENV_NAMES.PAYOUTS_ENABLED]: optionalString,
  [ENV_NAMES.METRON_SETTLEMENT_WALLET]: optionalString,
  [ENV_NAMES.METRON_SETTLEMENT_PRIVATE_KEY]: optionalString,
  [ENV_NAMES.CELO_ATTRIBUTION_TAG]: optionalString,
});

export type EnvValues = z.infer<typeof envSchema>;

// --- Format checks (pure, dependency-free) ---------------------------------
//
// Minimal local validators for the few formats production needs to fail
// fast on: chain id, CAIP-2 network, EVM addresses, URL schemes, secret
// lengths, and hex/base64 key shapes. No viem, no server-only: this module
// stays importable from client-safe code.

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const CHAIN_ID_RE = /^\d+$/;
const CAIP2_NETWORK_RE = /^eip155:\d+$/;
const HEX64_RE = /^[0-9a-fA-F]{64}$/;
/** Base64 of exactly 32 bytes: 43 chars + one "=" padding. */
const BASE64_KEY32_RE = /^[A-Za-z0-9+/]{43}=$/;

function isUrlWithScheme(value: string, allowedSchemes: readonly string[]): boolean {
  try {
    return allowedSchemes.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Production app URL: https anywhere; http only for loopback hosts so local
 * development against `http://localhost` keeps validating. Note: Node's
 * WHATWG URL returns IPv6 hostnames WITH brackets (`"[::1]"`).
 */
function isAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:") {
      const host = url.hostname.toLowerCase();
      return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Encryption key: either 64 hex chars or Base64 of a 32-byte key.
 *
 * WARNING: the runtime consumer `loadUpstreamEncryptionKey`
 * (lib/crypto/upstream-secrets) REQUIRES the Base64-32-byte form —
 * `Buffer.from(value, "base64")` must decode to exactly 32 bytes. A 64-hex
 * key passes validation here but is rejected by the consumer (it decodes to
 * 48 bytes), so hex is accepted only for legacy compatibility and must not
 * be used for new deployments.
 */
function isEncryptionKey(value: string): boolean {
  return HEX64_RE.test(value) || BASE64_KEY32_RE.test(value);
}

/**
 * Per-variable format predicates. A variable is only checked when present
 * (undefined values are the presence check's job). Predicates return true
 * when the value is well-formed.
 */
const FORMAT_CHECKS: Readonly<Partial<Record<EnvName, (value: string) => boolean>>> = {
  [ENV_NAMES.CELO_CHAIN_ID]: (value) => CHAIN_ID_RE.test(value),
  [ENV_NAMES.CELO_NETWORK]: (value) => CAIP2_NETWORK_RE.test(value),
  [ENV_NAMES.CELO_USDC_ADDRESS]: (value) => EVM_ADDRESS_RE.test(value),
  [ENV_NAMES.METRON_SETTLEMENT_WALLET]: (value) => EVM_ADDRESS_RE.test(value),
  [ENV_NAMES.CELO_RPC_URL]: (value) => isUrlWithScheme(value, ["https:"]),
  [ENV_NAMES.X402_FACILITATOR_URL]: (value) => isUrlWithScheme(value, ["https:"]),
  [ENV_NAMES.NEXT_PUBLIC_APP_URL]: isAppUrl,
  [ENV_NAMES.DATABASE_URL]: (value) => isUrlWithScheme(value, ["postgres:", "postgresql:"]),
  [ENV_NAMES.UPSTASH_REDIS_REST_URL]: (value) => isUrlWithScheme(value, ["https:"]),
  [ENV_NAMES.SESSION_SECRET]: (value) => value.length >= 32,
  [ENV_NAMES.UPSTREAM_SECRET_ENCRYPTION_KEY]: isEncryptionKey,
  [ENV_NAMES.METRON_SETTLEMENT_PRIVATE_KEY]: (value) => PRIVATE_KEY_RE.test(value),
};

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
    const problems = [
      result.missing.length > 0 ? `missing ${result.missing.join(", ")}` : "",
      result.invalid.length > 0 ? `invalid ${result.invalid.join(", ")}` : "",
    ].filter(Boolean);
    super(`Environment validation failed: ${problems.join("; ")}`);
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

  // Format checks: fail fast on malformed values for the formats production
  // depends on. Only present values are checked; names only, never values.
  for (const name of Object.keys(FORMAT_CHECKS) as EnvName[]) {
    const value = values[name];
    if (value === undefined) continue;
    const check = FORMAT_CHECKS[name];
    if (check !== undefined && !check(value) && !invalid.includes(name)) {
      invalid.push(name);
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

/**
 * Parses the RATE_LIMIT_TRUST_PROXY_HEADER switch. Only "true" / "1"
 * (case-insensitive) enable trusting X-Forwarded-For; anything else
 * (including unset) keeps the rate limiter on the "untrusted" bucket.
 * Opt-in only: a spoofable header must never be trusted by default.
 */
export function isRateLimitProxyTrusted(
  source: Record<string, string | undefined> = process.env
): boolean {
  const raw = source[ENV_NAMES.RATE_LIMIT_TRUST_PROXY_HEADER]?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
