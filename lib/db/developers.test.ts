/**
 * Pure unit tests for the developer-wallet normalization contract.
 *
 * The full developer repository (`lib/db/developers.ts`) is server-only and
 * requires a real Postgres connection, so it has no DB-backed test here.
 * What IS unit-testable is the EIP-55 normalization contract that
 * guarantees case differences never create duplicate developer rows.
 *
 * NOTE: viem's `isAddress` is strict by default — only fully lowercase or
 * correctly checksummed forms are ACCEPTED; any other casing is rejected at
 * the door and therefore can never reach the database.
 */

import { describe, expect, it } from "vitest";

import { validateWalletAddress } from "../wallet/validate";

const ADDRESS = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";

describe("developer wallet normalization (dedupe guarantee)", () => {
  it("normalizes a lowercase address to its checksummed form", () => {
    const result = validateWalletAddress(ADDRESS.toLowerCase());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.checksummed).toBe(ADDRESS);
    }
  });

  it("accepts the checksummed form unchanged", () => {
    const result = validateWalletAddress(ADDRESS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.checksummed).toBe(ADDRESS);
    }
  });

  it("rejects non-checksummed mixed-case input (strict validation)", () => {
    const result = validateWalletAddress("0xA0cf798816D4b9B9866B5330EEa46A18382F251e");

    expect(result.ok).toBe(false);
  });

  it("maps every ACCEPTED casing of the same address to the SAME normalized string", () => {
    const casings = [ADDRESS, ADDRESS.toLowerCase()];

    const normalized = casings.map((casing) => {
      const result = validateWalletAddress(casing);
      if (!result.ok) {
        throw new Error(`expected ${casing} to be a valid address`);
      }
      return result.checksummed;
    });

    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe(ADDRESS);
  });
});
