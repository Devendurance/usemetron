/**
 * Server-only typed environment singleton.
 *
 * Importing this module in a client bundle must fail at build time
 * (`server-only`). Sensitive values are never printed or exposed.
 */

import "server-only";
import { EnvValidationError, validateEnv, type EnvValues } from "../env";

let cached: EnvValues | null = null;
let cachedError: Error | null = null;

/**
 * Returns the validated server environment, throwing when a required
 * variable is missing or invalid. Fail-closed: callers never receive a
 * partially configured environment.
 */
export function getServerEnv(): EnvValues {
  if (cached !== null) return cached;
  if (cachedError !== null) throw cachedError;

  const result = validateEnv(process.env);
  if (!result.ok) {
    cachedError = new EnvValidationError(result);
    throw cachedError;
  }
  cached = result.values;
  return cached;
}

/** Non-throwing validation used by the foundation verification script. */
export function validateServerEnv() {
  return validateEnv(process.env);
}
