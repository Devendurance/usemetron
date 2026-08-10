import { describe, expect, it } from "vitest";

import { AMOUNT_EXAMPLES, fromMicroUsdc, toMicroUsdc } from "./amounts";

describe("toMicroUsdc (decimal → integer base units, string math only)", () => {
  it.each(Object.entries(AMOUNT_EXAMPLES))(
    "converts %s USDC to %s base units",
    (display, expected) => {
      expect(toMicroUsdc(display)).toBe(expected);
    }
  );

  it("handles whole and large amounts", () => {
    expect(toMicroUsdc("1")).toBe("1000000");
    expect(toMicroUsdc("2.5")).toBe("2500000");
    expect(toMicroUsdc("0.000001")).toBe("1");
  });

  it("truncates excess precision instead of rounding", () => {
    expect(toMicroUsdc("0.0000019")).toBe("1");
  });

  it("rejects negative, empty, and non-numeric input", () => {
    expect(() => toMicroUsdc("-1")).toThrow();
    expect(() => toMicroUsdc("")).toThrow();
    expect(() => toMicroUsdc("abc")).toThrow();
    expect(() => toMicroUsdc("1.2.3")).toThrow();
  });

  it("never uses floating point (result is always an integer string)", () => {
    const result = toMicroUsdc("0.1");
    expect(/^[0-9]+$/.test(result)).toBe(true);
    expect(result).toBe("100000");
  });
});

describe("fromMicroUsdc (integer base units → decimal string)", () => {
  it("round-trips PRD examples", () => {
    expect(fromMicroUsdc("1000")).toBe("0.001");
    expect(fromMicroUsdc("5000")).toBe("0.005");
    expect(fromMicroUsdc("10000")).toBe("0.01");
  });

  it("round-trips whole amounts and large values", () => {
    expect(fromMicroUsdc("1000000")).toBe("1");
    expect(fromMicroUsdc("123456789")).toBe("123.456789");
  });

  it("rejects invalid input", () => {
    expect(() => fromMicroUsdc("1.5")).toThrow();
    expect(() => fromMicroUsdc("")).toThrow();
  });
});

describe("round trips", () => {
  it("toMicroUsdc(fromMicroUsdc(x)) === x for representative values", () => {
    for (const value of ["0.001", "0.005", "0.01", "0.25", "12.75", "999.999999"]) {
      expect(toMicroUsdc(fromMicroUsdc(toMicroUsdc(value)))).toBe(toMicroUsdc(value));
    }
  });
});
