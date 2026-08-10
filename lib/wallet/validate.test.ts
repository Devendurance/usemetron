/**
 * Pure local tests for settlement wallet validation.
 *
 * Note: `lib/wallet/settlement-wallet.ts` is server-only and intentionally
 * has no test file; all testable logic lives here in `validate.ts`.
 */

import { describe, expect, it } from "vitest";

import { METRON_SETTLEMENT_WALLET } from "../celo/config";
import { assertRegisteredWalletMatches, validateWalletAddress } from "./validate";

const OTHER_ADDRESS = "0x0000000000000000000000000000000000000001";

describe("validateWalletAddress", () => {
  it("accepts the canonical registered address and returns its checksummed form", () => {
    const result = validateWalletAddress(METRON_SETTLEMENT_WALLET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.checksummed).toBe(METRON_SETTLEMENT_WALLET);
    }
  });

  it("rejects a too-short address", () => {
    expect(validateWalletAddress("0x123").ok).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(validateWalletAddress("").ok).toBe(false);
  });

  it("rejects a non-hex string", () => {
    expect(
      validateWalletAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG").ok
    ).toBe(false);
  });

  it("rejects an address without the 0x prefix", () => {
    expect(
      validateWalletAddress("21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa").ok
    ).toBe(false);
  });
});

describe("assertRegisteredWalletMatches", () => {
  it("treats missing configuration as the canonical fallback", () => {
    const result = assertRegisteredWalletMatches(undefined);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.checksummed).toBe(METRON_SETTLEMENT_WALLET);
    }
  });

  it("accepts the checksummed canonical address", () => {
    const result = assertRegisteredWalletMatches(METRON_SETTLEMENT_WALLET);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.checksummed).toBe(METRON_SETTLEMENT_WALLET);
    }
  });

  it("accepts the lowercase canonical address", () => {
    const result = assertRegisteredWalletMatches(
      METRON_SETTLEMENT_WALLET.toLowerCase()
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.checksummed).toBe(METRON_SETTLEMENT_WALLET);
    }
  });

  it("reports a mismatch for a different valid address", () => {
    const result = assertRegisteredWalletMatches(OTHER_ADDRESS);
    expect(result.status).toBe("mismatch");
  });

  it("reports invalid for a malformed address", () => {
    const result = assertRegisteredWalletMatches("0x123");
    expect(result.status).toBe("invalid");
  });
});
