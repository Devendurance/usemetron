/**
 * Production wiring for the M5 upstream execution service (server-only).
 */

import "server-only";

import { loadUpstreamEncryptionKey } from "../crypto/upstream-secrets";
import { getServerEnv } from "../env/server";
import {
  registerSensitiveKey,
  registerSecret,
} from "../observability/secret-registry";
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
  return createUpstreamService({
    // M11.1: every decrypted creator credential feeds the log redactor —
    // the plaintext as a secret value, the configured header name (API_KEY
    // only) as a sensitive key. The registry never prints anything.
    onDecrypt: ({ plaintext, headerName }) => {
      registerSecret(plaintext);
      if (headerName !== null) {
        registerSensitiveKey(headerName);
      }
    },
  });
}

/** Shared upstream execution service (hot-reload safe). */
export const upstreamService: ReturnType<typeof createUpstreamService> =
  globalForUpstream.metronUpstreamService ??
  (globalForUpstream.metronUpstreamService = buildUpstreamService());

export { encryptionKey };
