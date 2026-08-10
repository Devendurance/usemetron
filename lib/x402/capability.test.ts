/**
 * Unit tests for the pure x402 capability logic.
 *
 * The fixtures below are REAL payloads captured from the live Celo
 * facilitator on 2026-08-08 — they are test fixtures only and must never
 * become runtime fallbacks in production code.
 *
 * Quirk preserved from the live payload: the v1 kind advertises
 * `network: "celo"` (no CAIP-10 separator), which does not satisfy the
 * official `Network` template-literal type — cast here with an explanatory
 * comment, exactly as it appears on the wire.
 */

import { describe, expect, it } from "vitest";

import { expectSupportedCapability, findExpectedCapability } from "./capability";
import type { Network, SupportedKind, SupportedResponse } from "./types";

const realSupported: SupportedResponse = {
  kinds: [
    { x402Version: 2, scheme: "exact", network: "eip155:42220", extra: {} },
    {
      x402Version: 1,
      scheme: "exact",
      // Live payload quirk: "celo" is not a valid `Network` (no CAIP-10
      // separator); this is exactly what the facilitator sent.
      network: "celo" as unknown as Network,
    },
  ],
  extensions: [],
  signers: { "eip155:42220": ["0x0d74D5Cefd2e7F24E623330ebE3d8D4cB45fFB48"] },
};

const v1Kind: SupportedKind = realSupported.kinds[1];

describe("findExpectedCapability", () => {
  it("finds the x402 v2 / exact / eip155:42220 kind in the real fixture", () => {
    expect(findExpectedCapability(realSupported)).toEqual(realSupported.kinds[0]);
  });

  it("returns null when no kind matches", () => {
    expect(findExpectedCapability({ ...realSupported, kinds: [v1Kind] })).toBeNull();
  });
});

describe("expectSupportedCapability", () => {
  it("accepts the real fixture", () => {
    const result = expectSupportedCapability(realSupported);
    expect(result.ok).toBe(true);
    expect(result.kind).toEqual(realSupported.kinds[0]);
    expect(result.supportedKinds).toEqual(realSupported.kinds);
    expect(result.detail).toContain("eip155:42220");
  });

  it("rejects a payload with no x402 v2 kind", () => {
    const result = expectSupportedCapability({ ...realSupported, kinds: [v1Kind] });
    expect(result.ok).toBe(false);
    expect(result.kind).toBeNull();
    expect(result.detail).toContain("x402Version 2");
  });

  it("rejects a payload with no 'exact' scheme among v2 kinds", () => {
    const uptoKind: SupportedKind = { ...realSupported.kinds[0], scheme: "upto" };
    const result = expectSupportedCapability({
      ...realSupported,
      kinds: [uptoKind, v1Kind],
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBeNull();
    expect(result.detail).toContain("exact");
  });

  it("rejects a payload with no eip155:42220 network among v2 exact kinds", () => {
    const otherNetworkKind: SupportedKind = {
      ...realSupported.kinds[0],
      network: "eip155:111",
    };
    const result = expectSupportedCapability({
      ...realSupported,
      kinds: [otherNetworkKind, v1Kind],
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBeNull();
    expect(result.detail).toContain("eip155:42220");
  });

  it("rejects an empty kinds list without throwing", () => {
    expect(() =>
      expectSupportedCapability({ ...realSupported, kinds: [] })
    ).not.toThrow();

    const result = expectSupportedCapability({ ...realSupported, kinds: [] });
    expect(result.ok).toBe(false);
    expect(result.kind).toBeNull();
    expect(result.detail).toContain("no supported kinds");
  });
});
