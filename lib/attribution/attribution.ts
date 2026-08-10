/**
 * Celo ERC-8021 attribution tag helpers for Metron payouts.
 *
 * Shared module (no server-only): attribution data is not a secret and is
 * encoded into the calldata of genuine payout transactions only. No
 * transaction is ever built or sent from this module.
 */

import { fromDataSuffix, toDataSuffix } from "@celo/attribution-tags";
import type { Hex } from "viem";

import { METRON_ATTRIBUTION_TAG } from "../celo/config";

export { METRON_ATTRIBUTION_TAG };

export type DecodedAttribution = { codes: string[]; schemaId: number };

/**
 * Builds the ERC-8021 calldata suffix encoding the Metron attribution tag.
 * With extra codes, the Metron tag is appended alongside them (multi-code
 * form), e.g. when a partner-hosted payout must carry two tags.
 */
export function buildAttributionDataSuffix(extraCodes: string[] = []): Hex {
  if (extraCodes.length === 0) {
    return toDataSuffix(METRON_ATTRIBUTION_TAG);
  }
  return toDataSuffix([...extraCodes, METRON_ATTRIBUTION_TAG]);
}

/** Decodes an ERC-8021 data suffix; returns null when it is not valid attribution data. */
export function decodeAttributionData(data: Hex): DecodedAttribution | null {
  return fromDataSuffix(data);
}

/** Whether a decoded code list carries the Metron attribution tag. */
export function containsMetronTag(codes: string[]): boolean {
  return codes.includes(METRON_ATTRIBUTION_TAG);
}
