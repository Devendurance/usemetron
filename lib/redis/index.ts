/**
 * Redis foundation barrel: client, connectivity probe, and key builders.
 *
 * Note: re-exports the server-only client, so this module must only be
 * imported from server code. The probe and keys modules stay `server-only`-
 * free for tests and the foundation verification script.
 */

export { redis } from "./client";

export { probeRedis, REDIS_PROBE_VALUE, type RedisProbeResult } from "./probe";

export {
  M0_PROBE_KEY_PREFIX,
  authNonceKey,
  paymentLockKey,
  payoutWalletLockKey,
  rateLimitKey,
  routeKey,
} from "./keys";
