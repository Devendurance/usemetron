import { describe, expect, it } from "vitest";

import {
  ENV_NAMES,
  REQUIRED_ENV_VARS,
  SECRET_ENV_VARS,
  isRateLimitProxyTrusted,
  validateEnv,
} from "./env";
import { validateCanonicalProductionValues } from "./env/canonical";

/**
 * Every required variable set to a FORMAT-VALID value. Presence-only
 * fixtures (e.g. "configured" everywhere) now fail the format checks, so
 * this is the baseline that must pass cleanly.
 */
const validEnv = {
  DATABASE_URL: "postgresql://user:pass@host:5432/db",
  UPSTASH_REDIS_REST_URL: "https://upstash.example.com",
  UPSTASH_REDIS_REST_TOKEN: "token-123",
  SESSION_SECRET: "s".repeat(32),
  UPSTREAM_SECRET_ENCRYPTION_KEY: "a".repeat(64),
  NEXT_PUBLIC_APP_URL: "https://app.metron.dev",
  // Dummy hex project id — never a real .env value.
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "a".repeat(32),
  CELO_CHAIN_ID: "42220",
  CELO_NETWORK: "eip155:42220",
  CELO_USDC_ADDRESS: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
  CELO_RPC_URL: "https://forno.celo.org",
  X402_FACILITATOR_URL: "https://api.x402.celo.org",
  X402_API_KEY: "x402_live_secret_abc",
  METRON_SETTLEMENT_WALLET: "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa",
  CELO_ATTRIBUTION_TAG: "celo_91fed90b97fc",
} as const;

describe("validateEnv", () => {
  it("passes when every required variable is set with valid formats", () => {
    const result = validateEnv(validEnv);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it("reports missing required variables without throwing", () => {
    const result = validateEnv({});
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(REQUIRED_ENV_VARS);
  });

  it("treats empty strings as missing", () => {
    const result = validateEnv({ ...validEnv, DATABASE_URL: "" });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain(ENV_NAMES.DATABASE_URL);
  });

  it("never includes values in the per-variable report", () => {
    const result = validateEnv({ ...validEnv, X402_API_KEY: "super-secret-value" });
    const serialized = JSON.stringify(result.report);
    expect(serialized).not.toContain("super-secret-value");
    for (const item of result.report) {
      expect(item.hasValue).toBe(true);
      expect("value" in item).toBe(false);
    }
  });

  it("marks secrets as secret without exposing them", () => {
    expect(SECRET_ENV_VARS).toContain(ENV_NAMES.METRON_SETTLEMENT_PRIVATE_KEY);
    expect(SECRET_ENV_VARS).toContain(ENV_NAMES.X402_API_KEY);
    expect(REQUIRED_ENV_VARS).not.toContain(ENV_NAMES.METRON_SETTLEMENT_PRIVATE_KEY);
  });

  it("isolates public variables from the server set", () => {
    const result = validateEnv({
      ...validEnv,
      NEXT_PUBLIC_APP_URL: "https://app.metron.dev",
    });
    expect(result.ok).toBe(true);
    expect(result.values.NEXT_PUBLIC_APP_URL).toBe("https://app.metron.dev");
  });
});

describe("validateEnv format checks", () => {
  it("rejects a non-numeric CELO_CHAIN_ID", () => {
    const result = validateEnv({ ...validEnv, CELO_CHAIN_ID: "42x20" });
    expect(result.ok).toBe(false);
    expect(result.invalid).toContain(ENV_NAMES.CELO_CHAIN_ID);
  });

  it("rejects a CELO_NETWORK that is not eip155:{chainId}", () => {
    const result = validateEnv({ ...validEnv, CELO_NETWORK: "celo:42220" });
    expect(result.ok).toBe(false);
    expect(result.invalid).toContain(ENV_NAMES.CELO_NETWORK);
  });

  it("rejects malformed EVM addresses", () => {
    const badAddresses: Array<[string, string]> = [
      [ENV_NAMES.CELO_USDC_ADDRESS, "0x123"],
      [ENV_NAMES.CELO_USDC_ADDRESS, "cEBA9300f2b948710d2653dD7B07f33A8B32118C"], // no 0x prefix
      [ENV_NAMES.METRON_SETTLEMENT_WALLET, "0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"],
      [ENV_NAMES.METRON_SETTLEMENT_WALLET, "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcD"], // 39 hex
    ];
    for (const [name, bad] of badAddresses) {
      const result = validateEnv({ ...validEnv, [name]: bad });
      expect(result.ok).toBe(false);
      expect(result.invalid).toContain(name);
    }
  });

  it("rejects http CELO_RPC_URL and X402_FACILITATOR_URL", () => {
    for (const name of [ENV_NAMES.CELO_RPC_URL, ENV_NAMES.X402_FACILITATOR_URL]) {
      const result = validateEnv({ ...validEnv, [name]: "http://example.com" });
      expect(result.ok).toBe(false);
      expect(result.invalid).toContain(name);
    }
  });

  it("accepts http NEXT_PUBLIC_APP_URL only for localhost hosts", () => {
    const local = validateEnv({ ...validEnv, NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
    expect(local.ok).toBe(true);
    // IPv6 loopback: Node's WHATWG URL brackets the hostname ("[::1]").
    const ipv6 = validateEnv({ ...validEnv, NEXT_PUBLIC_APP_URL: "http://[::1]:3000" });
    expect(ipv6.ok).toBe(true);
    const remote = validateEnv({ ...validEnv, NEXT_PUBLIC_APP_URL: "http://app.metron.dev" });
    expect(remote.ok).toBe(false);
    expect(remote.invalid).toContain(ENV_NAMES.NEXT_PUBLIC_APP_URL);
  });

  it("accepts the canonical production NEXT_PUBLIC_APP_URL", () => {
    const result = validateEnv({
      ...validEnv,
      NEXT_PUBLIC_APP_URL: "https://usemetron.vercel.app",
    });
    expect(result.ok).toBe(true);
    expect(result.invalid).not.toContain(ENV_NAMES.NEXT_PUBLIC_APP_URL);
  });

  it("rejects a SESSION_SECRET shorter than 32 characters", () => {
    const short = validateEnv({ ...validEnv, SESSION_SECRET: "x".repeat(31) });
    expect(short.ok).toBe(false);
    expect(short.invalid).toContain(ENV_NAMES.SESSION_SECRET);
    const ok = validateEnv({ ...validEnv, SESSION_SECRET: "x".repeat(32) });
    expect(ok.ok).toBe(true);
  });

  it("accepts hex or base64 32-byte encryption keys and rejects malformed ones", () => {
    const hex = validateEnv({ ...validEnv, UPSTREAM_SECRET_ENCRYPTION_KEY: "a".repeat(64) });
    expect(hex.ok).toBe(true);
    // Dummy Base64-32-byte key (44 chars, decodes to exactly 32 bytes) — a
    // real production key must never appear in a tracked test fixture.
    const base64 = validateEnv({
      ...validEnv,
      UPSTREAM_SECRET_ENCRYPTION_KEY: "QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE=",
    });
    expect(base64.ok).toBe(true);
    for (const bad of ["not-a-key", "a".repeat(63), "a".repeat(65), "a".repeat(43)]) {
      const result = validateEnv({ ...validEnv, UPSTREAM_SECRET_ENCRYPTION_KEY: bad });
      expect(result.ok).toBe(false);
      expect(result.invalid).toContain(ENV_NAMES.UPSTREAM_SECRET_ENCRYPTION_KEY);
    }
  });

  it("rejects a malformed METRON_SETTLEMENT_PRIVATE_KEY when present and ignores it when absent", () => {
    const bad = validateEnv({ ...validEnv, METRON_SETTLEMENT_PRIVATE_KEY: "0xdeadbeef" });
    expect(bad.ok).toBe(false);
    expect(bad.invalid).toContain(ENV_NAMES.METRON_SETTLEMENT_PRIVATE_KEY);
    const ok = validateEnv({
      ...validEnv,
      METRON_SETTLEMENT_PRIVATE_KEY: "0x" + "ab".repeat(32),
    });
    expect(ok.ok).toBe(true);
  });

  it("rejects non-postgres DATABASE_URL and non-https UPSTASH_REDIS_REST_URL", () => {
    const mysql = validateEnv({ ...validEnv, DATABASE_URL: "mysql://host/db" });
    expect(mysql.ok).toBe(false);
    expect(mysql.invalid).toContain(ENV_NAMES.DATABASE_URL);
    const ftp = validateEnv({ ...validEnv, UPSTASH_REDIS_REST_URL: "ftp://example.com" });
    expect(ftp.ok).toBe(false);
    expect(ftp.invalid).toContain(ENV_NAMES.UPSTASH_REDIS_REST_URL);
    const ok = validateEnv({ ...validEnv, DATABASE_URL: "postgres://host:5432/db" });
    expect(ok.ok).toBe(true);
  });

  it("rejects an unparseable URL", () => {
    const result = validateEnv({ ...validEnv, CELO_RPC_URL: "not a url" });
    expect(result.ok).toBe(false);
    expect(result.invalid).toContain(ENV_NAMES.CELO_RPC_URL);
  });

  it("lists every format-invalid variable at once", () => {
    const result = validateEnv({
      ...validEnv,
      CELO_CHAIN_ID: "nope",
      CELO_NETWORK: "nope",
      SESSION_SECRET: "short",
    });
    expect(result.invalid).toEqual(
      expect.arrayContaining([
        ENV_NAMES.CELO_CHAIN_ID,
        ENV_NAMES.CELO_NETWORK,
        ENV_NAMES.SESSION_SECRET,
      ])
    );
  });

  it("reports format failures by name only, never the offending value", () => {
    const result = validateEnv({ ...validEnv, SESSION_SECRET: "tiny" });
    expect(result.ok).toBe(false);
    const serialized = JSON.stringify({ report: result.report, missing: result.missing, invalid: result.invalid });
    expect(serialized).not.toContain("tiny");
    expect(serialized).not.toContain("short");
  });
});

describe("validateCanonicalProductionValues", () => {
  const canonicalValid = {
    CELO_CHAIN_ID: "42220",
    CELO_NETWORK: "eip155:42220",
    CELO_USDC_ADDRESS: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
    METRON_SETTLEMENT_WALLET: "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa",
    CELO_ATTRIBUTION_TAG: "celo_91fed90b97fc",
    X402_FACILITATOR_URL: "https://api.x402.celo.org",
  };

  it("passes when configured values match the canonical production constants", () => {
    expect(validateCanonicalProductionValues(canonicalValid)).toEqual([]);
  });

  it("flags each canonical mismatch by name", () => {
    const invalid = validateCanonicalProductionValues({
      ...canonicalValid,
      CELO_CHAIN_ID: "44787",
      CELO_NETWORK: "eip155:44787",
    });
    expect(invalid).toEqual([ENV_NAMES.CELO_CHAIN_ID, ENV_NAMES.CELO_NETWORK]);
  });

  it("never includes values in canonical results", () => {
    const invalid = validateCanonicalProductionValues({
      CELO_ATTRIBUTION_TAG: "attacker_tag_000000",
      X402_FACILITATOR_URL: "https://evil.example.com",
    });
    expect(JSON.stringify(invalid)).not.toContain("attacker_tag_000000");
    expect(JSON.stringify(invalid)).not.toContain("evil.example.com");
  });

  it("ignores variables that are not set", () => {
    expect(validateCanonicalProductionValues({})).toEqual([]);
    expect(validateCanonicalProductionValues({ CELO_CHAIN_ID: undefined })).toEqual([]);
  });
});

describe("isRateLimitProxyTrusted", () => {
  it("is false when the variable is unset", () => {
    expect(isRateLimitProxyTrusted({})).toBe(false);
    expect(isRateLimitProxyTrusted(undefined)).toBe(false);
  });

  it('is true only for "true" / "1" (case-insensitive)', () => {
    expect(isRateLimitProxyTrusted({ RATE_LIMIT_TRUST_PROXY_HEADER: "true" })).toBe(true);
    expect(isRateLimitProxyTrusted({ RATE_LIMIT_TRUST_PROXY_HEADER: "TRUE" })).toBe(true);
    expect(isRateLimitProxyTrusted({ RATE_LIMIT_TRUST_PROXY_HEADER: "1" })).toBe(true);
  });

  it("is false for any other value", () => {
    expect(isRateLimitProxyTrusted({ RATE_LIMIT_TRUST_PROXY_HEADER: "false" })).toBe(false);
    expect(isRateLimitProxyTrusted({ RATE_LIMIT_TRUST_PROXY_HEADER: "0" })).toBe(false);
    expect(isRateLimitProxyTrusted({ RATE_LIMIT_TRUST_PROXY_HEADER: "yes" })).toBe(false);
    expect(isRateLimitProxyTrusted({ RATE_LIMIT_TRUST_PROXY_HEADER: "  " })).toBe(false);
  });

  it("is an optional variable, never required", () => {
    expect(REQUIRED_ENV_VARS).not.toContain(ENV_NAMES.RATE_LIMIT_TRUST_PROXY_HEADER);
    const result = validateEnv({ ...validEnv, RATE_LIMIT_TRUST_PROXY_HEADER: "true" });
    expect(result.ok).toBe(true);
    expect(result.values.RATE_LIMIT_TRUST_PROXY_HEADER).toBe("true");
  });
});
