import { describe, expect, it } from "vitest";

import { explorerTxUrl, toExplorerTxUrlOrNull } from "./explorer";

describe("explorerTxUrl", () => {
  it("derives the Celo blockscout URL from the real transaction hash", () => {
    expect(explorerTxUrl("0xabc123")).toBe("https://celo.blockscout.com/tx/0xabc123");
  });
});

describe("toExplorerTxUrlOrNull", () => {
  it("maps a hash to the blockscout URL", () => {
    expect(toExplorerTxUrlOrNull("0xdeadbeef")).toBe(
      "https://celo.blockscout.com/tx/0xdeadbeef"
    );
  });

  it("maps null to null (never fabricates a link)", () => {
    expect(toExplorerTxUrlOrNull(null)).toBeNull();
  });
});
