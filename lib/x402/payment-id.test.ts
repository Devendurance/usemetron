import { describe, expect, it } from "vitest";

import { paymentIdentifierFor, type PaymentIdentity } from "./payment-id";

const IDENTITY: PaymentIdentity = {
  network: "eip155:42220",
  asset: "0xceba9300f2b948710d2653dd7b07f33a8b32118c",
  payer: "0xaae584e729eda3d3bb2ecb3b6fb8c1dc4a9e5f7b",
  nonceHex: "0x0000000000000000000000000000000000000000000000000000000000000001",
};

describe("paymentIdentifierFor", () => {
  it("is deterministic for the same authorization", () => {
    expect(paymentIdentifierFor(IDENTITY)).toBe(paymentIdentifierFor(IDENTITY));
  });

  it("differs across authorizations (payer or nonce)", () => {
    const otherNonce = paymentIdentifierFor({ ...IDENTITY, nonceHex: "0x0000000000000000000000000000000000000000000000000000000000000002" });
    const otherPayer = paymentIdentifierFor({ ...IDENTITY, payer: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });
    const otherNetwork = paymentIdentifierFor({ ...IDENTITY, network: "eip155:1" });

    expect(otherNonce).not.toBe(paymentIdentifierFor(IDENTITY));
    expect(otherPayer).not.toBe(paymentIdentifierFor(IDENTITY));
    expect(otherNetwork).not.toBe(paymentIdentifierFor(IDENTITY));
  });

  it("is case-insensitive on addresses (normalized identity)", () => {
    const upper = paymentIdentifierFor({
      ...IDENTITY,
      asset: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
      payer: "0xAaE584e729EDa3D3bB2eCb3b6Fb8C1dC4a9E5f7B",
    });
    expect(upper).toBe(paymentIdentifierFor(IDENTITY));
  });

  it("produces a 32-byte hex identifier with no secret/signature material", () => {
    const id = paymentIdentifierFor(IDENTITY);
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(id).not.toContain(IDENTITY.payer);
    expect(id).not.toContain("signature");
  });
});
