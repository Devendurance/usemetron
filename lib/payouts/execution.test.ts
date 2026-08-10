import { describe, expect, it } from "vitest";

import { fromDataSuffix } from "@celo/attribution-tags";

import { buildPayoutCalldata, preflightPayout } from "./execution";
import { METRON_SETTLEMENT_WALLET } from "../celo/config";

const TO = "0xAAe584e729edA3D3bb2Ecb3b6Fb8C1dc4A9e5F7B";

describe("buildPayoutCalldata", () => {
  it("builds a transfer with the Metron attribution suffix", () => {
    const { data, attributionTag } = buildPayoutCalldata({ to: TO, amountMicroUsdc: BigInt(1000) });
    expect(data.startsWith("0xa9059cbb")).toBe(true); // transfer(address,uint256)
    const decoded = fromDataSuffix(data);
    expect(decoded).not.toBeNull();
    expect(decoded?.codes).toContain("celo_91fed90b97fc");
    expect(attributionTag).toMatch(/^0x[0-9a-f]+$/i);
  });

  it("produces different calldata for different amounts", () => {
    const a = buildPayoutCalldata({ to: TO, amountMicroUsdc: BigInt(1000) });
    const b = buildPayoutCalldata({ to: TO, amountMicroUsdc: BigInt(2000) });
    expect(a.data).not.toBe(b.data);
  });
});

describe("preflightPayout", () => {
  it("passes when everything is healthy", () => {
    const result = preflightPayout({
      signerAddress: METRON_SETTLEMENT_WALLET,
      to: TO,
      amountMicroUsdc: 1000,
      usdcBalance: BigInt(1000),
      celoBalance: BigInt(1),
    });
    expect(result).toEqual({ ok: true, reasons: [] });
  });

  it("rejects a missing or mismatched signer", () => {
    expect(
      preflightPayout({ signerAddress: null, to: TO, amountMicroUsdc: 1000, usdcBalance: BigInt(1000), celoBalance: BigInt(1) }).reasons
    ).toContain("payout_signer_not_configured");

    expect(
      preflightPayout({
        signerAddress: "0x0000000000000000000000000000000000000001",
        to: TO,
        amountMicroUsdc: 1000,
        usdcBalance: BigInt(1000),
        celoBalance: BigInt(1),
      }).reasons
    ).toContain("signer_does_not_match_registered_wallet");
  });

  it("rejects an invalid destination", () => {
    expect(
      preflightPayout({ signerAddress: METRON_SETTLEMENT_WALLET, to: "0x123", amountMicroUsdc: 1000, usdcBalance: BigInt(1000), celoBalance: BigInt(1) }).reasons
    ).toContain("invalid_destination");
  });

  it("rejects zero/negative amounts", () => {
    expect(
      preflightPayout({ signerAddress: METRON_SETTLEMENT_WALLET, to: TO, amountMicroUsdc: 0, usdcBalance: BigInt(1000), celoBalance: BigInt(1) }).reasons
    ).toContain("invalid_amount");
  });

  it("rejects insufficient USDC balance", () => {
    expect(
      preflightPayout({ signerAddress: METRON_SETTLEMENT_WALLET, to: TO, amountMicroUsdc: 1000, usdcBalance: BigInt(999), celoBalance: BigInt(1) }).reasons
    ).toContain("insufficient_usdc_balance");
  });

  it("rejects zero gas balance", () => {
    expect(
      preflightPayout({ signerAddress: METRON_SETTLEMENT_WALLET, to: TO, amountMicroUsdc: 1000, usdcBalance: BigInt(1000), celoBalance: BigInt(0) }).reasons
    ).toContain("insufficient_gas");
  });
});
