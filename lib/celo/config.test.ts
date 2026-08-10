import { describe, expect, it } from "vitest";

import {
  CELO_CHAIN_ID,
  CELO_NETWORK,
  METRON_ATTRIBUTION_TAG,
  METRON_SETTLEMENT_WALLET,
  USDC_ADDRESS,
  USDC_DECIMALS,
  X402_DASHBOARD_URL,
  X402_FACILITATOR_URL,
  X402_SCHEME,
  getCeloConfig,
  validateCeloConfig,
} from "./config";

describe("canonical Celo Mainnet constants", () => {
  it("uses chain ID 42220 and CAIP-2 eip155:42220", () => {
    expect(CELO_CHAIN_ID).toBe(42220);
    expect(CELO_NETWORK).toBe("eip155:42220");
  });

  it("uses the canonical Celo Mainnet USDC contract with 6 decimals", () => {
    // Same address as 0xcEBA9300f2b948710d2653dD7B07f33A8B32118C, in EIP-55
    // checksummed form as normalized by viem.
    expect(USDC_ADDRESS).toBe("0xcebA9300f2b948710d2653dD7B07f33A8B32118C");
    expect(USDC_ADDRESS.toLowerCase()).toBe(
      "0xceba9300f2b948710d2653dd7b07f33a8b32118c"
    );
    expect(USDC_DECIMALS).toBe(6);
  });

  it("uses the exact scheme and the api. host as facilitator", () => {
    expect(X402_SCHEME).toBe("exact");
    expect(X402_FACILITATOR_URL).toBe("https://api.x402.celo.org");
    expect(X402_DASHBOARD_URL).toBe("https://x402.celo.org");
  });

  it("pins the registered settlement wallet and attribution tag", () => {
    expect(METRON_SETTLEMENT_WALLET).toBe("0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa");
    expect(METRON_ATTRIBUTION_TAG).toBe("celo_91fed90b97fc");
  });
});

describe("validateCeloConfig", () => {
  it("accepts matching configured values", () => {
    const result = validateCeloConfig({
      CELO_CHAIN_ID: "42220",
      CELO_NETWORK: "eip155:42220",
      CELO_USDC_ADDRESS: USDC_ADDRESS,
      METRON_SETTLEMENT_WALLET: METRON_SETTLEMENT_WALLET,
      CELO_ATTRIBUTION_TAG: METRON_ATTRIBUTION_TAG,
      X402_FACILITATOR_URL: X402_FACILITATOR_URL,
    });
    expect(result.ok).toBe(true);
  });

  it("falls back to canonical values when unset", () => {
    const result = validateCeloConfig({});
    expect(result.ok).toBe(true);
    expect(result.config.chainId).toBe(42220);
    expect(result.config.network).toBe("eip155:42220");
    expect(result.config.settlementWallet).toBe(METRON_SETTLEMENT_WALLET);
  });

  it("rejects a different chain id and network", () => {
    expect(validateCeloConfig({ CELO_CHAIN_ID: "44787" }).ok).toBe(false);
    expect(validateCeloConfig({ CELO_NETWORK: "eip155:44787" }).ok).toBe(false);
  });

  it("rejects a different USDC address", () => {
    const result = validateCeloConfig({
      CELO_USDC_ADDRESS: "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid configured settlement wallet and USDC address", () => {
    expect(validateCeloConfig({ METRON_SETTLEMENT_WALLET: "0x123" }).ok).toBe(false);
    expect(validateCeloConfig({ CELO_USDC_ADDRESS: "not-an-address" }).ok).toBe(false);
  });

  it("rejects a settlement wallet different from the registered wallet", () => {
    const result = validateCeloConfig({
      METRON_SETTLEMENT_WALLET: "0x0d74D5Cefd2e7F24E623330ebE3d8D4cB45fFB48",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-canonical facilitator URL", () => {
    const result = validateCeloConfig({ X402_FACILITATOR_URL: "https://x402.celo.org" });
    expect(result.ok).toBe(false);
  });

  it("getCeloConfig throws on mismatch and never returns a guessed alternative", () => {
    expect(() => getCeloConfig({ CELO_NETWORK: "eip155:11142220" })).toThrow(
      /Celo config validation failed/
    );
  });
});
