/**
 * Shared, pure x402 capability verification for Metron.
 *
 * Deliberately server-only-FREE: importable from tests, the foundation
 * verification script, and server code. No I/O, no runtime fixtures — the
 * only data here are the canonical expectations for what the Celo
 * facilitator must advertise. A mismatch is reported (never guessed around).
 */

import type { SupportedKind, SupportedResponse } from "./types";

/**
 * The capability Metron requires of the Celo facilitator: x402 v2, the
 * "exact" scheme, on Celo Mainnet (eip155:42220).
 */
export const EXPECTED_SUPPORTED_KIND = {
  x402Version: 2,
  scheme: "exact",
  network: "eip155:42220",
} as const;

/**
 * Finds the advertised kind matching Metron's expected capability, or null.
 */
export function findExpectedCapability(
  supported: SupportedResponse
): SupportedKind | null {
  return (
    supported.kinds.find(
      (kind) =>
        kind.x402Version === EXPECTED_SUPPORTED_KIND.x402Version &&
        kind.scheme === EXPECTED_SUPPORTED_KIND.scheme &&
        kind.network === EXPECTED_SUPPORTED_KIND.network
    ) ?? null
  );
}

/**
 * Verifies the facilitator advertises Metron's expected capability.
 * Never throws; `detail` explains the mismatch using only facts from the
 * advertised payload (no guessed alternatives).
 */
export function expectSupportedCapability(supported: SupportedResponse): {
  ok: boolean;
  kind: SupportedKind | null;
  supportedKinds: SupportedKind[];
  detail: string;
} {
  const kind = findExpectedCapability(supported);

  if (kind !== null) {
    return {
      ok: true,
      kind,
      supportedKinds: supported.kinds,
      detail: `facilitator advertises x402 v2 "exact" for network "${EXPECTED_SUPPORTED_KIND.network}"`,
    };
  }

  const { kinds } = supported;

  if (kinds.length === 0) {
    return {
      ok: false,
      kind: null,
      supportedKinds: kinds,
      detail: "facilitator advertises no supported kinds",
    };
  }

  const v2Kinds = kinds.filter(
    (kind) => kind.x402Version === EXPECTED_SUPPORTED_KIND.x402Version
  );
  if (v2Kinds.length === 0) {
    const versions = [...new Set(kinds.map((kind) => kind.x402Version))].sort(
      (a, b) => a - b
    );
    return {
      ok: false,
      kind: null,
      supportedKinds: kinds,
      detail: `no advertised kind has x402Version ${EXPECTED_SUPPORTED_KIND.x402Version} (advertised versions: ${versions.join(", ")})`,
    };
  }

  const exactKinds = v2Kinds.filter(
    (kind) => kind.scheme === EXPECTED_SUPPORTED_KIND.scheme
  );
  if (exactKinds.length === 0) {
    const schemes = [...new Set(v2Kinds.map((kind) => kind.scheme))];
    return {
      ok: false,
      kind: null,
      supportedKinds: kinds,
      detail: `no x402 v2 kind uses scheme "${EXPECTED_SUPPORTED_KIND.scheme}" (v2 schemes: ${schemes.join(", ")})`,
    };
  }

  const networks = [...new Set(exactKinds.map((kind) => kind.network))];
  return {
    ok: false,
    kind: null,
    supportedKinds: kinds,
    detail: `no x402 v2 "${EXPECTED_SUPPORTED_KIND.scheme}" kind targets network "${EXPECTED_SUPPORTED_KIND.network}" (v2 exact networks: ${networks.join(", ")})`,
  };
}
