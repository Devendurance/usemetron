/**
 * Payout transaction building + preflight (pure).
 *
 * The payout is a plain ERC-20 USDC `transfer(creator, amount)` with the
 * Metron ERC-8021 attribution suffix appended to the calldata (the EVM
 * ignores trailing bytes, so the transfer remains a normal valid USDC
 * transfer while the tag rides along).
 */

import { concat, encodeFunctionData, getAddress, isAddress } from "viem";
import type { Hex } from "viem";

import { buildAttributionDataSuffix } from "../attribution/attribution";
import { METRON_SETTLEMENT_WALLET } from "../celo/config";

const erc20TransferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Builds the attributed USDC transfer calldata for a payout. */
export function buildPayoutCalldata(input: {
  to: `0x${string}`;
  amountMicroUsdc: bigint;
}): { data: Hex; attributionTag: string; attributionDecoded?: { codes: string[] } } {
  const transferData = encodeFunctionData({
    abi: erc20TransferAbi,
    functionName: "transfer",
    args: [input.to, input.amountMicroUsdc],
  });
  const tag = buildAttributionDataSuffix();
  return { data: concat([transferData, tag]), attributionTag: tag };
}

export type PayoutPreflight = {
  ok: boolean;
  reasons: string[];
};

/**
 * Server-side payout preflight. Every failure reason is safe to expose.
 */
export function preflightPayout(input: {
  signerAddress: `0x${string}` | null;
  to: string;
  amountMicroUsdc: number;
  usdcBalance: bigint | null;
  celoBalance: bigint | null;
}): PayoutPreflight {
  const reasons: string[] = [];

  if (input.signerAddress === null) {
    reasons.push("payout_signer_not_configured");
  } else if (
    getAddress(input.signerAddress) !== getAddress(METRON_SETTLEMENT_WALLET)
  ) {
    reasons.push("signer_does_not_match_registered_wallet");
  }

  if (!isAddress(input.to)) {
    reasons.push("invalid_destination");
  }

  if (!Number.isSafeInteger(input.amountMicroUsdc) || input.amountMicroUsdc <= 0) {
    reasons.push("invalid_amount");
  }

  if (input.usdcBalance !== null && input.usdcBalance < BigInt(input.amountMicroUsdc)) {
    reasons.push("insufficient_usdc_balance");
  }

  if (input.celoBalance !== null && input.celoBalance <= BigInt(0)) {
    reasons.push("insufficient_gas");
  }

  return { ok: reasons.length === 0, reasons };
}
