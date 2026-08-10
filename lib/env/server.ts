/**
 * Server-only typed environment singleton.
 *
 * Importing this module in a client bundle must fail at build time
 * (`server-only`). Sensitive values are never printed or exposed.
 */

import "server-only";
import {
  EnvValidationError,
  validateEnv,
  type EnvValidationResult,
  type EnvValues,
} from "../env";
import { validateCanonicalProductionValues } from "./canonical";

let cached: EnvValues | null = null;
let cachedError: Error | null = null;

/**
 * Presence + format + canonical validation of `process.env`, non-throwing.
 * The result's `invalid` list carries format failures and canonical
 * deviations by name; values never appear anywhere in the result.
 */
export function validateServerEnv(): EnvValidationResult {
  const result = validateEnv(process.env);
  const canonicalInvalid = validateCanonicalProductionValues(result.values);
  if (canonicalInvalid.length === 0) return result;
  return {
    ...result,
    ok: false,
    invalid: Array.from(new Set([...result.invalid, ...canonicalInvalid])),
  };
}

/**
 * Returns the validated server environment, throwing when a required
 * variable is missing, malformed, or deviates from the canonical Celo
 * mainnet values. Fail-closed: callers never receive a partially
 * configured environment.
 */
export function getServerEnv(): EnvValues {
  if (cached !== null) return cached;
  if (cachedError !== null) throw cachedError;

  const result = validateServerEnv();
  if (!result.ok) {
    cachedError = new EnvValidationError(result);
    throw cachedError;
  }
  cached = result.values;
  return cached;
}
