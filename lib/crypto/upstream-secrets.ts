/**
 * Server-only AES-256-GCM encryption for upstream API credentials.
 *
 * The key comes from `UPSTREAM_SECRET_ENCRYPTION_KEY`, a Base64-encoded
 * 32-byte value. Each encryption uses a fresh random 12-byte IV and the
 * envelope is authenticated (GCM auth tag). The serialized envelope is
 * versioned so future algorithms can be introduced without breaking old
 * records.
 *
 * The plaintext secret is never logged, never returned by read APIs, and
 * never sent to client components; decryption exists only server-side for
 * the outbound-request builder (future milestone).
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export const UPSTREAM_SECRET_ENVELOPE_VERSION = 1;
export const UPSTREAM_SECRET_ALGORITHM = "AES-256-GCM";

export type UpstreamAuthType = "NONE" | "BEARER" | "API_KEY";

export type EncryptedSecretEnvelope = {
  version: typeof UPSTREAM_SECRET_ENVELOPE_VERSION;
  algorithm: typeof UPSTREAM_SECRET_ALGORITHM;
  /** hex */
  iv: string;
  /** hex */
  ciphertext: string;
  /** hex */
  authTag: string;
  authType: UpstreamAuthType;
  /** Only for API_KEY auth; the header name is safe metadata, not a secret. */
  headerName: string | null;
};

export class UpstreamSecretCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamSecretCryptoError";
  }
}

/** Decodes the Base64 32-byte key and verifies its length. */
export function loadUpstreamEncryptionKey(base64Key: string): Buffer {
  let key: Buffer;
  try {
    key = Buffer.from(base64Key, "base64");
  } catch {
    throw new UpstreamSecretCryptoError("encryption key is not valid Base64");
  }
  if (key.length !== 32) {
    throw new UpstreamSecretCryptoError(
      `encryption key must decode to 32 bytes, got ${key.length}`
    );
  }
  return key;
}

/** Encrypts a secret and returns the versioned serialized envelope. */
export function encryptUpstreamSecret(
  secret: string,
  key: Buffer,
  meta: { authType: UpstreamAuthType; headerName: string | null }
): string {
  if (secret === "") {
    throw new UpstreamSecretCryptoError("cannot encrypt an empty secret");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const envelope: EncryptedSecretEnvelope = {
    version: UPSTREAM_SECRET_ENVELOPE_VERSION,
    algorithm: UPSTREAM_SECRET_ALGORITHM,
    iv: iv.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    authType: meta.authType,
    headerName: meta.headerName,
  };
  return JSON.stringify(envelope);
}

/** Whether a persisted value looks like an encrypted envelope (vs legacy/plain). */
export function isEncryptedSecretPayload(payload: string): boolean {
  try {
    const parsed: unknown = JSON.parse(payload);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      "ciphertext" in parsed &&
      "authTag" in parsed
    );
  } catch {
    return false;
  }
}

export type DecryptedSecret = {
  secret: string;
  authType: UpstreamAuthType;
  headerName: string | null;
};

/**
 * Decrypts a versioned envelope. Throws on unsupported versions,
 * malformed payloads, wrong keys, and tampered ciphertext.
 */
export function decryptUpstreamSecret(
  payload: string,
  key: Buffer
): DecryptedSecret {
  let envelope: EncryptedSecretEnvelope;
  try {
    const parsed = JSON.parse(payload) as EncryptedSecretEnvelope;
    if (
      parsed.version !== UPSTREAM_SECRET_ENVELOPE_VERSION ||
      parsed.algorithm !== UPSTREAM_SECRET_ALGORITHM ||
      typeof parsed.iv !== "string" ||
      typeof parsed.ciphertext !== "string" ||
      typeof parsed.authTag !== "string"
    ) {
      throw new UpstreamSecretCryptoError("unsupported or malformed envelope");
    }
    envelope = parsed;
  } catch (error) {
    if (error instanceof UpstreamSecretCryptoError) throw error;
    throw new UpstreamSecretCryptoError("malformed encrypted payload");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(envelope.authTag, "hex"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "hex")),
      decipher.final(),
    ]).toString("utf8");
    return {
      secret: plaintext,
      authType: envelope.authType,
      headerName: envelope.headerName ?? null,
    };
  } catch {
    // Wrong key or tampered ciphertext — auth tag verification failed.
    throw new UpstreamSecretCryptoError("failed to decrypt upstream secret");
  }
}
