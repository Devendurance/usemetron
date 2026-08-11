import { describe, expect, it } from "vitest";

import { validateUpstreamAuth } from "./auth-config";

describe("validateUpstreamAuth", () => {
  it("accepts NONE", () => {
    const result = validateUpstreamAuth({ type: "none" });
    expect(result).toEqual({ ok: true, authType: "NONE", headerName: null });
  });

  it("accepts BEARER with a secret", () => {
    const result = validateUpstreamAuth({ type: "bearer", secret: "tok-123" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authType).toBe("BEARER");
      expect(result.headerName).toBeNull();
    }
  });

  it("accepts API_KEY with a safe custom header name", () => {
    const result = validateUpstreamAuth({
      type: "apiKey",
      headerName: "X-My-Key",
      secret: "abc",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authType).toBe("API_KEY");
      expect(result.headerName).toBe("X-My-Key");
    }
  });

  it("rejects dangerous header names case-insensitively", () => {
    for (const name of [
      "Host",
      "Cookie",
      "Set-Cookie",
      "Connection",
      "Content-Length",
      "PAYMENT-REQUIRED",
      "Payment-Signature",
      "payment-response",
      "Authorization",
      "X-Forwarded-For",
    ]) {
      const result = validateUpstreamAuth({
        type: "apiKey",
        headerName: name,
        secret: "abc",
      });
      expect(result.ok, `should reject header ${name}`).toBe(false);
    }
  });

  it("rejects malformed header names", () => {
    for (const name of ["", "a b", "a\nb", "x".repeat(65), "ヘッダー", "host;evil"]) {
      const result = validateUpstreamAuth({
        type: "apiKey",
        headerName: name,
        secret: "abc",
      });
      expect(result.ok, `should reject header ${JSON.stringify(name)}`).toBe(false);
    }
  });

  it("accepts x-api-key as a configurable header (PRD §11 common form)", () => {
    for (const name of ["x-api-key", "X-API-Key", "X-Api-Key"]) {
      const result = validateUpstreamAuth({
        type: "apiKey",
        headerName: name,
        secret: "abc",
      });
      expect(result.ok, `should accept header ${name}`).toBe(true);
      if (result.ok) {
        expect(result.authType).toBe("API_KEY");
        expect(result.headerName).toBe(name);
      }
    }
  });

  it("still validates x-api-key against the header-name pattern", () => {
    // Input is trimmed before validation, so these must use characters that
    // survive trimming and are not in the allowed header-name set.
    for (const name of [
      "x-api-\nkey",
      "x-api-key;evil",
      "x-api-key_ヘッダー",
      "x-api-key".repeat(10),
    ]) {
      const result = validateUpstreamAuth({
        type: "apiKey",
        headerName: name,
        secret: "abc",
      });
      expect(result.ok, `should reject header ${JSON.stringify(name)}`).toBe(false);
    }
  });

  it("rejects empty or oversized secrets and newlines", () => {
    expect(validateUpstreamAuth({ type: "bearer", secret: "   " }).ok).toBe(false);
    expect(validateUpstreamAuth({ type: "bearer", secret: "a\r\nb" }).ok).toBe(false);
    expect(validateUpstreamAuth({ type: "bearer", secret: "x".repeat(4097) }).ok).toBe(false);
    expect(validateUpstreamAuth({ type: "apiKey", headerName: "X-K", secret: "" }).ok).toBe(false);
  });

  it("rejects unknown auth types", () => {
    const result = validateUpstreamAuth({ type: "basic", secret: "a" } as never);
    expect(result.ok).toBe(false);
    expect(validateUpstreamAuth(null as never).ok).toBe(false);
  });
});
