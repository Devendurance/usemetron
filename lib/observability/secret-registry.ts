/**
 * Module-global runtime registry of decrypted creator credentials for the
 * log redactor (M11.1 defense-in-depth).
 *
 * Values are registered ONLY by the server-side upstream execution path
 * (immediately after a successful decrypt, before injection) and are read
 * back at log time by the logger. The registry itself never prints,
 * serializes, or otherwise exposes its values outside the accessors —
 * it only stores them for the redactor.
 *
 * Hot-reload safe: state lives on globalThis, so a dev-server reload keeps
 * registered credentials instead of silently dropping the redaction.
 */

const globalForSecretRegistry = globalThis as unknown as {
  metronSecretRegistry?: {
    secrets: Set<string>;
    sensitiveKeys: Set<string>;
  };
};

function registryState(): { secrets: Set<string>; sensitiveKeys: Set<string> } {
  if (globalForSecretRegistry.metronSecretRegistry === undefined) {
    globalForSecretRegistry.metronSecretRegistry = {
      secrets: new Set<string>(),
      sensitiveKeys: new Set<string>(),
    };
  }
  return globalForSecretRegistry.metronSecretRegistry;
}

/** Registers a decrypted secret value for redaction. Empty values are ignored. */
export function registerSecret(value: string): void {
  if (typeof value !== "string" || value === "") return;
  registryState().secrets.add(value);
}

/**
 * Registers a creator-configured header name whose values are always
 * redacted. Empty names are ignored.
 */
export function registerSensitiveKey(key: string): void {
  if (typeof key !== "string" || key === "") return;
  registryState().sensitiveKeys.add(key);
}

/** Snapshot of registered secret values (insertion order, deduped). */
export function getRegisteredSecrets(): readonly string[] {
  return [...registryState().secrets];
}

/** Snapshot of registered sensitive keys (insertion order, deduped). */
export function getRegisteredSensitiveKeys(): readonly string[] {
  return [...registryState().sensitiveKeys];
}

/** Clears all registrations (tests and shutdown). */
export function resetRegistry(): void {
  registryState().secrets.clear();
  registryState().sensitiveKeys.clear();
}
