import { encodePaymentSignatureHeader } from "@x402/core/http";
import { describe, expect, it } from "vitest";

import { CELO_NETWORK, METRON_SETTLEMENT_WALLET, USDC_ADDRESS } from "../celo/config";
import { buildPaymentRequirements } from "./requirements";
import {
  authorizationDeadline,
  decodePaymentSignature,
  extractPaymentIdentity,
  PaymentSignatureError,
  validatePayloadAgainstRequirements,
} from "./payload";
import type { Network, PaymentPayload } from "./types";

const RESOURCE_URL = "http://localhost:3126/p/abc123/translate?q=en";

const REQUIREMENTS = buildPaymentRequirements({
  priceMicroUsdc: 5000,
  resourceUrl: RESOURCE_URL,
});

const VALID_AUTHORIZATION = {
  from: "0xAaE584e729EDa3D3bB2eCb3b6Fb8C1dC4a9E5f7B",
  to: METRON_SETTLEMENT_WALLET,
  value: "5000",
  validAfter: "0",
  validBefore: "9999999999",
  nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
};

function makePayload(overrides: {
  x402Version?: number;
  scheme?: string;
  network?: string;
  amount?: string;
  asset?: string;
  payTo?: string;
  resourceUrl?: string;
  payload?: Record<string, unknown>;
}): PaymentPayload {
  return {
    x402Version: overrides.x402Version ?? 2,
    resource:
      "resourceUrl" in overrides && overrides.resourceUrl === undefined
        ? undefined
        : { url: overrides.resourceUrl ?? RESOURCE_URL },
    accepted: {
      scheme: overrides.scheme ?? REQUIREMENTS.scheme,
      network: (overrides.network ?? REQUIREMENTS.network) as Network,
      amount: overrides.amount ?? REQUIREMENTS.amount,
      asset: overrides.asset ?? REQUIREMENTS.asset,
      payTo: overrides.payTo ?? REQUIREMENTS.payTo,
      maxTimeoutSeconds: REQUIREMENTS.maxTimeoutSeconds,
      extra: { ...REQUIREMENTS.extra },
    },
    payload:
      overrides.payload ??
      ({
        authorization: { ...VALID_AUTHORIZATION },
      } as Record<string, unknown>),
  };
}

function encode(payload: PaymentPayload): string {
  return encodePaymentSignatureHeader(payload);
}

describe("decodePaymentSignature", () => {
  it("decodes a valid V2 exact payload", () => {
    const decoded = decodePaymentSignature(encode(makePayload({})));
    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepted.amount).toBe("5000");
  });

  it("rejects malformed Base64 and invalid JSON", () => {
    expect(() => decodePaymentSignature("not-base64!!")).toThrow(PaymentSignatureError);
    expect(() => decodePaymentSignature("eyJ4NDAy")).toThrow(PaymentSignatureError);
  });

  it("rejects unsupported x402 versions", () => {
    expect(() => decodePaymentSignature(encode(makePayload({ x402Version: 1 })))).toThrow(
      PaymentSignatureError
    );
  });

  it("rejects unsupported schemes and networks", () => {
    expect(() => decodePaymentSignature(encode(makePayload({ scheme: "upto" })))).toThrow(
      PaymentSignatureError
    );
    expect(() =>
      decodePaymentSignature(encode(makePayload({ network: "eip155:11142220" })))
    ).toThrow(PaymentSignatureError);
  });

  it("rejects payloads that are not exact-EVM shaped", () => {
    expect(() =>
      decodePaymentSignature(encode(makePayload({ payload: { random: true } as never })))
    ).toThrow(PaymentSignatureError);
  });

  it("never accepts legacy X-PAYMENT as the canonical path", () => {
    // The decoder only understands PAYMENT-SIGNATURE V2 values; a V1
    // X-PAYMENT-style body must fail.
    expect(() => decodePaymentSignature("bnVsbA==")).toThrow(PaymentSignatureError);
  });
});

describe("extractPaymentIdentity", () => {
  it("derives network + asset + payer + 32-byte nonce", () => {
    const identity = extractPaymentIdentity(makePayload({}));
    expect(identity.network).toBe(CELO_NETWORK);
    expect(identity.asset).toBe(USDC_ADDRESS.toLowerCase());
    expect(identity.payer).toBe(VALID_AUTHORIZATION.from.toLowerCase());
    expect(identity.nonceHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(identity.nonceHex).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000001"
    );
  });

  it("extracts a Permit2 nonce as 32-byte hex", () => {
    const payload = makePayload({
      payload: {
        signature: "0x00",
        permit2Authorization: {
          from: VALID_AUTHORIZATION.from,
          permitted: { token: USDC_ADDRESS, amount: "5000" },
          spender: "0x0000000000000000000000000000000000000000",
          nonce: "42",
          deadline: "9999999999",
          witness: { to: METRON_SETTLEMENT_WALLET, validAfter: "0" },
        },
      },
    });
    const identity = extractPaymentIdentity(payload);
    expect(identity.nonceHex).toBe(
      "0x000000000000000000000000000000000000000000000000000000000000002a"
    );
  });

  it("exposes the authorization deadline", () => {
    expect(authorizationDeadline(makePayload({}))).toBe(9999999999);
    const noDeadline = makePayload({
      payload: { authorization: { ...VALID_AUTHORIZATION, validBefore: "abc" } },
    });
    expect(Number.isFinite(authorizationDeadline(noDeadline) ?? NaN)).toBe(false);
  });
});

describe("validatePayloadAgainstRequirements", () => {
  it("accepts a payload bound to this route", () => {
    const issues = validatePayloadAgainstRequirements(
      makePayload({}),
      REQUIREMENTS,
      RESOURCE_URL
    );
    expect(issues).toEqual([]);
  });

  it("rejects a caller-changed amount", () => {
    const issues = validatePayloadAgainstRequirements(
      makePayload({ amount: "1" }),
      REQUIREMENTS,
      RESOURCE_URL
    );
    expect(issues).toContain("amount");
  });

  it("rejects a caller-changed asset", () => {
    const issues = validatePayloadAgainstRequirements(
      makePayload({ asset: "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e" }),
      REQUIREMENTS,
      RESOURCE_URL
    );
    expect(issues).toContain("asset");
  });

  it("rejects a caller-changed payTo", () => {
    const issues = validatePayloadAgainstRequirements(
      makePayload({ payTo: "0x0000000000000000000000000000000000000001" }),
      REQUIREMENTS,
      RESOURCE_URL
    );
    expect(issues).toContain("payTo");
  });

  it("rejects a caller-changed scheme or network", () => {
    expect(
      validatePayloadAgainstRequirements(makePayload({ scheme: "upto" }), REQUIREMENTS, RESOURCE_URL)
    ).toContain("scheme");
    expect(
      validatePayloadAgainstRequirements(makePayload({ network: "eip155:1" }), REQUIREMENTS, RESOURCE_URL)
    ).toContain("network");
  });

  it("rejects a missing or mismatched resource URL", () => {
    expect(
      validatePayloadAgainstRequirements(makePayload({ resourceUrl: undefined }), REQUIREMENTS, RESOURCE_URL)
    ).toContain("resource_missing");
    expect(
      validatePayloadAgainstRequirements(
        makePayload({ resourceUrl: "http://localhost:3126/p/OTHERROUTE" }),
        REQUIREMENTS,
        RESOURCE_URL
      )
    ).toContain("resource_mismatch");
  });
});
