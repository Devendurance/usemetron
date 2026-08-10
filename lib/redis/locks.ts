/**
 * Redis-backed payout wallet lock (server-only).
 *
 * Acquire is an atomic SET NX PX: only the first caller wins. Release is a
 * compare-and-delete Lua script so an expired-and-reacquired lock is never
 * deleted by a stale owner. Errors propagate to the caller — the pure
 * `withPayoutWalletLock` core degrades them to fail-open (see
 * `lib/payouts/wallet-lock.ts`).
 */

import "server-only";

import { redis } from "./client";

/** Script: delete the key only if it still holds this caller's token. */
const RELEASE_IF_MATCHES = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

/** Atomic SET NX PX — resolves true only for the caller that won the lock. */
export async function acquirePayoutWalletLock(
  key: string,
  token: string,
  ttlSeconds: number
): Promise<boolean> {
  const result = await redis.set(key, token, { nx: true, px: ttlSeconds * 1000 });
  return result === "OK";
}

/** Compare-and-delete: releases only when `key` still holds `token`. */
export async function releasePayoutWalletLock(
  key: string,
  token: string
): Promise<boolean> {
  const deleted = await redis.eval(RELEASE_IF_MATCHES, [key], [token]);
  return deleted === 1;
}
