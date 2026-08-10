/**
 * Pure rate-limit core (M11 §5), injectable and fully testable.
 *
 * Algorithm: INCR the counter key; when the counter starts (=== 1) set
 * EXPIRE so every window is bounded by TTL (a stale counter can never
 * accumulate past its window). Allowed while counter <= limit.
 *
 * TTL-SET FAILURE IS SELF-HEALING: when EXPIRE fails at counter start
 * (the key would otherwise live forever and the bucket could become a
 * permanent 429 for everyone), EXPIRE is retried once and, if it fails
 * again, the key is DELeted to reset the window — the request is still
 * allowed, but the verdict is marked `degraded` because the bucket state
 * had to be discarded.
 *
 * FAILURE MODE IS EXPLICIT FAIL-OPEN: any dependency error yields
 * `{ allowed: true, degraded: true }` — the paid flow must never be
 * stranded by abuse protection. Degradation is observable via the
 * `degraded` flag (wired into structured logs by the route callers);
 * this module never logs.
 *
 * Pure module (no `server-only`): importable from tests and the
 * server-only Redis wiring alike.
 */

import { keyFor } from "./policy";

export type RateLimitDeps = {
  /** INCR a counter key; resolves to the post-increment value. */
  incr(key: string): Promise<number>;
  /** Set TTL on a counter key (bounded window). */
  expire(key: string, seconds: number): Promise<unknown>;
  /**
   * Delete a counter key; used to reset a window whose TTL could not be
   * set (so a counter can never accumulate without an expiry).
   */
  del(key: string): Promise<unknown>;
};

export type RateLimitVerdict = {
  allowed: boolean;
  /** Seconds the caller should wait before retrying; 0 when allowed. */
  retryAfterSeconds: number;
  /** True when the limiter degraded (fail-open) instead of enforcing. */
  degraded: boolean;
};

export type RateLimitCheckInput = {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
};

const FAIL_OPEN: RateLimitVerdict = { allowed: true, retryAfterSeconds: 0, degraded: true };

/**
 * Sets the bounded TTL at counter start, retrying once. Resolves false
 * when EXPIRE failed twice — the caller must then reset the window (DEL)
 * and degrade, otherwise the key would accumulate forever.
 */
async function setWindowTtl(
  key: string,
  windowSeconds: number,
  deps: RateLimitDeps
): Promise<boolean> {
  try {
    await deps.expire(key, windowSeconds);
    return true;
  } catch {
    // One retry: a transient EXPIRE failure must not leave the counter
    // without a TTL.
    try {
      await deps.expire(key, windowSeconds);
      return true;
    } catch {
      return false;
    }
  }
}

export async function checkRateLimit(
  input: RateLimitCheckInput,
  deps: RateLimitDeps
): Promise<RateLimitVerdict> {
  try {
    const key = keyFor(input.scope, input.identifier);
    const counter = await deps.incr(key);
    if (counter === 1) {
      // First request in the window: bound the window with a TTL so the
      // counter resets and can never grow past the window.
      const ttlSet = await setWindowTtl(key, input.windowSeconds, deps);
      if (!ttlSet) {
        // EXPIRE failed twice: the counter has no TTL and would grow
        // forever, making the bucket a permanent 429 for everyone. Reset
        // the window by deleting the key (best effort) and degrade: this
        // request is allowed, but the bucket state was corrupt and will
        // be rebuilt from the next request on.
        await deps.del(key).catch(() => {
          // A failed DEL is still observable via `degraded`; the
          // fail-open guarantee already holds.
        });
        return { allowed: true, retryAfterSeconds: 0, degraded: true };
      }
    }
    if (counter <= input.limit) {
      return { allowed: true, retryAfterSeconds: 0, degraded: false };
    }
    return { allowed: false, retryAfterSeconds: input.windowSeconds, degraded: false };
  } catch {
    // Fail-open: a broken limiter must never strand a paid request.
    return FAIL_OPEN;
  }
}
