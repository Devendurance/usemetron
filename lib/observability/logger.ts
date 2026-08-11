/**
 * Central structured logger (server-only).
 *
 * Every production log line flows through `logEvent`: a single JSON line
 * `{ stage, ts, ...fields }` written via console.log, with all fields
 * passed through the pure redactor. Secret VALUES come from
 * SECRET_ENV_VARS (read at call time, fail-open when absent) plus
 * best-effort URL-credential scrubbing for DB/Redis URLs. M11.1: decrypted
 * creator credentials registered in the secret registry (upstream
 * execution path) are merged in at call time, closing the hole for
 * creator-configured header names with no sensitive substring. Never log
 * full upstream bodies through this channel.
 */

import "server-only";

import { SECRET_ENV_VARS } from "../env";
import { redactFields } from "./redact";
import {
  getRegisteredSensitiveKeys,
  getRegisteredSecrets,
} from "./secret-registry";

export type LogField = string | number | boolean | null;

/**
 * The secret values currently configured for the SECRET_ENV_VARS names.
 * Read at call time so tests and deployments can stub them; empty or
 * absent values contribute no redaction patterns.
 */
function secretValuesFrom(
  source: Record<string, string | undefined> = process.env
): string[] {
  const values: string[] = [];
  for (const name of SECRET_ENV_VARS) {
    const value = source[name];
    if (typeof value === "string" && value !== "") {
      values.push(value);
    }
  }
  return values;
}

/**
 * Emits one structured log line: `{ stage, ts, ...fields }` with every
 * field redacted. Safe by construction — secret-looking values never
 * reach the serialized output. `stage` and `ts` are emitted LAST so
 * caller fields can never overwrite them.
 */
export function logEvent(stage: string, fields: Record<string, LogField>): void {
  const safe = redactFields(
    fields,
    [...secretValuesFrom(), ...getRegisteredSecrets()],
    [...getRegisteredSensitiveKeys()]
  );
  console.log(JSON.stringify({ ...safe, stage, ts: new Date().toISOString() }));
}
