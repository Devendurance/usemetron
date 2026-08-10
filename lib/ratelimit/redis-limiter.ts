/**
 * Production rate-limiter wiring (server-only).
 *
 * Wires the pure `checkRateLimit` core to the shared Upstash REST client
 * (INCR + EXPIRE — same command style as `lib/redis/client.ts` usage).
 * The core's fail-open semantics are inherited: Redis errors degrade to
 * allowed, never stranding the paid flow.
 */

import "server-only";

import { redis } from "../redis/client";
import { checkRateLimit, type RateLimitCheckInput, type RateLimitVerdict } from "./limiter";

type RateLimiter = {
  check(input: RateLimitCheckInput): Promise<RateLimitVerdict>;
};

const globalForRateLimiter = globalThis as unknown as {
  metronRateLimiter?: RateLimiter;
};

/**
 * Shared rate limiter (hot-reload safe, globalFor pattern). Degraded
 * verdicts must be wired into structured logs by callers — never logged
 * here.
 */
export const rateLimiter: RateLimiter =
  globalForRateLimiter.metronRateLimiter ??
  (globalForRateLimiter.metronRateLimiter = {
    check: (input) =>
      checkRateLimit(input, {
        incr: (key) => redis.incr(key),
        expire: (key, seconds) => redis.expire(key, seconds),
        del: (key) => redis.del(key),
      }),
  });
