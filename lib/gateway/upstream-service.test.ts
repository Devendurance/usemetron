import { describe, expect, it, vi } from "vitest";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";

import { encryptUpstreamSecret, loadUpstreamEncryptionKey } from "../crypto/upstream-secrets";
import {
  createUpstreamService,
  type UpstreamServiceDeps,
} from "./upstream-service";
import type { UpstreamTransportResult } from "./upstream-client";
import { UPSTREAM_ERROR_CODES } from "./limits";

const KEY = loadUpstreamEncryptionKey(Buffer.alloc(32, 5).toString("base64"));
const BEARER_ENCRYPTED = encryptUpstreamSecret("sk_creator_secret", KEY, {
  authType: "BEARER",
  headerName: null,
});
const API_KEY_ENCRYPTED = encryptUpstreamSecret("k-creator-1", KEY, {
  authType: "API_KEY",
  headerName: "X-Creator-Key",
});

const ROUTE = {
  id: "route-1",
  developerId: "dev-1",
  slug: "abc123",
  upstreamUrl: "https://upstream.example.com/v1",
  encryptedUpstreamAuth: null as string | null,
};

const QUERY = new URLSearchParams({ q: "en" });
const SAFE_CALLER_HEADERS: Array<[string, string]> = [
  ["accept", "application/json"],
  ["content-type", "application/json"],
  ["authorization", "Bearer caller-should-not-win"],
  ["payment-signature", "should-not-forward"],
  ["host", "attacker.example.com"],
  ["x-forwarded-for", "6.6.6.6"],
  ["cookie", "a=b"],
];

function makeService(
  overrides: {
    transport?: UpstreamServiceDeps["transport"];
    resolveAddresses?: UpstreamServiceDeps["resolveAddresses"];
    timeoutMs?: number;
    maxResponseBytes?: number;
  } = {}
) {
  const transport = overrides.transport ?? vi.fn(okTransport(200, Buffer.from("{}")));
  const resolveAddresses =
    overrides.resolveAddresses ??
    (async () => ({ ok: true as const, addresses: ["93.184.216.34"] }));
  const service = createUpstreamService({
    transport,
    resolveAddresses,
    timeoutMs: overrides.timeoutMs,
    maxResponseBytes: overrides.maxResponseBytes,
  });
  return { service, transport, resolveAddresses };
}

function okTransport(
  status: number,
  body: Buffer,
  headers: Record<string, string> = {}
) {
  return async (): Promise<UpstreamTransportResult> => ({
    ok: true,
    response: { status, headers: { "content-type": "application/json", ...headers }, body },
  });
}

const baseInput = {
  route: ROUTE,
  encryptionKey: KEY,
  method: "GET" as const,
  callerPathSegments: ["translate"],
  callerQuery: QUERY,
  callerHeaders: SAFE_CALLER_HEADERS,
  body: null,
};

describe("upstream service — URL + SSRF runtime", () => {
  it("resolves and pins a public destination", async () => {
    const { service, transport } = makeService();
    const result = await service.executeUpstream(baseInput);

    expect(result.kind).toBe("success");
    const args = (transport as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const params = args[0] as {
      hostname: string;
      pinnedAddress: string;
      path: string;
    };
    expect(params.hostname).toBe("upstream.example.com");
    expect(params.pinnedAddress).toBe("93.184.216.34");
    expect(params.path).toBe("/v1/translate?q=en");
  });

  it("rejects private DNS results at runtime", async () => {
    const { service } = makeService({
      resolveAddresses: async () => ({ ok: true as const, addresses: ["10.0.0.5"] }),
    });
    const result = await service.executeUpstream(baseInput);
    expect(result).toMatchObject({
      kind: "failed",
      errorCode: UPSTREAM_ERROR_CODES.UNSAFE_DESTINATION,
    });
  });

  it("rejects metadata/loopback DNS results", async () => {
    for (const ip of ["127.0.0.1", "169.254.169.254", "::1", "::ffff:10.0.0.1"]) {
      const { service } = makeService({
        resolveAddresses: async () => ({ ok: true as const, addresses: [ip] }),
      });
      const result = await service.executeUpstream(baseInput);
      expect(result.kind, `should reject ${ip}`).toBe("failed");
    }
  });

  it("fails closed when DNS resolution fails", async () => {
    const { service } = makeService({
      resolveAddresses: async () => ({ ok: false as const, reason: "url_dns_resolution_failed" }),
    });
    const result = await service.executeUpstream(baseInput);
    expect(result).toMatchObject({
      kind: "failed",
      errorCode: UPSTREAM_ERROR_CODES.UNREACHABLE,
    });
  });

  it("rejects unsafe composition (traversal) before any connection", async () => {
    const { service, transport } = makeService();
    const result = await service.executeUpstream({
      ...baseInput,
      callerPathSegments: ["..", "etc"],
    });
    expect(result).toMatchObject({ kind: "request_rejected" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects HTTP upstreams in production mode", async () => {
    const { service, transport } = makeService();
    const result = await service.executeUpstream({
      ...baseInput,
      route: { ...ROUTE, upstreamUrl: "http://upstream.example.com/v1" },
    });
    expect(result).toMatchObject({ kind: "request_rejected" });
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("upstream service — request building", () => {
  it("POST forwards the raw body bytes", async () => {
    const { service, transport } = makeService();
    await service.executeUpstream({
      ...baseInput,
      method: "POST",
      body: Buffer.from("{\"a\":1}"),
    });
    const args = (transport as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const params = args[0] as {
      method: string;
      body: Buffer | null;
    };
    expect(params.method).toBe("POST");
    expect(params.body?.toString()).toBe('{"a":1}');
  });

  it("GET carries no body", async () => {
    const { service, transport } = makeService();
    await service.executeUpstream(baseInput);
    const args = (transport as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const params = args[0] as {
      body: Buffer | null;
    };
    expect(params.body).toBeNull();
  });

  it("strips payment/caller auth/hop-by-hop headers and injects creator Bearer", async () => {
    const { service, transport } = makeService();
    await service.executeUpstream({
      ...baseInput,
      route: { ...ROUTE, encryptedUpstreamAuth: BEARER_ENCRYPTED },
    });
    const args = (transport as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const params = args[0] as {
      headers: Record<string, string>;
    };
    expect(params.headers.authorization).toBe("Bearer sk_creator_secret");
    expect(params.headers["payment-signature"]).toBeUndefined();
    expect(params.headers.host).toBe("upstream.example.com");
    expect(params.headers["x-forwarded-for"]).toBeUndefined();
    expect(params.headers.cookie).toBeUndefined();
    expect(params.headers.accept).toBe("application/json");
    expect(params.headers["content-type"]).toBe("application/json");
  });

  it("injects creator API key headers", async () => {
    const { service, transport } = makeService();
    await service.executeUpstream({
      ...baseInput,
      route: { ...ROUTE, encryptedUpstreamAuth: API_KEY_ENCRYPTED },
    });
    const args = (transport as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const params = args[0] as {
      headers: Record<string, string>;
    };
    expect(params.headers["x-creator-key"]).toBe("k-creator-1");
  });

  it("a caller can never override the creator auth", async () => {
    const { service, transport } = makeService();
    await service.executeUpstream({
      ...baseInput,
      method: "POST",
      route: { ...ROUTE, encryptedUpstreamAuth: BEARER_ENCRYPTED },
      callerHeaders: [
        ...SAFE_CALLER_HEADERS,
        ["authorization", "Bearer caller-token"],
      ],
      body: Buffer.from("x"),
    });
    const args = (transport as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const params = args[0] as { headers: Record<string, string> };
    expect(params.headers.authorization).toBe("Bearer sk_creator_secret");
  });
});

describe("upstream service — execution results", () => {
  it("2xx records status and latency", async () => {
    const { service } = makeService({
      transport: vi.fn(okTransport(200, Buffer.from("ok"))),
    });
    const result = await service.executeUpstream(baseInput);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.status).toBe(200);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.responseBody.toString()).toBe("ok");
    }
  });

  it("non-2xx is a failure with status", async () => {
    const { service } = makeService({
      transport: vi.fn(okTransport(500, Buffer.from("err"))),
    });
    const result = await service.executeUpstream(baseInput);
    expect(result).toMatchObject({
      kind: "failed",
      errorCode: UPSTREAM_ERROR_CODES.NON_2XX,
      status: 500,
    });
  });

  it("transport timeout maps to UPSTREAM_TIMEOUT", async () => {
    const { service } = makeService({
      transport: vi.fn(async () => ({
        ok: false as const,
        errorCode: UPSTREAM_ERROR_CODES.TIMEOUT,
      })),
    });
    const result = await service.executeUpstream(baseInput);
    expect(result).toMatchObject({ kind: "failed", errorCode: UPSTREAM_ERROR_CODES.TIMEOUT });
  });

  it("oversized transport response maps to UPSTREAM_RESPONSE_TOO_LARGE", async () => {
    const { service } = makeService({
      transport: vi.fn(async () => ({
        ok: false as const,
        errorCode: UPSTREAM_ERROR_CODES.RESPONSE_TOO_LARGE,
      })),
    });
    const result = await service.executeUpstream(baseInput);
    expect(result).toMatchObject({
      kind: "failed",
      errorCode: UPSTREAM_ERROR_CODES.RESPONSE_TOO_LARGE,
    });
  });

  it("never auto-retries on failure", async () => {
    const transport = vi.fn(async () => ({
      ok: false as const,
      errorCode: UPSTREAM_ERROR_CODES.UNREACHABLE,
    }));
    const { service } = makeService({ transport });
    await service.executeUpstream(baseInput);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("does not decrypt auth before verification is done — auth is only read at execution time", async () => {
    // The service receives the encrypted blob; decryption happens inside
    // executeUpstream only. A route without auth never decrypts anything.
    const { service } = makeService();
    const result = await service.executeUpstream(baseInput);
    expect(result.kind).toBe("success");
  });
});

describe("upstream service — content-encoding negotiation + decode (M10.1)", () => {
  const DECODED_JSON = Buffer.from('{"translated":"bonjour"}');

  it("requests identity encoding from the upstream", async () => {
    const { service, transport } = makeService();
    await service.executeUpstream(baseInput);
    const args = (transport as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const params = args[0] as { headers: Record<string, string> };
    expect(params.headers["accept-encoding"]).toBe("identity");
  });

  it("a caller-supplied accept-encoding is never forwarded to the upstream", async () => {
    const { service, transport } = makeService();
    await service.executeUpstream({
      ...baseInput,
      callerHeaders: [...SAFE_CALLER_HEADERS, ["accept-encoding", "gzip, br"]],
    });
    const args = (transport as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const params = args[0] as { headers: Record<string, string> };
    expect(params.headers["accept-encoding"]).toBe("identity");
  });

  it("decodes a gzip upstream body to the exact decoded bytes with safe headers intact", async () => {
    const compressed = gzipSync(DECODED_JSON);
    const { service } = makeService({
      transport: vi.fn(
        okTransport(200, compressed, {
          "content-encoding": "gzip",
          "content-length": String(compressed.length),
          etag: '"abc123"',
          "last-modified": "Wed, 01 Jan 2025 00:00:00 GMT",
        })
      ),
    });
    const result = await service.executeUpstream(baseInput);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.responseBody.equals(DECODED_JSON)).toBe(true);
      expect(result.safeResponseHeaders["content-type"]).toBe("application/json");
      expect(result.safeResponseHeaders.etag).toBe('"abc123"');
      expect(result.safeResponseHeaders["last-modified"]).toBe(
        "Wed, 01 Jan 2025 00:00:00 GMT"
      );
      expect(result.safeResponseHeaders["content-encoding"]).toBeUndefined();
      expect(result.safeResponseHeaders["content-length"]).toBeUndefined();
    }
  });

  it.each([
    ["br", brotliCompressSync(DECODED_JSON)],
    ["deflate", deflateSync(DECODED_JSON)],
  ] as const)(
    "decodes a %s upstream body to the exact decoded bytes",
    async (encoding, compressed) => {
      const { service } = makeService({
        transport: vi.fn(okTransport(200, compressed, { "content-encoding": encoding })),
      });
      const result = await service.executeUpstream(baseInput);
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.responseBody.equals(DECODED_JSON)).toBe(true);
        expect(result.safeResponseHeaders["content-type"]).toBe("application/json");
        expect(result.safeResponseHeaders["content-encoding"]).toBeUndefined();
      }
    }
  );

  it("decodes a gzip body when the transport reports a mixed-case Content-Encoding header", async () => {
    // A transport/injection returning `Content-Encoding` (mixed case) must
    // not defeat M10.1: a case-sensitive lookup would pass the raw gzip
    // bytes through undecoded — the exact corruption class M10.1 closes.
    const compressed = gzipSync(DECODED_JSON);
    const { service } = makeService({
      transport: vi.fn(
        okTransport(200, compressed, {
          "Content-Encoding": "gzip",
          "content-length": String(compressed.length),
        })
      ),
    });
    const result = await service.executeUpstream(baseInput);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.responseBody.equals(DECODED_JSON)).toBe(true);
      expect(result.safeResponseHeaders["content-encoding"]).toBeUndefined();
    }
  });

  it("passes an identity-encoded body through untouched", async () => {
    const { service } = makeService({
      transport: vi.fn(
        okTransport(200, DECODED_JSON, { "content-encoding": "identity" })
      ),
    });
    const result = await service.executeUpstream(baseInput);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.responseBody.equals(DECODED_JSON)).toBe(true);
    }
  });

  it("passes a body with no content-encoding through untouched", async () => {
    const { service } = makeService();
    const result = await service.executeUpstream(baseInput);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.responseBody.equals(Buffer.from("{}"))).toBe(true);
    }
  });

  it("malformed gzip fails closed with UPSTREAM_RESPONSE_DECODE_FAILED and the upstream status", async () => {
    const { service } = makeService({
      transport: vi.fn(
        okTransport(200, Buffer.from("this is not gzip at all"), {
          "content-encoding": "gzip",
        })
      ),
    });
    const result = await service.executeUpstream(baseInput);
    expect(result).toMatchObject({
      kind: "failed",
      errorCode: UPSTREAM_ERROR_CODES.RESPONSE_DECODE_FAILED,
      status: 200,
    });
  });

  it("unsupported content-encoding fails closed with UPSTREAM_RESPONSE_DECODE_FAILED", async () => {
    const { service } = makeService({
      transport: vi.fn(
        okTransport(200, Buffer.from("raw zstd bytes"), { "content-encoding": "zstd" })
      ),
    });
    const result = await service.executeUpstream(baseInput);
    expect(result).toMatchObject({
      kind: "failed",
      errorCode: UPSTREAM_ERROR_CODES.RESPONSE_DECODE_FAILED,
      status: 200,
    });
  });

  it("decoded payload over the cap fails closed with UPSTREAM_RESPONSE_DECODE_FAILED", async () => {
    // 64 KiB of repeated bytes compresses far below the 1 KiB raw cap, but
    // decodes far above it — a classic compressed bomb.
    const bomb = Buffer.alloc(64 * 1024, 0x61);
    const { service } = makeService({
      transport: vi.fn(okTransport(200, gzipSync(bomb), { "content-encoding": "gzip" })),
      maxResponseBytes: 1024,
    });
    const result = await service.executeUpstream(baseInput);
    expect(result).toMatchObject({
      kind: "failed",
      errorCode: UPSTREAM_ERROR_CODES.RESPONSE_DECODE_FAILED,
      status: 200,
    });
  });
});
