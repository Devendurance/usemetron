/**
 * x402 V2 payment payload decoding, identity extraction, and policy
 * validation for the Metron gateway (M4).
 *
 * The exact-EVM payload shapes below mirror the CURRENT official
 * `@x402/evm` v2.21.0 structures (verified from its published types):
 *
 *   ExactEIP3009Payload = {
 *     signature?: `0x${string}`;
 *     authorization: { from, to, value, validAfter, validBefore, nonce }
 *   }
 *   ExactPermit2Payload = {
 *     signature: `0x${string}`;
 *     permit2Authorization: { from, permitted: { token, amount }, spender,
 *       nonce, deadline, witness }
 *   }
 *
 * The runtime guards `isEIP3009Payload` / `isPermit2Payload` from
 * `@x402/evm` are used for discrimination.
 */

import { decodePaymentSignatureHeader } from "@x402/core/http";
import { isEIP3009Payload, isPermit2Payload } from "@x402/evm";

import { CELO_NETWORK, X402_SCHEME } from "../celo/config";
import type { PaymentPayload, PaymentRequirements } from "./types";

/** EIP-3009 authorization (Celo USDC gasless flow). */
export type ExactEip3009Payload = {
  signature?: `0x${string}`;
  authorization: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: `0x${string}`;
  };
};

/** Permit2 authorization via the x402 Permit2 proxy. */
export type ExactPermit2Payload = {
  signature: `0x${string}`;
  permit2Authorization: {
    from: `0x${string}`;
    permitted: { token: `0x${string}`; amount: string };
    spender: `0x${string}`;
    nonce: string;
    deadline: string;
    witness: { to: `0x${string}`; validAfter: string };
  };
};

export type ExactEvmPayloadV2 = ExactEip3009Payload | ExactPermit2Payload;

export class PaymentSignatureError extends Error {
  constructor(readonly reason: string) {
    super(`Invalid payment signature: ${reason}`);
    this.name = "PaymentSignatureError";
  }
}

/**
 * Decodes a raw PAYMENT-SIGNATURE header into a V2 PaymentPayload.
 * Rejects invalid Base64/JSON, unsupported versions, and non-exact /
 * non-Celo payloads.
 */
export function decodePaymentSignature(headerValue: string): PaymentPayload {
  let payload: PaymentPayload;
  try {
    payload = decodePaymentSignatureHeader(headerValue);
  } catch {
    throw new PaymentSignatureError("malformed");
  }

  if (typeof payload !== "object" || payload === null) {
    throw new PaymentSignatureError("malformed");
  }
  if (payload.x402Version !== 2) {
    throw new PaymentSignatureError("unsupported_version");
  }
  if (!payload.accepted || typeof payload.accepted !== "object") {
    throw new PaymentSignatureError("missing_accepted");
  }
  if (payload.accepted.scheme !== X402_SCHEME) {
    throw new PaymentSignatureError("unsupported_scheme");
  }
  if (payload.accepted.network !== CELO_NETWORK) {
    throw new PaymentSignatureError("unsupported_network");
  }
  if (typeof payload.payload !== "object" || payload.payload === null) {
    throw new PaymentSignatureError("malformed_payload");
  }
  const evmPayload = payload.payload as ExactEvmPayloadV2;
  if (!isEIP3009Payload(evmPayload) && !isPermit2Payload(evmPayload)) {
    throw new PaymentSignatureError("malformed_exact_payload");
  }
  return payload;
}

/**
 * Extracts the stable authorization identity: network, asset, payer, and
 * the 32-byte authorization nonce (normalized to lowercase hex). This is
 * the deterministic basis for the payment identifier.
 */
export function extractPaymentIdentity(
  payload: PaymentPayload
): { network: string; asset: string; payer: string; nonceHex: string } {
  const { asset, network } = payload.accepted;
  const evmPayload = payload.payload as ExactEvmPayloadV2;

  let payer: string;
  let nonce: bigint;
  if (isEIP3009Payload(evmPayload)) {
    payer = evmPayload.authorization.from;
    nonce = BigInt(evmPayload.authorization.nonce);
  } else {
    payer = evmPayload.permit2Authorization.from;
    nonce = BigInt(evmPayload.permit2Authorization.nonce);
  }

  return {
    network,
    asset: asset.toLowerCase(),
    payer: payer.toLowerCase(),
    nonceHex: `0x${nonce.toString(16).padStart(64, "0")}`,
  };
}

/** Authorization validity deadline in unix seconds, when available. */
export function authorizationDeadline(payload: PaymentPayload): number | null {
  const evmPayload = payload.payload as ExactEvmPayloadV2;
  if (isEIP3009Payload(evmPayload)) {
    return Number(evmPayload.authorization.validBefore);
  }
  return Number(evmPayload.permit2Authorization.deadline);
}

/**
 * Validates the caller-supplied accepted policy + resource against the
 * server-authoritative values. Returns a list of human/machine-readable
 * issue keys; an empty list means the payload is bound to this exact route.
 */
export function validatePayloadAgainstRequirements(
  payload: PaymentPayload,
  serverRequirements: PaymentRequirements,
  resourceUrl: string
): string[] {
  const issues: string[] = [];
  const accepted = payload.accepted;

  if (accepted.scheme !== serverRequirements.scheme) issues.push("scheme");
  if (accepted.network !== serverRequirements.network) issues.push("network");
  if (accepted.asset.toLowerCase() !== serverRequirements.asset.toLowerCase()) {
    issues.push("asset");
  }
  if (accepted.amount !== serverRequirements.amount) issues.push("amount");
  if (accepted.payTo.toLowerCase() !== serverRequirements.payTo.toLowerCase()) {
    issues.push("payTo");
  }
  // The buyer echoes the server's resource URL; a payment authorized for
  // a different route must never be accepted here.
  if (typeof payload.resource?.url !== "string") {
    issues.push("resource_missing");
  } else if (payload.resource.url !== resourceUrl) {
    issues.push("resource_mismatch");
  }
  return issues;
}
