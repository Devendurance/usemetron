/**
 * USDC amount representation helpers.
 *
 * Authoritative amounts are integer base units (micro-USDC, 6 decimals)
 * represented as strings at protocol boundaries. JavaScript floating point
 * is never used for pricing, earnings, or comparisons.
 */

import { USDC_DECIMALS } from "./config";

const MAX_BASE_UNITS = BigInt("9007199254740991"); // Number.MAX_SAFE_INTEGER

function normalizeParts(amount: string): { integer: string; fraction: string } {
  const trimmed = amount.trim();
  if (trimmed === "") {
    throw new Error(`Invalid amount: empty string`);
  }
  if (!/^[0-9]+(\.[0-9]*)?$/.test(trimmed)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const [integer, fraction = ""] = trimmed.split(".");
  return { integer: integer.replace(/^0+(?=\d)/, "") || "0", fraction };
}

/** Parses a decimal USDC amount into integer base-unit string. */
export function toMicroUsdc(amount: string, decimals: number = USDC_DECIMALS): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }
  const { integer, fraction } = normalizeParts(amount);
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  const baseUnits = BigInt(integer + padded);
  if (baseUnits > MAX_BASE_UNITS) {
    throw new Error(`Amount exceeds safe integer range: ${amount}`);
  }
  return baseUnits.toString();
}

/** Formats integer base-unit string as a decimal USDC amount string. */
export function fromMicroUsdc(baseUnits: string, decimals: number = USDC_DECIMALS): string {
  if (!/^[0-9]+$/.test(baseUnits)) {
    throw new Error(`Invalid base units: ${baseUnits}`);
  }
  const units = BigInt(baseUnits);
  if (units > MAX_BASE_UNITS) {
    throw new Error(`Base units exceed safe integer range: ${baseUnits}`);
  }
  const scale = BigInt(10) ** BigInt(decimals);
  const integer = (units / scale).toString();
  const fraction = (units % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction === "" ? integer : `${integer}.${fraction}`;
}

/** PRD examples: 0.001 USDC = "1000", 0.005 = "5000", 0.01 = "10000". */
export const AMOUNT_EXAMPLES = {
  "0.001": "1000",
  "0.005": "5000",
  "0.01": "10000",
} as const;

/** Minimum price for a route: 0.001 USDC. */
export const MIN_PRICE_MICRO_USDC = 1000;
export const MIN_PRICE_USDC = "0.001";

/**
 * Strictly parses a creator-entered USDC price into integer micro-USDC.
 *
 * Rules: plain decimal notation only (no scientific notation, no leading
 * zeros, no trailing-dot), at most 6 decimal places, at least 0.001 USDC,
 * never zero or negative. Returns base units as a number (safe integer
 * range). Throws a typed error with a machine reason.
 */
export function parseUsdcPrice(input: string): number {
  if (typeof input !== "string") {
    throw new PriceValidationError("not_a_string");
  }
  const trimmed = input.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(trimmed)) {
    throw new PriceValidationError("malformed_price");
  }
  const [integer, fraction = ""] = trimmed.split(".");
  const micro = BigInt(integer + fraction.padEnd(6, "0"));
  if (micro <= BigInt(0)) {
    throw new PriceValidationError("price_must_be_positive");
  }
  if (micro < BigInt(MIN_PRICE_MICRO_USDC)) {
    throw new PriceValidationError("price_below_minimum");
  }
  const asNumber = Number(micro);
  if (!Number.isSafeInteger(asNumber)) {
    throw new PriceValidationError("price_out_of_range");
  }
  return asNumber;
}

export class PriceValidationError extends Error {
  constructor(readonly reason: string) {
    super(`Invalid price: ${reason}`);
    this.name = "PriceValidationError";
  }
}
