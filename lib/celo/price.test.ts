import { describe, expect, it } from "vitest";

import {
  MIN_PRICE_MICRO_USDC,
  parseUsdcPrice,
  PriceValidationError,
  toMicroUsdc,
} from "./amounts";

describe("parseUsdcPrice (M2 endpoint pricing)", () => {
  it.each([
    ["0.001", 1000],
    ["0.005", 5000],
    ["0.01", 10000],
    ["1", 1000000],
    ["1.5", 1500000],
    ["0.999999", 999999],
    ["12.75", 12750000],
    [" 0.005 ", 5000],
  ])("accepts %s → %d micro-USDC", (input, expected) => {
    expect(parseUsdcPrice(input)).toBe(expected);
  });

  it("accepts exactly 6 decimal places", () => {
    expect(parseUsdcPrice("0.001001")).toBe(1001);
  });

  it("rejects more than 6 decimal places", () => {
    expect(() => parseUsdcPrice("0.0010001")).toThrow(PriceValidationError);
  });

  it("rejects zero and zero-like values", () => {
    expect(() => parseUsdcPrice("0")).toThrow(PriceValidationError);
    expect(() => parseUsdcPrice("0.0")).toThrow(PriceValidationError);
    expect(() => parseUsdcPrice("0.000000")).toThrow(PriceValidationError);
  });

  it("rejects negative values", () => {
    expect(() => parseUsdcPrice("-0.005")).toThrow(PriceValidationError);
    expect(() => parseUsdcPrice("-1")).toThrow(PriceValidationError);
  });

  it("rejects values below the 0.001 minimum", () => {
    expect(() => parseUsdcPrice("0.000999")).toThrow(PriceValidationError);
    expect(() => parseUsdcPrice("0.000001")).toThrow(PriceValidationError);
    expect(() => parseUsdcPrice("0.0009")).toThrow(PriceValidationError);
  });

  it("rejects malformed values", () => {
    for (const bad of ["", "abc", "1.", ".5", "1e3", "1E-3", "007", "+1", "1,5", "0x10", "Infinity", "NaN", "1.2.3"]) {
      expect(() => parseUsdcPrice(bad), `should reject ${JSON.stringify(bad)}`).toThrow(PriceValidationError);
    }
  });

  it("rejects unsupported scientific notation", () => {
    expect(() => parseUsdcPrice("1e-3")).toThrow(PriceValidationError);
    expect(() => parseUsdcPrice("1.5e2")).toThrow(PriceValidationError);
  });

  it("agrees with toMicroUsdc for valid canonical examples", () => {
    for (const [display, expected] of Object.entries({ "0.001": "1000", "0.005": "5000", "0.01": "10000" })) {
      expect(parseUsdcPrice(display)).toBe(Number(expected));
      expect(toMicroUsdc(display)).toBe(expected);
    }
  });

  it("exposes the canonical minimum", () => {
    expect(MIN_PRICE_MICRO_USDC).toBe(1000);
    expect(parseUsdcPrice("0.001")).toBe(MIN_PRICE_MICRO_USDC);
  });
});
