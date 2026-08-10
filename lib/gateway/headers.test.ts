import { describe, expect, it } from "vitest";

import { creatorAuthHeaders, filterCallerHeaders } from "./headers";

const SAFE_HEADERS: Record<string, string> = {
  accept: "application/json",
  "content-type": "application/json",
  "accept-language": "en",
  "user-agent": "metron-test",
};

describe("filterCallerHeaders", () => {
  it("strips all payment protocol headers", () => {
    const filtered = filterCallerHeaders({
      ...SAFE_HEADERS,
      "payment-required": "abc",
      "payment-signature": "def",
      "payment-response": "ghi",
      "x-payment": "legacy",
      "x-payment-receipt": "legacy",
    });
    expect(filtered["payment-required"]).toBeUndefined();
    expect(filtered["payment-signature"]).toBeUndefined();
    expect(filtered["payment-response"]).toBeUndefined();
    expect(filtered["x-payment"]).toBeUndefined();
    expect(filtered["x-payment-receipt"]).toBeUndefined();
  });

  it("strips cookies, host, auth, and hop-by-hop headers", () => {
    const filtered = filterCallerHeaders({
      ...SAFE_HEADERS,
      host: "attacker.example.com",
      cookie: "metron_session=stealme",
      authorization: "Bearer caller-token",
      "proxy-authorization": "Basic abc",
      connection: "keep-alive",
      "keep-alive": "timeout=5",
      "transfer-encoding": "chunked",
      upgrade: "h2c",
      "content-length": "999",
      forwarded: "for=1.2.3.4",
      "x-forwarded-for": "1.2.3.4",
      "x-forwarded-host": "evil.com",
      "x-real-ip": "1.2.3.4",
      "x-metron-session": "x",
      "x-metron-receipt-id": "x",
      "x-api-key": "caller-key",
    });
    for (const name of [
      "host",
      "cookie",
      "authorization",
      "proxy-authorization",
      "connection",
      "keep-alive",
      "transfer-encoding",
      "upgrade",
      "content-length",
      "forwarded",
      "x-forwarded-for",
      "x-forwarded-host",
      "x-real-ip",
      "x-metron-session",
      "x-metron-receipt-id",
      "x-api-key",
    ]) {
      expect(filtered[name], `should strip ${name}`).toBeUndefined();
    }
  });

  it("preserves safe content-negotiation headers", () => {
    const filtered = filterCallerHeaders(SAFE_HEADERS);
    expect(filtered.accept).toBe("application/json");
    expect(filtered["content-type"]).toBe("application/json");
    expect(filtered["accept-language"]).toBe("en");
    expect(filtered["user-agent"]).toBe("metron-test");
  });

  it("does not forward accept-encoding (the gateway forces identity upstream)", () => {
    const filtered = filterCallerHeaders({
      ...SAFE_HEADERS,
      "accept-encoding": "gzip, br",
    });
    expect(filtered["accept-encoding"]).toBeUndefined();
  });

  it("does not forward unknown headers (allowlist)", () => {
    const filtered = filterCallerHeaders({
      ...SAFE_HEADERS,
      "x-random-unknown": "leak",
      "x-secret-header": "leak",
    });
    expect(filtered["x-random-unknown"]).toBeUndefined();
    expect(filtered["x-secret-header"]).toBeUndefined();
  });
});

describe("creatorAuthHeaders", () => {
  it("injects a Bearer credential", () => {
    expect(
      creatorAuthHeaders({ authType: "BEARER", headerName: "", secret: "sk-123" })
    ).toEqual({ authorization: "Bearer sk-123" });
  });

  it("injects an API key under its safe header name", () => {
    expect(
      creatorAuthHeaders({ authType: "API_KEY", headerName: "X-Custom-Key", secret: "k-1" })
    ).toEqual({ "x-custom-key": "k-1" });
  });

  it("injects nothing for NONE", () => {
    expect(creatorAuthHeaders({ authType: "NONE" })).toEqual({});
  });
});
