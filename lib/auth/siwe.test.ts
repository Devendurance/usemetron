import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { parseSiweMessage } from "viem/siwe";

import { CELO_CHAIN_ID } from "../celo/config";
import {
  buildSiweMessage,
  SIWE_EXPIRATION_MINUTES,
  SIWE_STATEMENT,
  validateSiweMessageFields,
  type SiweContext,
} from "./siwe";

const CONTEXT: SiweContext = { domain: "app.metron.dev", uri: "https://app.metron.dev" };
const ADDRESS = getAddress("0xA0Cf798816D4b9b9866b5330EEa46a18382f251e");
const NONCE = "abcdefghijklmnop";
const ISSUED_AT = new Date("2026-01-01T00:00:00.000Z");

const EXPECTED = {
  domain: CONTEXT.domain,
  uri: CONTEXT.uri,
  chainId: CELO_CHAIN_ID,
  nonce: NONCE,
};

function buildValidMessage() {
  return buildSiweMessage({ address: ADDRESS, nonce: NONCE, issuedAt: ISSUED_AT, context: CONTEXT });
}

describe("buildSiweMessage", () => {
  it("produces a complete EIP-4361 message with all required fields", () => {
    const message = buildValidMessage();

    expect(message).toContain(
      `${CONTEXT.domain} wants you to sign in with your Ethereum account:\n${ADDRESS}`
    );

    const parsed = parseSiweMessage(message);
    expect(parsed.domain).toBe(CONTEXT.domain);
    expect(parsed.uri).toBe(CONTEXT.uri);
    expect(parsed.statement).toBe(SIWE_STATEMENT);
    expect(parsed.address).toBe(ADDRESS);
    expect(parsed.version).toBe("1");
    expect(parsed.chainId).toBe(CELO_CHAIN_ID);
    expect(parsed.nonce).toBe(NONCE);
    expect(parsed.issuedAt?.toISOString()).toBe(ISSUED_AT.toISOString());
  });

  it("sets expiration time to issuedAt + 5 minutes", () => {
    const parsed = parseSiweMessage(buildValidMessage());

    expect(SIWE_EXPIRATION_MINUTES).toBe(5);
    expect(parsed.expirationTime?.getTime()).toBe(
      ISSUED_AT.getTime() + SIWE_EXPIRATION_MINUTES * 60_000
    );
  });
});

describe("validateSiweMessageFields", () => {
  it("accepts a message built by buildSiweMessage", () => {
    const result = validateSiweMessageFields(buildValidMessage(), {
      ...EXPECTED,
      // Fixed ISSUED_AT is in the past relative to the real clock; inject
      // a validation time inside the message's validity window.
      now: new Date(ISSUED_AT.getTime() + 60_000),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.nonce).toBe(NONCE);
      expect(result.parsed.address).toBe(ADDRESS);
    }
  });

  it("rejects a message for the wrong chain id", () => {
    const message = buildValidMessage().replace(
      `Chain ID: ${CELO_CHAIN_ID}`,
      "Chain ID: 11142220"
    );

    const result = validateSiweMessageFields(message, EXPECTED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).toContain("chainId");
    }
  });

  it("rejects a message for the wrong domain", () => {
    const message = buildValidMessage().replace(
      `${CONTEXT.domain} wants`,
      "evil.example.com wants"
    );

    const result = validateSiweMessageFields(message, EXPECTED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).toContain("domain");
    }
  });

  it("rejects a message for the wrong uri", () => {
    const message = buildValidMessage().replace(
      `URI: ${CONTEXT.uri}`,
      "URI: https://evil.example.com"
    );

    const result = validateSiweMessageFields(message, EXPECTED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).toContain("uri");
    }
  });

  it("rejects an expired message (expirationTime in the past)", () => {
    const expired = buildSiweMessage({
      address: ADDRESS,
      nonce: NONCE,
      issuedAt: new Date(Date.now() - 10 * 60_000),
      context: CONTEXT,
    });

    const result = validateSiweMessageFields(expired, EXPECTED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).toContain("expirationTime");
    }
  });

  it("rejects a message with a non-matching nonce", () => {
    const result = validateSiweMessageFields(buildValidMessage(), {
      ...EXPECTED,
      nonce: "zzzzzzzzzzzzzz",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).toContain("nonce");
    }
  });

  it("rejects a message with version 2", () => {
    const message = buildValidMessage().replace("Version: 1", "Version: 2");

    const result = validateSiweMessageFields(message, EXPECTED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).toContain("version");
    }
  });

  it("rejects a missing expiration time", () => {
    const message = buildValidMessage().replace(/\nExpiration Time: .+$/, "");

    const result = validateSiweMessageFields(message, EXPECTED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).toContain("expirationTime");
    }
  });

  it("rejects a malformed message that is not SIWE", () => {
    const result = validateSiweMessageFields("this is not a siwe message", EXPECTED);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).toContain("address");
    }
  });

  it("rejects a message with an invalid embedded address", () => {
    const message = buildValidMessage().replace(ADDRESS, "0x123");

    const result = validateSiweMessageFields(message, EXPECTED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.field)).toContain("address");
    }
  });
});
