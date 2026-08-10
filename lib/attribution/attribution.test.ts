/**
 * Pure local tests for attribution suffix generation/decoding.
 * No onchain transactions are performed.
 */

import { describe, expect, it } from "vitest";

import {
  buildAttributionDataSuffix,
  containsMetronTag,
  decodeAttributionData,
  METRON_ATTRIBUTION_TAG,
} from "./attribution";

describe("buildAttributionDataSuffix", () => {
  it("produces a hex string", () => {
    const suffix = buildAttributionDataSuffix();
    expect(typeof suffix).toBe("string");
    expect(suffix.startsWith("0x")).toBe(true);
    expect(/^0x[0-9a-fA-F]+$/.test(suffix)).toBe(true);
  });

  it("round-trips the Metron tag alone", () => {
    const decoded = decodeAttributionData(buildAttributionDataSuffix());
    expect(decoded).not.toBeNull();
    expect(decoded?.codes).toEqual([METRON_ATTRIBUTION_TAG]);
    expect(containsMetronTag(decoded?.codes ?? [])).toBe(true);
  });

  it("preserves extra codes alongside the Metron tag", () => {
    const decoded = decodeAttributionData(
      buildAttributionDataSuffix(["existing_code_123"])
    );
    expect(decoded).not.toBeNull();
    expect(decoded?.codes).toContain("existing_code_123");
    expect(decoded?.codes).toContain(METRON_ATTRIBUTION_TAG);
  });
});

describe("decodeAttributionData", () => {
  it("returns null for garbage", () => {
    expect(decodeAttributionData("0x1234")).toBeNull();
  });

  it("returns null for an empty hex value", () => {
    expect(decodeAttributionData("0x")).toBeNull();
  });

  it("returns null for a non-attribution hex payload", () => {
    expect(decodeAttributionData("0xdeadbeef")).toBeNull();
  });
});
