import { describe, expect, it } from "vitest";

import { formatWalletAddress } from "./format";

describe("formatWalletAddress", () => {
  it("truncates a full checksummed address to first 6 + last 4 chars", () => {
    expect(formatWalletAddress("0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa")).toBe(
      "0x21E5…bcDa"
    );
  });

  it("handles an all-lowercase address", () => {
    expect(formatWalletAddress("0x21e5fc03e4305cc8cfb874253c6d66a8bdb0bcda")).toBe(
      "0x21e5…bcda"
    );
  });

  it("passes through a short address unchanged", () => {
    expect(formatWalletAddress("0x1234")).toBe("0x1234");
  });

  it("passes through an address of exactly 10 chars unchanged", () => {
    expect(formatWalletAddress("0x12345678")).toBe("0x12345678");
  });

  it("truncates an 11-char string to first 6 + last 4", () => {
    expect(formatWalletAddress("0x123456789")).toBe("0x1234…6789");
  });

  it("passes through the empty string", () => {
    expect(formatWalletAddress("")).toBe("");
  });
});
