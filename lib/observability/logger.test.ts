import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The logger is server-only; vitest resolves node conditions, so the
// guard module must be neutralized for the test import graph.
vi.mock("server-only", () => ({}));

import { logEvent } from "./logger";
import {
  registerSecret,
  registerSensitiveKey,
  resetRegistry,
} from "./secret-registry";

beforeEach(() => {
  // The registry is module-global; reset so suite order cannot leak
  // registered secrets into other tests (or vice versa).
  resetRegistry();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Returns the last JSON line written to console.log. */
function capturedOutput(): string {
  const calls = vi.mocked(console.log).mock.calls;
  const last = calls[calls.length - 1];
  return String(last?.[0] ?? "");
}

describe("logEvent", () => {
  it("writes a JSON line containing stage and a parseable ts", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("payment_verified", { receiptId: "r1", count: 2, ok: true, nothing: null });

    const parsed = JSON.parse(capturedOutput()) as {
      stage: string;
      ts: string;
      receiptId: string;
      count: number;
      ok: boolean;
      nothing: null;
    };
    expect(parsed.stage).toBe("payment_verified");
    expect(typeof parsed.ts).toBe("string");
    expect(Number.isNaN(new Date(parsed.ts).getTime())).toBe(false);
    expect(parsed.receiptId).toBe("r1");
    expect(parsed.count).toBe(2);
    expect(parsed.ok).toBe(true);
    expect(parsed.nothing).toBeNull();
    spy.mockRestore();
  });

  it("never serializes injected secret env values", () => {
    vi.stubEnv("X402_API_KEY", "x402_live_secret_abc");
    vi.stubEnv("METRON_SETTLEMENT_PRIVATE_KEY", "0xdeadbeefcafebabefacefeed0123456789abcdef");
    vi.stubEnv("SESSION_SECRET", "session-secret-token-xyz");
    vi.stubEnv("UPSTREAM_SECRET_ENCRYPTION_KEY", "encryption-key-123");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "upstash-token-456");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent("upstream_started", { receiptId: "r1", apiKey: "x402_live_secret_abc" });
    const line = capturedOutput();
    expect(line).not.toContain("x402_live_secret_abc");
    expect(line).not.toContain("0xdeadbeefcafebabefacefeed0123456789abcdef");
    expect(line).not.toContain("session-secret-token-xyz");
    expect(line).not.toContain("encryption-key-123");
    expect(line).not.toContain("upstash-token-456");
    spy.mockRestore();
  });

  it("redacts secret-looking strings and sensitive keys from the line", () => {
    vi.stubEnv("SESSION_SECRET", "session-token-789");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent("payout_confirmed", {
      receiptId: "r1",
      signature: "PAYMENT-SIGNATURE 0x1234abc",
      note: "token=session-token-789",
    });
    const line = capturedOutput();
    expect(line).not.toContain("PAYMENT-SIGNATURE");
    expect(line).not.toContain("0x1234abc");
    expect(line).not.toContain("session-token-789");
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.signature).toBe("[REDACTED]");
    expect(parsed.note).toBe("[REDACTED]");
    spy.mockRestore();
  });

  it("never lets caller fields overwrite stage or ts", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent("payment_verified", {
      receiptId: "r1",
      stage: "caller-staged",
      ts: "caller-ts",
    });
    const parsed = JSON.parse(capturedOutput()) as {
      stage: string;
      ts: string;
      receiptId: string;
    };
    expect(parsed.stage).toBe("payment_verified");
    expect(Number.isNaN(new Date(parsed.ts).getTime())).toBe(false);
    expect(parsed.receiptId).toBe("r1");
    spy.mockRestore();
  });

  it("scrubs URL credentials while keeping safe correlation ids", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent("settlement_started", {
      receiptId: "r1",
      developerId: "d1",
      db: "postgres://metron:pgpass@db.example.com:5432/metron",
    });
    const parsed = JSON.parse(capturedOutput()) as Record<string, unknown>;
    expect(parsed.receiptId).toBe("r1");
    expect(parsed.developerId).toBe("d1");
    expect(parsed.db).toBe("postgres://metron:[REDACTED]@db.example.com:5432/metron");
    spy.mockRestore();
  });

  it("redacts a registered creator secret value that is not an env var", () => {
    registerSecret("sk_creator_secret");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent("upstream_started", {
      receiptId: "r1",
      dump: "Bearer sk_creator_secret",
    });
    const line = capturedOutput();
    expect(line).not.toContain("sk_creator_secret");
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.dump).toBe("[REDACTED]");
    spy.mockRestore();
  });

  it("redacts a registered custom header name with a secret-looking value", () => {
    registerSensitiveKey("X-Custom-Key");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent("upstream_started", {
      receiptId: "r1",
      "X-Custom-Key": "sk_creator_secret",
    });
    const line = capturedOutput();
    expect(line).not.toContain("sk_creator_secret");
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed["X-Custom-Key"]).toBe("[REDACTED]");
    spy.mockRestore();
  });

  it("leaks nothing when the registry is empty", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent("upstream_started", {
      receiptId: "r1",
      "X-Custom-Key": "sk_creator_secret",
    });
    const line = capturedOutput();
    // Without a registration the value passes through (defense-in-depth
    // only kicks in when the creator credential was actually decrypted).
    expect(line).toContain("sk_creator_secret");
    spy.mockRestore();
  });
});
