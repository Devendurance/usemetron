/**
 * Documented Redis key namespaces (docs/metron-PRD.md §16).
 *
 * Shared module: deliberately NO `server-only` import so tests and the
 * foundation verification script can import it under plain Node.
 */

/** Prefix for keys created by the M0 connectivity probe. */
export const M0_PROBE_KEY_PREFIX = "metron:m0-probe:";

/** Key holding the signed nonce for a wallet-authentication challenge. */
export function authNonceKey(nonce: string): string {
  return `auth:${nonce}`;
}

/**
 * Key holding a session record, keyed by the HMAC-SHA256 digest of the
 * session token (the raw token is never stored server-side).
 */
export function sessionKey(hash: string): string {
  return `session:${hash}`;
}

/** Key caching route configuration for a given slug. */
export function routeKey(slug: string): string {
  return `route:${slug}`;
}

/** Replay lock preventing duplicate processing of the same payment. */
export function paymentLockKey(paymentIdentifier: string): string {
  return `payment-lock:${paymentIdentifier}`;
}

/** Mutex serializing payouts from a given settlement wallet. */
export function payoutWalletLockKey(wallet: string): string {
  return `payout-wallet-lock:${wallet}`;
}

/** Rate-limit counter for a scope (e.g. "auth", "api") and identifier. */
export function rateLimitKey(scope: string, identifier: string): string {
  return `ratelimit:${scope}:${identifier}`;
}
