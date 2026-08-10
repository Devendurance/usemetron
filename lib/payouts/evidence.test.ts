import { describe, expect, it } from "vitest";

import { buildPayoutCalldata } from "./execution";
import { assessPayoutConfirmation } from "./evidence";

const PAYER = "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa";
const CREATOR = "0xAAe584e729edA3D3bb2Ecb3b6Fb8C1dc4A9e5F7B";
const AMOUNT = BigInt(1000);
const { data } = buildPayoutCalldata({ to: CREATOR, amountMicroUsdc: AMOUNT });

const BASE = {
  txStatus: "success" as const,
  txTo: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  transfers: [{ from: PAYER, to: CREATOR, value: AMOUNT }],
  txInput: data,
  expected: { payer: PAYER, to: CREATOR, amountMicroUsdc: AMOUNT, attributionTag: "celo_91fed90b97fc" },
};

describe("assessPayoutConfirmation", () => {
  it("confirms with matching transfer + attribution", () => {
    expect(assessPayoutConfirmation(BASE)).toEqual({ status: "confirmed", attributionVerified: true });
  });

  it("confirms financially even when txTo is null (receipt-only evidence)", () => {
    // The M8.1 incident: the live receipt poller could not capture txTo;
    // the canonical-USDC Transfer log is the authoritative financial
    // evidence and must confirm the payout.
    expect(assessPayoutConfirmation({ ...BASE, txTo: null })).toEqual({
      status: "confirmed",
      attributionVerified: true,
    });
  });

  it("confirms without attribution evidence but flags it unverified", () => {
    expect(
      assessPayoutConfirmation({
        ...BASE,
        txInput: `0xa9059cbb${"00".repeat(100)}` as `0x${string}`,
      })
    ).toEqual({ status: "confirmed", attributionVerified: false });
  });

  it("rejects a reverted transaction", () => {
    expect(assessPayoutConfirmation({ ...BASE, txStatus: "reverted" }).status).toBe("not_confirmed");
  });

  it("rejects unknown receipt state", () => {
    expect(assessPayoutConfirmation({ ...BASE, txStatus: "unknown" }).status).toBe("not_confirmed");
  });

  it("wrong token = no matching canonical-USDC transfer → NOT confirmed", () => {
    // A txTo pointing elsewhere is not itself decisive; the absence of the
    // exact canonical-USDC transfer is.
    expect(
      assessPayoutConfirmation({ ...BASE, transfers: [] }).status
    ).toBe("not_confirmed");
  });

  it("a present-but-different txTo does NOT block financial confirmation when the canonical transfer is proven", () => {
    const result = assessPayoutConfirmation({
      ...BASE,
      txTo: "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e",
    });
    expect(result.status).toBe("confirmed");
  });

  it("attribution decode failure still yields financial CONFIRMED with attribution unverified", () => {
    const result = assessPayoutConfirmation({
      ...BASE,
      txInput: `0xa9059cbb${"00".repeat(100)}` as `0x${string}`,
    });
    expect(result).toEqual({ status: "confirmed", attributionVerified: false });
  });

  it("rejects a wrong recipient", () => {
    expect(
      assessPayoutConfirmation({ ...BASE, transfers: [{ from: PAYER, to: "0x00000000000000000000000000000000000000EE", value: AMOUNT }] }).status
    ).toBe("not_confirmed");
  });

  it("rejects a wrong amount", () => {
    expect(
      assessPayoutConfirmation({ ...BASE, transfers: [{ from: PAYER, to: CREATOR, value: BigInt(999) }] }).status
    ).toBe("not_confirmed");
  });
});
