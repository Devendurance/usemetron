import { describe, expect, it } from "vitest";

import {
  CELO_CHAIN_ID as CONFIG_CHAIN_ID,
  CELO_NETWORK as CONFIG_NETWORK,
  METRON_ATTRIBUTION_TAG as CONFIG_TAG,
  METRON_SETTLEMENT_WALLET as CONFIG_WALLET,
  USDC_ADDRESS as CONFIG_USDC,
  X402_FACILITATOR_URL as CONFIG_FACILITATOR,
} from "../celo/config";
import {
  CANONICAL_PRODUCTION_VALUES,
  validateCanonicalProductionValues,
} from "./canonical";

const canonicalValid = {
  CELO_CHAIN_ID: "42220",
  CELO_NETWORK: "eip155:42220",
  CELO_USDC_ADDRESS: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  METRON_SETTLEMENT_WALLET: "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa",
  CELO_ATTRIBUTION_TAG: "celo_91fed90b97fc",
  X402_FACILITATOR_URL: "https://api.x402.celo.org",
};

describe("CANONICAL_PRODUCTION_VALUES", () => {
  it("matches the canonical constants in lib/celo/config", () => {
    expect(CANONICAL_PRODUCTION_VALUES.CELO_CHAIN_ID).toBe(String(CONFIG_CHAIN_ID));
    expect(CANONICAL_PRODUCTION_VALUES.CELO_NETWORK).toBe(CONFIG_NETWORK);
    expect(CANONICAL_PRODUCTION_VALUES.CELO_USDC_ADDRESS).toBe(CONFIG_USDC);
    expect(CANONICAL_PRODUCTION_VALUES.METRON_SETTLEMENT_WALLET).toBe(CONFIG_WALLET);
    expect(CANONICAL_PRODUCTION_VALUES.CELO_ATTRIBUTION_TAG).toBe(CONFIG_TAG);
    expect(CANONICAL_PRODUCTION_VALUES.X402_FACILITATOR_URL).toBe(CONFIG_FACILITATOR);
  });

  it("carries the exact Celo mainnet literals from the M11 hardening spec", () => {
    expect(CANONICAL_PRODUCTION_VALUES).toEqual(canonicalValid);
  });
});

describe("validateCanonicalProductionValues", () => {
  it("passes when configured values equal the canonical constants", () => {
    expect(validateCanonicalProductionValues(canonicalValid)).toEqual([]);
  });

  it("accepts any case variant of the canonical addresses", () => {
    const lowercased = validateCanonicalProductionValues({
      CELO_USDC_ADDRESS: "0xceba9300f2b948710d2653dd7b07f33a8b32118c",
      METRON_SETTLEMENT_WALLET: "0x21e5fc03e4305cc8cfb874253c6d66a8bdb0bcda",
    });
    expect(lowercased).toEqual([]);
  });

  it("flags every mismatch by name", () => {
    const invalid = validateCanonicalProductionValues({
      CELO_CHAIN_ID: "1",
      CELO_NETWORK: "eip155:1",
      CELO_USDC_ADDRESS: "0x0000000000000000000000000000000000000000",
      METRON_SETTLEMENT_WALLET: "0x0000000000000000000000000000000000000000",
      CELO_ATTRIBUTION_TAG: "some_other_tag",
      X402_FACILITATOR_URL: "https://evil.example.com",
    });
    expect(invalid).toEqual([
      "CELO_CHAIN_ID",
      "CELO_NETWORK",
      "CELO_USDC_ADDRESS",
      "METRON_SETTLEMENT_WALLET",
      "CELO_ATTRIBUTION_TAG",
      "X402_FACILITATOR_URL",
    ]);
  });

  it("never includes values in the result", () => {
    const invalid = validateCanonicalProductionValues({
      CELO_ATTRIBUTION_TAG: "attacker_tag_000000",
    });
    expect(JSON.stringify(invalid)).not.toContain("attacker_tag_000000");
  });

  it("checks only variables that are set", () => {
    expect(validateCanonicalProductionValues({})).toEqual([]);
    expect(validateCanonicalProductionValues({ CELO_CHAIN_ID: undefined })).toEqual([]);
  });
});
