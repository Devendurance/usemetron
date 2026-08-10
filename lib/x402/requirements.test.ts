import { describe, expect, it } from "vitest";

import {
  CELO_NETWORK,
  METRON_SETTLEMENT_WALLET,
  USDC_ADDRESS,
  X402_SCHEME,
} from "../celo/config";
import {
  buildPaymentRequirements,
  buildPaymentRequired,
  MAX_TIMEOUT_SECONDS,
  USDC_EIP712_EXTRA,
} from "./requirements";

describe("buildPaymentRequirements", () => {
  it("represents the exact Celo Mainnet USDC requirement", () => {
    const requirement = buildPaymentRequirements({
      priceMicroUsdc: 5000,
      resourceUrl: "http://localhost:3000/p/abc123/translate?q=en",
    });

    expect(requirement.scheme).toBe(X402_SCHEME);
    expect(requirement.scheme).toBe("exact");
    expect(requirement.network).toBe(CELO_NETWORK);
    expect(requirement.network).toBe("eip155:42220");
    expect(requirement.amount).toBe("5000");
    expect(requirement.asset).toBe(USDC_ADDRESS);
    expect(requirement.asset.toLowerCase()).toBe(
      "0xceba9300f2b948710d2653dd7b07f33a8b32118c"
    );
    expect(requirement.payTo).toBe(METRON_SETTLEMENT_WALLET);
    expect(requirement.payTo).toBe("0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa");
    expect(requirement.maxTimeoutSeconds).toBe(MAX_TIMEOUT_SECONDS);
    expect(requirement.maxTimeoutSeconds).toBeGreaterThan(0);
    expect(requirement.extra).toEqual(USDC_EIP712_EXTRA);
    expect(requirement.extra).toEqual({ name: "USDC", version: "2" });
  });

  it("uses the persisted integer amount as a string (no floats)", () => {
    expect(buildPaymentRequirements({ priceMicroUsdc: 10000, resourceUrl: "u" }).amount).toBe("10000");
    expect(buildPaymentRequirements({ priceMicroUsdc: 1000, resourceUrl: "u" }).amount).toBe("1000");
  });

  it("route A's price cannot affect route B's requirement", () => {
    const a = buildPaymentRequirements({ priceMicroUsdc: 5000, resourceUrl: "http://x/p/a" });
    const b = buildPaymentRequirements({ priceMicroUsdc: 10000, resourceUrl: "http://x/p/b" });
    expect(a.amount).toBe("5000");
    expect(b.amount).toBe("10000");
    expect(a.amount).not.toBe(b.amount);
    // All other canonical fields are identical.
    expect(a.scheme).toBe(b.scheme);
    expect(a.network).toBe(b.network);
    expect(a.asset).toBe(b.asset);
    expect(a.payTo).toBe(b.payTo);
  });

  it("rejects non-positive or non-integer prices", () => {
    expect(() =>
      buildPaymentRequirements({ priceMicroUsdc: 0, resourceUrl: "u" })
    ).toThrow();
    expect(() =>
      buildPaymentRequirements({ priceMicroUsdc: -5, resourceUrl: "u" })
    ).toThrow();
    expect(() =>
      buildPaymentRequirements({ priceMicroUsdc: 1.5, resourceUrl: "u" })
    ).toThrow();
  });
});

describe("buildPaymentRequired", () => {
  it("produces a valid V2 PaymentRequired object", () => {
    const resourceUrl = "http://localhost:3000/p/abc123/translate?q=en";
    const required = buildPaymentRequired({ priceMicroUsdc: 5000, resourceUrl });

    expect(required.x402Version).toBe(2);
    expect(required.resource.url).toBe(resourceUrl);
    expect(required.accepts).toHaveLength(1);
    expect(required.accepts[0]?.amount).toBe("5000");
  });

  it("carries the requested resource URL (path + query preserved)", () => {
    const required = buildPaymentRequired({
      priceMicroUsdc: 1000,
      resourceUrl: "https://metron.example/p/xyz123/deep/path?q=1&r=2",
    });
    expect(required.resource.url).toBe(
      "https://metron.example/p/xyz123/deep/path?q=1&r=2"
    );
  });

  it("round-trips through the official header encoder", async () => {
    const { encodePaymentRequiredHeader, decodePaymentRequiredHeader } = await import(
      "@x402/core/http"
    );
    const required = buildPaymentRequired({
      priceMicroUsdc: 10000,
      resourceUrl: "http://localhost:3000/p/abc123",
    });
    const header = encodePaymentRequiredHeader(required);
    const decoded = decodePaymentRequiredHeader(header);

    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepts[0]?.amount).toBe("10000");
    expect(decoded.accepts[0]?.network).toBe("eip155:42220");
    expect(decoded.accepts[0]?.payTo).toBe(METRON_SETTLEMENT_WALLET);
    expect(decoded.resource.url).toBe("http://localhost:3000/p/abc123");
  });
});
