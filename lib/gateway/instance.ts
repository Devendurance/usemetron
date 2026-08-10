/**
 * Production wiring for the M5 upstream execution service (server-only).
 */

import "server-only";

import { loadUpstreamEncryptionKey } from "../crypto/upstream-secrets";
import { getServerEnv } from "../env/server";
import { createUpstreamService } from "./upstream-service";

const globalForUpstream = globalThis as unknown as {
  metronUpstreamService?: ReturnType<typeof createUpstreamService>;
  metronUpstreamKey?: Buffer;
};

function encryptionKey(): Buffer {
  if (globalForUpstream.metronUpstreamKey === undefined) {
    const key = loadUpstreamEncryptionKey(
      getServerEnv().UPSTREAM_SECRET_ENCRYPTION_KEY ?? ""
    );
    globalForUpstream.metronUpstreamKey = key;
  }
  return globalForUpstream.metronUpstreamKey;
}

function buildUpstreamService() {
  return createUpstreamService();
}

/** Shared upstream execution service (hot-reload safe). */
export const upstreamService: ReturnType<typeof createUpstreamService> =
  globalForUpstream.metronUpstreamService ??
  (globalForUpstream.metronUpstreamService = buildUpstreamService());

export { encryptionKey };
