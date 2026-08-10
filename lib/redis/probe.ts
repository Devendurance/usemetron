/**
 * Safe Redis connectivity probe for the M0 foundation verification script.
 *
 * This module intentionally does NOT import `server-only` (nor
 * `lib/redis/client.ts`, which does): the verification script runs under
 * plain Node, where the `server-only` marker throws at import time.
 *
 * Credentials are read via the non-throwing validation path; when they are
 * absent the probe reports "not configured" instead of throwing or falling
 * back to a mock client.
 */

import { Redis } from "@upstash/redis";
import { validateEnv } from "../env";
import { M0_PROBE_KEY_PREFIX } from "./keys";

export type RedisProbeResult = {
  ok: boolean;
  write: boolean;
  read: boolean;
  del: boolean;
  key: string;
  error?: string;
};

/** Value written by the probe; distinct from any real application state. */
export const REDIS_PROBE_VALUE = "m0-probe";

/** TTL for the probe key; a stale probe key expires on its own. */
const REDIS_PROBE_TTL_SECONDS = 60;

/** Unique per-run key, e.g. `metron:m0-probe:<timestamp>-<random>`. */
function createProbeKey(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `${M0_PROBE_KEY_PREFIX}${timestamp}-${random}`;
}

/**
 * Fresh client per command so each step gets its own timeout budget; a
 * shared signal would stay aborted after the first timed-out command.
 */
function createProbeClient(url: string, token: string, timeoutMs?: number): Redis {
  return new Redis({
    url,
    token,
    signal: timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
  });
}

function failure(key: string, error: string): RedisProbeResult {
  return { ok: false, write: false, read: false, del: false, key, error };
}

/**
 * Best-effort cleanup so a failed probe never leaves fake app state behind.
 * A DEL on a key that was never written (or already deleted) is harmless.
 */
async function failWithCleanup(
  client: Redis,
  key: string,
  error: string
): Promise<RedisProbeResult> {
  try {
    await client.del(key);
  } catch {
    // Cleanup is best-effort; the reported error is what matters.
  }
  return failure(key, error);
}

/**
 * Round-trips SET -> GET -> DEL -> GET against Upstash Redis using a unique
 * temp key, verifying the value survives the write and the key is gone
 * after deletion. Never throws; reports failures in the result.
 */
export async function probeRedis(options: { timeoutMs?: number } = {}): Promise<RedisProbeResult> {
  const { timeoutMs } = options;

  const env = validateEnv(process.env);
  const url = env.values.UPSTASH_REDIS_REST_URL;
  const token = env.values.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return {
      ok: false,
      write: false,
      read: false,
      del: false,
      key: "",
      error: "UPSTASH_REDIS_REST_URL/TOKEN not configured",
    };
  }

  const key = createProbeKey();
  const client = createProbeClient(url, token, timeoutMs);

  try {
    const setResult = await client.set(key, REDIS_PROBE_VALUE, { ex: REDIS_PROBE_TTL_SECONDS });
    if (setResult !== "OK") {
      return failWithCleanup(client, key, `SET returned ${String(setResult)} instead of "OK"`);
    }

    const readValue = await client.get<string>(key);
    if (readValue !== REDIS_PROBE_VALUE) {
      return failWithCleanup(
        client,
        key,
        `GET round-trip mismatch: expected "${REDIS_PROBE_VALUE}"`
      );
    }

    const deleted = await client.del(key);
    if (deleted !== 1) {
      return failWithCleanup(client, key, `DEL reported ${String(deleted)} keys deleted, expected 1`);
    }

    const afterDelete = await client.get<string>(key);
    if (afterDelete !== null) {
      return failWithCleanup(client, key, "key still present after DEL");
    }

    return { ok: true, write: true, read: true, del: true, key };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failWithCleanup(client, key, message);
  }
}
