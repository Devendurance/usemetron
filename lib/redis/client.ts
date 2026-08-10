/**
 * Server-only Upstash Redis singleton.
 *
 * Importing this module in a client bundle must fail at build time
 * (`server-only`). Credentials come from the validated server environment
 * and are never printed or exposed.
 */

import "server-only";
import { Redis } from "@upstash/redis";
import { getServerEnv } from "../env/server";

type RedisGlobal = {
  /** Hot-reload-safe holder for the shared client instance. */
  metronRedis?: Redis;
};

/**
 * Builds the client from validated environment values. Fail-closed:
 * missing credentials throw rather than producing a broken client.
 */
function createRedisClient(): Redis {
  const env = getServerEnv();
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not configured");
  }

  return new Redis({ url, token });
}

const globalForRedis = globalThis as unknown as RedisGlobal;

/**
 * Shared Redis client. A plain module-level constant would be re-created on
 * hot reload; storing it on `globalThis` keeps one instance per process.
 */
export const redis: Redis = (() => {
  if (globalForRedis.metronRedis === undefined) {
    globalForRedis.metronRedis = createRedisClient();
  }
  return globalForRedis.metronRedis;
})();
