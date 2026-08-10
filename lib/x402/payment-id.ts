/**
 * Deterministic payment identifier for replay protection and idempotency.
 *
 * Derivation (documented):
 *   keccak256("metron:payment:" + network + ":" + asset + ":" + payer + ":" + nonceHex)
 *
 * where nonceHex is the 32-byte EIP-3009 authorization nonce (or the
 * Permit2 uint256 nonce) normalized to lowercase 0x-hex. The same
 * authorization always yields the same identifier; different
 * authorizations differ. No signature material or secret is included.
 *
 * The identifier is used as both the Redis replay-lock key suffix and the
 * durable `call_receipts.payment_identifier` value.
 */

import { keccak256, toHex } from "viem";

export type PaymentIdentity = {
  network: string;
  asset: string;
  payer: string;
  nonceHex: string;
};

export function paymentIdentifierFor(identity: PaymentIdentity): string {
  const canonical = [
    "metron:payment",
    identity.network,
    identity.asset.toLowerCase(),
    identity.payer.toLowerCase(),
    identity.nonceHex.toLowerCase(),
  ].join(":");
  return keccak256(toHex(canonical));
}
