/**
 * Pure log redaction (no IO, no env reads — fully unit-testable).
 *
 * `redactFields` guarantees that values matching configured secrets, URL
 * userinfo passwords, or sensitive key names never reach serialized logs.
 * Nested objects and arrays are descended exactly one level so nested
 * string values are redacted too; deeper structures pass through (never
 * recursed, so circular references cannot loop). The functions never
 * throw on weird input: non-string leaf values pass through untouched.
 */

/** "[REDACTED]" — stable marker verified by tests. */
export const REDACTED = "[REDACTED]";

/**
 * Key names whose values are always redacted regardless of content.
 * Kept conservative: a value is redacted only when its key matches one of
 * these words (case-insensitive, ignoring punctuation). `nonce` is
 * deliberately absent — a nonce is not a secret.
 */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "signature",
  "secret",
  "token",
  "authorization",
  "private_key",
  "api_key",
  "cookie",
  "session",
  "password",
  "credential",
  "passphrase",
]);

/** Lowercased key with punctuation stripped, e.g. `x-api-key` → `xapikey`. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const SENSITIVE_NORMALIZED: readonly string[] = [...SENSITIVE_KEYS].map(normalizeKey);

function isSensitiveKey(
  key: string,
  extraNormalized: readonly string[] = []
): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_NORMALIZED.some((word) => normalized.includes(word)) ||
    // M11.1: creator-configured header names (e.g. `X-Custom-Key`) can
    // contain no built-in sensitive substring; extra keys close that hole
    // with the same normalize-and-match semantics.
    extraNormalized.some((word) => normalized.includes(word))
  );
}

/**
 * Best-effort URL credential scrubber. Replaces the password in
 * `scheme://user:pass@host` with [REDACTED], keeping scheme, user, and
 * host readable for diagnosis. Strings without userinfo credentials are
 * returned unchanged.
 */
export function scrubUrlCredentials(value: string): string {
  return value.replace(/(:\/\/[^:/@\s]+:)([^@\s]+)(@)/g, `$1${REDACTED}$3`);
}

/**
 * Returns a copy of `record` safe to serialize: any string value that
 * exactly matches or contains a configured secret is replaced wholesale
 * with [REDACTED]; URL userinfo passwords are scrubbed in place; values
 * under sensitive keys (built-in or `extraSensitiveKeys`) are always
 * replaced. Non-string values and unknown keys pass through untouched.
 * Never throws.
 */
export function redactFields(
  record: Record<string, unknown>,
  secretValues: readonly string[],
  extraSensitiveKeys: readonly string[] = []
): Record<string, unknown> {
  if (record === null || typeof record !== "object") {
    return {};
  }

  const extraNormalized: readonly string[] = extraSensitiveKeys.map(normalizeKey);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = redactValue(key, value, secretValues, extraNormalized);
  }
  return result;
}

function redactValue(
  key: string,
  value: unknown,
  secretValues: readonly string[],
  extraNormalized: readonly string[]
): unknown {
  if (isSensitiveKey(key, extraNormalized)) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    // ONE level of recursion: nested array items are redacted as leaves.
    return value.map((item) => redactLeaf(key, item, secretValues, extraNormalized));
  }
  if (isPlainObject(value)) {
    // ONE level of recursion: nested object entries are redacted as
    // leaves (their own nested children pass through untouched — deeper
    // structures never recurse, so circular references cannot loop).
    const result: Record<string, unknown> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      result[nestedKey] = redactLeaf(nestedKey, nestedValue, secretValues, extraNormalized);
    }
    return result;
  }
  return redactLeaf(key, value, secretValues, extraNormalized);
}

/**
 * Non-recursive single-value redaction: sensitive keys are always
 * replaced; string values are scrubbed (URL userinfo passwords and
 * configured secrets). Everything else passes through untouched.
 */
function redactLeaf(
  key: string,
  value: unknown,
  secretValues: readonly string[],
  extraNormalized: readonly string[]
): unknown {
  if (isSensitiveKey(key, extraNormalized)) {
    return REDACTED;
  }
  if (typeof value !== "string") {
    return value;
  }

  const scrubbed = scrubUrlCredentials(value);
  if (secretValues.some((secret) => secret !== "" && scrubbed.includes(secret))) {
    return REDACTED;
  }
  return scrubbed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
