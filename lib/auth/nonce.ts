/**
 * Short-lived, single-use SIWE nonce service.
 *
 * Nonces are generated server-side with viem's `generateSiweNonce`
 * (cryptographically random, EIP-4361-compatible) and stored in Redis under
 * `auth:{nonce}` with a 5-minute TTL. Consumption is ATOMIC via
 * `getdel`: a nonce is valid exactly once, so replays are rejected.
 * Nonces are never persisted in Postgres and a client-supplied nonce is
 * never trusted.
 *
 * Deliberately NO `server-only` import (same rationale as
 * `lib/redis/keys.ts`): the store is injected, so unit tests use an
 * in-memory fake while production wires the real Redis client in
 * `lib/auth/service.ts`.
 */

import { generateSiweNonce } from "viem/siwe";

import { authNonceKey } from "../redis/keys";

/** Nonces live in Redis for 5 minutes (SIWE message expiration window). */
export const NONCE_TTL_SECONDS = 300;

/** SIWE nonce format: at least 8 alphanumeric characters. */
export const SIWE_NONCE_PATTERN = /^[a-zA-Z0-9]{8,}$/;

/** Minimal async key-value store with atomic get-and-delete. */
export type NonceStore = {
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
};

export type NonceService = {
  createNonce(): Promise<string>;
  consumeNonce(nonce: string): Promise<boolean>;
};

/**
 * Creates the injectable nonce service. Production passes the Upstash Redis
 * client (which supports atomic `getdel`); tests pass an in-memory fake.
 */
export function createNonceService(store: NonceStore): NonceService {
  return {
    async createNonce(): Promise<string> {
      const nonce = generateSiweNonce();
      await store.set(authNonceKey(nonce), nonce, { ex: NONCE_TTL_SECONDS });
      return nonce;
    },

    async consumeNonce(nonce: string): Promise<boolean> {
      // Reject malformed nonces before touching the store. An invalid
      // signature attempt may still burn a legitimate nonce — acceptable
      // by design (single-use challenge).
      if (typeof nonce !== "string" || !SIWE_NONCE_PATTERN.test(nonce)) {
        return false;
      }
      const stored = await store.getdel(authNonceKey(nonce));
      return stored === nonce;
    },
  };
}
