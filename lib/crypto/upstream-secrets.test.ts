import { describe, expect, it } from "vitest";

import {
  decryptUpstreamSecret,
  encryptUpstreamSecret,
  isEncryptedSecretPayload,
  loadUpstreamEncryptionKey,
  UpstreamSecretCryptoError,
} from "./upstream-secrets";

const KEY_BASE64 = Buffer.alloc(32, 7).toString("base64");
const KEY = loadUpstreamEncryptionKey(KEY_BASE64);
const OTHER_KEY = Buffer.alloc(32, 9);

const SECRET = "sk_live_abc123";
const META = { authType: "BEARER" as const, headerName: null };

describe("loadUpstreamEncryptionKey", () => {
  it("decodes a Base64 32-byte key", () => {
    const key = loadUpstreamEncryptionKey(KEY_BASE64);
    expect(key.length).toBe(32);
  });

  it("rejects keys that are not 32 bytes after decoding", () => {
    expect(() => loadUpstreamEncryptionKey(Buffer.alloc(16).toString("base64"))).toThrow(
      UpstreamSecretCryptoError
    );
    expect(() => loadUpstreamEncryptionKey(Buffer.alloc(31).toString("base64"))).toThrow(
      UpstreamSecretCryptoError
    );
    expect(() => loadUpstreamEncryptionKey(Buffer.alloc(33).toString("base64"))).toThrow(
      UpstreamSecretCryptoError
    );
  });

  it("rejects invalid Base64 input", () => {
    expect(() => loadUpstreamEncryptionKey("!!!not-base64!!!")).toThrow(
      UpstreamSecretCryptoError
    );
  });
});

describe("encryptUpstreamSecret / decryptUpstreamSecret", () => {
  it("round-trips a secret", () => {
    const payload = encryptUpstreamSecret(SECRET, KEY, META);
    const decrypted = decryptUpstreamSecret(payload, KEY);
    expect(decrypted.secret).toBe(SECRET);
    expect(decrypted.authType).toBe("BEARER");
    expect(decrypted.headerName).toBeNull();
  });

  it("round-trips API_KEY auth with a header name", () => {
    const payload = encryptUpstreamSecret("k-9876", KEY, {
      authType: "API_KEY",
      headerName: "X-Custom-Key",
    });
    const decrypted = decryptUpstreamSecret(payload, KEY);
    expect(decrypted.secret).toBe("k-9876");
    expect(decrypted.authType).toBe("API_KEY");
    expect(decrypted.headerName).toBe("X-Custom-Key");
  });

  it("produces different ciphertext for the same secret (random IV)", () => {
    const first = encryptUpstreamSecret(SECRET, KEY, META);
    const second = encryptUpstreamSecret(SECRET, KEY, META);
    expect(first).not.toBe(second);
    const a = JSON.parse(first) as { iv: string };
    const b = JSON.parse(second) as { iv: string };
    expect(a.iv).not.toBe(b.iv);
  });

  it("serialized payload contains no plaintext", () => {
    const payload = encryptUpstreamSecret(SECRET, KEY, META);
    expect(payload).not.toContain(SECRET);
    expect(payload).not.toContain("sk_live");
  });

  it("rejects tampered ciphertext", () => {
    const payload = encryptUpstreamSecret(SECRET, KEY, META);
    const parsed = JSON.parse(payload) as { ciphertext: string };
    const flipped = (Number.parseInt(parsed.ciphertext.slice(0, 2), 16) ^ 0x01)
      .toString(16)
      .padStart(2, "0");
    parsed.ciphertext = flipped + parsed.ciphertext.slice(2);
    expect(() => decryptUpstreamSecret(JSON.stringify(parsed), KEY)).toThrow(
      UpstreamSecretCryptoError
    );
  });

  it("rejects decryption with the wrong key", () => {
    const payload = encryptUpstreamSecret(SECRET, KEY, META);
    expect(() => decryptUpstreamSecret(payload, OTHER_KEY)).toThrow(
      UpstreamSecretCryptoError
    );
  });

  it("rejects malformed or unsupported payloads", () => {
    expect(() => decryptUpstreamSecret("not-json", KEY)).toThrow(
      UpstreamSecretCryptoError
    );
    expect(() =>
      decryptUpstreamSecret(
        JSON.stringify({ version: 99, algorithm: "AES-256-GCM", iv: "00", ciphertext: "00", authTag: "00" }),
        KEY
      )
    ).toThrow(UpstreamSecretCryptoError);
    expect(() =>
      decryptUpstreamSecret(JSON.stringify({ version: 1 }), KEY)
    ).toThrow(UpstreamSecretCryptoError);
  });

  it("rejects encrypting an empty secret", () => {
    expect(() => encryptUpstreamSecret("", KEY, META)).toThrow(
      UpstreamSecretCryptoError
    );
  });
});

describe("isEncryptedSecretPayload", () => {
  it("recognizes envelope-shaped values", () => {
    const payload = encryptUpstreamSecret(SECRET, KEY, META);
    expect(isEncryptedSecretPayload(payload)).toBe(true);
    expect(isEncryptedSecretPayload("plaintext-secret")).toBe(false);
    expect(isEncryptedSecretPayload('{"ciphertext":"x"}')).toBe(false);
    expect(isEncryptedSecretPayload("")).toBe(false);
  });
});
