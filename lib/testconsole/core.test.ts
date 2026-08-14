/**
 * Test console core — unit tests.
 *
 * The core executes through the REAL hardened upstream service
 * (`createUpstreamService` with an injected fake transport + resolver), so
 * the encrypt -> decrypt -> header-injection -> redaction pipeline is the
 * same one the paid gateway uses. No network, no DB, no payment modules.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";

import { encryptUpstreamSecret, loadUpstreamEncryptionKey } from "@/lib/crypto/upstream-secrets";
import { createUpstreamService } from "@/lib/gateway/upstream-service";
import type { UpstreamServiceDeps } from "@/lib/gateway/upstream-service";
import type { UpstreamTransport, UpstreamTransportResult } from "@/lib/gateway/upstream-client";
import { UPSTREAM_ERROR_CODES, MAX_CALLER_BODY_BYTES } from "@/lib/gateway/limits";
import {
  getRegisteredSecrets,
  getRegisteredSensitiveKeys,
  resetRegistry,
  registerSecret,
  registerSensitiveKey,
} from "@/lib/observability/secret-registry";

// Financial modules must NEVER be imported or executed by the test-console
// path. Replaced with spies: if any future change wires settlement/ledger/
// payout calls into the core, these spies observe it and the tests fail.
vi.mock("@/lib/db/payouts", () => ({
  reserveOutstandingEarnings: vi.fn(),
  reserveEarningForPayout: vi.fn(),
  markPayoutSubmitted: vi.fn(),
  finalizePayoutConfirmed: vi.fn(),
}));
vi.mock("@/lib/db/ledger", () => ({
  createEarningForReceipt: vi.fn(),
  creatorTotals: vi.fn(),
}));
vi.mock("@/lib/gateway/settlement-service", () => ({
  createSettlementService: vi.fn(),
}));

import { reserveOutstandingEarnings as payoutReserve } from "@/lib/db/payouts";
import { createEarningForReceipt as ledgerEarning } from "@/lib/db/ledger";
import { createSettlementService as settlementFactory } from "@/lib/gateway/settlement-service";
import {
  runUpstreamTest,
  TEST_PREVIEW_MAX_BYTES,
  type RunUpstreamTestDeps,
  type RunUpstreamTestInput,
  type TestResult,
} from "./core";

const KEY = loadUpstreamEncryptionKey(Buffer.alloc(32, 5).toString("base64"));
const PUBLIC_URL = "https://93.184.216.34";
const BEARER_SECRET = "sk_creator_secret";

/** Production-style M11.1 wiring: decrypted plaintext feeds the redactor. */
const productionOnDecrypt: UpstreamServiceDeps["onDecrypt"] = ({ plaintext, headerName }) => {
  registerSecret(plaintext);
  if (headerName !== null) registerSensitiveKey(headerName);
};

function okTransport(
  status = 200,
  body = Buffer.from("{}"),
  headers: Record<string, string> = {}
): UpstreamTransport {
  return async (): Promise<UpstreamTransportResult> => ({
    ok: true,
    response: { status, headers: { "content-type": "application/json", ...headers }, body },
  });
}

function failTransport(errorCode: string): UpstreamTransport {
  return async (): Promise<UpstreamTransportResult> => ({ ok: false, errorCode });
}

function makeService(
  overrides: {
    transport?: UpstreamTransport | ReturnType<typeof vi.fn>;
    resolveAddresses?: UpstreamServiceDeps["resolveAddresses"];
    onDecrypt?: UpstreamServiceDeps["onDecrypt"];
  } = {}
) {
  const transport = (overrides.transport ?? vi.fn(okTransport())) as UpstreamTransport;
  const service = createUpstreamService({
    transport,
    resolveAddresses:
      overrides.resolveAddresses ??
      (async () => ({ ok: true as const, addresses: ["93.184.216.34"] })),
    onDecrypt: overrides.onDecrypt ?? productionOnDecrypt,
  });
  return { service, transport };
}

function baseInput(overrides: Partial<RunUpstreamTestInput> = {}): RunUpstreamTestInput {
  return {
    upstreamUrl: PUBLIC_URL,
    auth: { type: "NONE" },
    request: {
      method: "GET",
      callerPathSegments: [],
      callerQuery: new URLSearchParams(),
      callerHeaders: {},
      body: null,
    },
    ...overrides,
  };
}

function run(
  input: RunUpstreamTestInput,
  service: ReturnType<typeof createUpstreamService>,
  now: () => number = () => 0
): Promise<TestResult> {
  return runUpstreamTest(input, {
    executeUpstream: service.executeUpstream,
    encryptSecret: encryptUpstreamSecret,
    encryptionKey: KEY,
    now,
  } satisfies RunUpstreamTestDeps);
}

/** Runs the core against an arbitrary (possibly mocked) executeUpstream. */
function runWithExecuteUpstream(
  input: RunUpstreamTestInput,
  executeUpstream: RunUpstreamTestDeps["executeUpstream"],
  now: () => number = () => 0
): Promise<TestResult> {
  return runUpstreamTest(input, {
    executeUpstream,
    encryptSecret: encryptUpstreamSecret,
    encryptionKey: KEY,
    now,
  } satisfies RunUpstreamTestDeps);
}

/** First transport call's params (hostname/path/headers/body on the wire). */
function transportParams(transport: UpstreamTransport | ReturnType<typeof vi.fn>) {
  return (transport as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
    hostname: string;
    pinnedAddress: string;
    method: string;
    path: string;
    headers: Record<string, string>;
    body: Buffer | null;
  };
}

afterEach(() => {
  resetRegistry();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("runUpstreamTest — auth kinds through the REAL service", () => {
  it("NONE: executes without any auth header and reports a pretty JSON preview", async () => {
    const { service, transport } = makeService({
      transport: vi.fn(okTransport(200, Buffer.from('{"ok":true}'))),
    });

    const result = await run(baseInput(), service);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.status).toBe(200);
    expect(result.isJson).toBe(true);
    expect(result.contentType).toBe("application/json");
    expect(result.bodyPreview).toBe('{\n  "ok": true\n}');
    expect(result.bodyBytes).toBe(11);
    expect(result.previewTruncated).toBe(false);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    const params = transportParams(transport);
    expect(params.hostname).toBe("93.184.216.34");
    expect(params.pinnedAddress).toBe("93.184.216.34");
    expect(params.headers["accept-encoding"]).toBe("identity");
    expect(params.headers.authorization).toBeUndefined();
  });

  it("POST: forwards the caller body bytes and method to the transport", async () => {
    const body = Buffer.from('{"q":1}', "utf8");
    const { service, transport } = makeService();

    const result = await run(
      baseInput({
        request: {
          method: "POST",
          callerPathSegments: ["v1", "translate"],
          callerQuery: new URLSearchParams({ lang: "en" }),
          callerHeaders: { accept: "application/json" },
          body,
        },
      }),
      service
    );

    expect(result.kind).toBe("success");
    const params = transportParams(transport);
    expect(params.method).toBe("POST");
    expect(params.body).toEqual(body);
    expect(params.path).toBe("/v1/translate?lang=en");
    expect(params.headers.accept).toBe("application/json");
  });

  it("BEARER: encrypts -> the service decrypts, redacts via onDecrypt, and injects Authorization", async () => {
    const onDecrypt = vi.fn(productionOnDecrypt);
    const { service, transport } = makeService({ onDecrypt });

    const result = await run(
      baseInput({ auth: { type: "BEARER", secret: BEARER_SECRET } }),
      service
    );

    expect(result.kind).toBe("success");
    expect(transportParams(transport).headers.authorization).toBe(`Bearer ${BEARER_SECRET}`);
    // M11.1 wiring: the decrypted plaintext feeds the log redactor.
    expect(onDecrypt).toHaveBeenCalledWith({
      plaintext: BEARER_SECRET,
      headerName: null,
    });
    expect(getRegisteredSecrets()).toContain(BEARER_SECRET);
  });

  it("API_KEY: injects the configured header after filtering (caller can never override)", async () => {
    const onDecrypt = vi.fn(productionOnDecrypt);
    const { service, transport } = makeService({ onDecrypt });

    const result = await run(
      baseInput({
        auth: { type: "API_KEY", headerName: "X-Creator-Key", secret: "k-creator-1" },
        request: {
          method: "GET",
          callerPathSegments: [],
          callerQuery: new URLSearchParams(),
          // Caller attempts to pre-empt both the creator header and x-api-key.
          callerHeaders: {
            "x-creator-key": "caller-should-not-win",
            "x-api-key": "caller-should-not-win",
            accept: "application/json",
          },
          body: null,
        },
      }),
      service
    );

    expect(result.kind).toBe("success");
    const params = transportParams(transport);
    expect(params.headers["x-creator-key"]).toBe("k-creator-1");
    expect(params.headers["x-api-key"]).toBeUndefined();
    expect(params.headers.accept).toBe("application/json");
    expect(onDecrypt).toHaveBeenCalledWith({ plaintext: "k-creator-1", headerName: "X-Creator-Key" });
    expect(getRegisteredSensitiveKeys()).toContain("X-Creator-Key");
  });

  it("creator BEARER auth wins over a caller-supplied Authorization (wire-asserted)", async () => {
    const { service, transport } = makeService();

    const result = await run(
      baseInput({
        auth: { type: "BEARER", secret: BEARER_SECRET },
        request: {
          method: "GET",
          callerPathSegments: [],
          callerQuery: new URLSearchParams(),
          callerHeaders: {
            authorization: "Bearer caller-token",
            "proxy-authorization": "Basic dXNlcjpwYXNz",
            host: "attacker.example.com",
            "x-forwarded-for": "6.6.6.6",
            cookie: "session=evil",
            accept: "text/html",
          },
          body: null,
        },
      }),
      service
    );

    expect(result.kind).toBe("success");
    const params = transportParams(transport);
    // DENY_HEADERS stripped every spoofed hop/credential header; the creator
    // credential was injected AFTER filtering.
    expect(params.headers.authorization).toBe(`Bearer ${BEARER_SECRET}`);
    expect(params.headers["proxy-authorization"]).toBeUndefined();
    expect(params.headers.host).toBe("93.184.216.34");
    expect(params.headers["x-forwarded-for"]).toBeUndefined();
    expect(params.headers.cookie).toBeUndefined();
    expect(params.headers.accept).toBe("text/html");
  });

  it("NONE routes never decrypt and never invoke onDecrypt", async () => {
    const onDecrypt = vi.fn();
    const { service } = makeService({ onDecrypt });

    await run(baseInput(), service);

    expect(onDecrypt).not.toHaveBeenCalled();
  });
});

describe("runUpstreamTest — truthful kind classification", () => {
  it("maps upstream 4xx to non_2xx with the real status", async () => {
    const { service } = makeService({ transport: vi.fn(okTransport(404, Buffer.from("nope"))) });

    const result = await run(baseInput(), service);

    expect(result).toEqual({
      kind: "non_2xx",
      status: 404,
      latencyMs: 0,
      errorCode: "UPSTREAM_NON_2XX",
    });
  });

  it("maps upstream 5xx to non_2xx with the real status", async () => {
    const { service } = makeService({
      transport: vi.fn(okTransport(503, Buffer.from("down"))),
    });

    const result = await run(baseInput(), service);

    expect(result.kind).toBe("non_2xx");
    if (result.kind === "non_2xx") expect(result.status).toBe(503);
  });

  it("redirects are never followed: a 3xx status is a truthful non_2xx", async () => {
    const { service, transport } = makeService({
      transport: vi.fn(
        okTransport(302, Buffer.from(""), {
          location: "https://evil.example.com/steal",
        })
      ),
    });

    const result = await run(baseInput(), service);

    expect(result.kind).toBe("non_2xx");
    if (result.kind === "non_2xx") expect(result.status).toBe(302);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("maps transport timeout to the timeout kind", async () => {
    const { service } = makeService({
      transport: vi.fn(failTransport(UPSTREAM_ERROR_CODES.TIMEOUT)),
    });

    const result = await run(baseInput(), service);

    expect(result.kind).toBe("timeout");
  });

  it("maps transport/network failures to upstream_failed with the real error code", async () => {
    for (const errorCode of [
      UPSTREAM_ERROR_CODES.UNREACHABLE,
      UPSTREAM_ERROR_CODES.RESPONSE_TOO_LARGE,
      UPSTREAM_ERROR_CODES.INVALID_RESPONSE,
      UPSTREAM_ERROR_CODES.RESPONSE_DECODE_FAILED,
    ]) {
      const { service } = makeService({ transport: vi.fn(failTransport(errorCode)) });

      const result = await run(baseInput(), service);

      expect(result).toEqual({ kind: "upstream_failed", errorCode, latencyMs: 0 });
    }
  });

  it("maps service-level decode failures (2xx upstream status) to upstream_failed, never non_2xx", async () => {
    // Regression: the service returns RESPONSE_DECODE_FAILED with the real
    // (2xx) upstream status; the kind must still be upstream_failed.
    const executeUpstream: RunUpstreamTestDeps["executeUpstream"] = async () => ({
      kind: "failed",
      errorCode: UPSTREAM_ERROR_CODES.RESPONSE_DECODE_FAILED,
      status: 200,
      latencyMs: 42,
    });

    const result = await runWithExecuteUpstream(baseInput(), executeUpstream);

    expect(result).toEqual({
      kind: "upstream_failed",
      errorCode: "UPSTREAM_RESPONSE_DECODE_FAILED",
      latencyMs: 0,
    });
  });

  it("regression through the real service: a corrupt gzip 2xx body is upstream_failed, not non_2xx", async () => {
    const { service } = makeService({
      transport: vi.fn(
        okTransport(200, Buffer.from("definitely-not-gzip"), {
          "content-encoding": "gzip",
        })
      ),
    });

    const result = await run(baseInput(), service);

    expect(result).toEqual({
      kind: "upstream_failed",
      errorCode: "UPSTREAM_RESPONSE_DECODE_FAILED",
      latencyMs: 0,
    });
  });

  it("reports measured latency from the injected clock", async () => {
    const now = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1500);
    const { service } = makeService();

    const result = await run(baseInput(), service, now);

    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.latencyMs).toBe(500);
  });
});

describe("runUpstreamTest — SSRF and config hardening", () => {
  it("blocks private/loopback/metadata destinations BEFORE execution (ssrf_blocked)", async () => {
    const blocked = [
      "https://127.0.0.1/",
      "https://10.0.0.1/",
      "https://169.254.169.254/latest/meta-data",
      "https://192.168.1.1/",
      "https://100.64.0.1/",
      "https://[::1]/",
      "https://localhost/",
      "https://metadata.google.internal/",
    ];
    for (const upstreamUrl of blocked) {
      const { service, transport } = makeService();

      const result = await run(baseInput({ upstreamUrl }), service);

      expect(result.kind, upstreamUrl).toBe("ssrf_blocked");
      expect(transport, upstreamUrl).not.toHaveBeenCalled();
    }
  });

  it("rejects malformed/unsupported/credentialed URLs as invalid_config", async () => {
    const cases: Array<[string, string]> = [
      ["", "url_empty"],
      ["not a url", "url_malformed"],
      ["ftp://example.com/file", "url_unsupported_scheme"],
      ["https://user:pass@example.com/", "url_embedded_credentials"],
    ];
    for (const [upstreamUrl, reason] of cases) {
      const { service, transport } = makeService();

      const result = await run(baseInput({ upstreamUrl }), service);

      expect(result, upstreamUrl).toEqual({ kind: "invalid_config", reason });
      expect(transport, upstreamUrl).not.toHaveBeenCalled();
    }
  });

  it("http:// never executes: pre-validation or the runtime gate rejects it", async () => {
    const { service, transport } = makeService();

    const result = await run(baseInput({ upstreamUrl: `http://${PUBLIC_URL.replace("https://", "")}/v1` }), service);

    // In a non-production env pre-validation allows http; the hardened
    // service still refuses to execute it — truthfully invalid_config.
    expect(result.kind).toBe("invalid_config");
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects caller body larger than the 1 MiB gateway cap", async () => {
    const { service, transport } = makeService();

    const result = await run(
      baseInput({
        request: {
          method: "POST",
          callerPathSegments: [],
          callerQuery: new URLSearchParams(),
          callerHeaders: {},
          body: Buffer.alloc(MAX_CALLER_BODY_BYTES + 1),
        },
      }),
      service
    );

    expect(result).toEqual({ kind: "invalid_config", reason: "request_body_too_large" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects path traversal attempts as invalid_config (UPSTREAM_PATH_TRAVERSAL)", async () => {
    const { service, transport } = makeService();

    const result = await run(
      baseInput({
        request: {
          method: "GET",
          callerPathSegments: [".."],
          callerQuery: new URLSearchParams(),
          callerHeaders: {},
          body: null,
        },
      }),
      service
    );

    expect(result).toEqual({ kind: "invalid_config", reason: "UPSTREAM_PATH_TRAVERSAL" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects invalid auth configs with a truthful reason", async () => {
    const cases: Array<[RunUpstreamTestInput["auth"], string]> = [
      [{ type: "BEARER", secret: "" }, "empty_secret"],
      [{ type: "BEARER", secret: "a\nb" }, "secret_contains_newline"],
      [{ type: "API_KEY", headerName: "authorization", secret: "x" }, "forbidden_header_name"],
      [{ type: "API_KEY", headerName: "Bad Header!", secret: "x" }, "invalid_header_name"],
    ];
    for (const [auth, reason] of cases) {
      const { service, transport } = makeService();

      const result = await run(baseInput({ auth }), service);

      expect(result, JSON.stringify(auth)).toEqual({ kind: "invalid_config", reason });
      expect(transport, JSON.stringify(auth)).not.toHaveBeenCalled();
    }
  });
});

describe("runUpstreamTest — preview rendering and bounds", () => {
  it("caps the preview at 64 KiB and flags truncation for large JSON", async () => {
    const big = JSON.stringify({ data: "x".repeat(100 * 1024) });
    const { service } = makeService({ transport: vi.fn(okTransport(200, Buffer.from(big, "utf8"))) });

    const result = await run(baseInput(), service);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.bodyBytes).toBe(Buffer.byteLength(big, "utf8"));
    expect(result.previewTruncated).toBe(true);
    expect(Buffer.byteLength(result.bodyPreview, "utf8")).toBeLessThanOrEqual(
      TEST_PREVIEW_MAX_BYTES
    );
    // The preview is still a prefix of the pretty-printed body.
    expect(result.bodyPreview.startsWith('{\n  "data": "xxx')).toBe(true);
  });

  it("text at exactly 64 KiB is not truncated; one byte over is truncated", async () => {
    const atCap = "a".repeat(64 * 1024);
    const { service: serviceAtCap } = makeService({
      transport: vi.fn(okTransport(200, Buffer.from(atCap, "utf8"), { "content-type": "text/plain" })),
    });

    const atCapResult = await run(baseInput(), serviceAtCap);

    expect(atCapResult.kind).toBe("success");
    if (atCapResult.kind !== "success") return;
    expect(atCapResult.previewTruncated).toBe(false);
    expect(atCapResult.bodyPreview).toBe(atCap);
    expect(atCapResult.isJson).toBe(false);

    const over = "a".repeat(64 * 1024 + 1);
    const { service: serviceOver } = makeService({
      transport: vi.fn(okTransport(200, Buffer.from(over, "utf8"), { "content-type": "text/plain" })),
    });

    const overResult = await run(baseInput(), serviceOver);

    expect(overResult.kind).toBe("success");
    if (overResult.kind !== "success") return;
    expect(overResult.previewTruncated).toBe(true);
    expect(Buffer.byteLength(overResult.bodyPreview, "utf8")).toBe(64 * 1024);
  });

  it("renders binary bodies as metadata with byte count", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { service } = makeService({
      transport: vi.fn(okTransport(200, png, { "content-type": "image/png" })),
    });

    const result = await run(baseInput(), service);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.bodyPreview).toBe("[binary] image/png, 8 bytes");
    expect(result.bodyBytes).toBe(8);
    expect(result.isJson).toBe(false);
    expect(result.previewTruncated).toBe(false);
  });

  it("flags previewTruncated for binary bodies larger than 64 KiB", async () => {
    const big = Buffer.alloc(70 * 1024, 1);
    const { service } = makeService({
      transport: vi.fn(okTransport(200, big, { "content-type": "application/octet-stream" })),
    });

    const result = await run(baseInput(), service);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.bodyPreview).toBe(`[binary] application/octet-stream, ${big.byteLength} bytes`);
    expect(result.previewTruncated).toBe(true);
  });

  it("isJson follows the content type, including charset parameters", async () => {
    const { service } = makeService({
      transport: vi.fn(
        okTransport(200, Buffer.from('{"a":1}'), { "content-type": "application/json; charset=utf-8" })
      ),
    });

    const result = await run(baseInput(), service);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.isJson).toBe(true);
    expect(result.contentType).toBe("application/json; charset=utf-8");
  });

  it("compression regression: gzip upstream bodies are decoded with no stale encoding", async () => {
    const payload = Buffer.from(JSON.stringify({ hello: "world" }));
    const compressed = gzipSync(payload);
    const { service } = makeService({
      transport: vi.fn(
        okTransport(200, compressed, {
          "content-encoding": "gzip",
          "content-length": String(compressed.byteLength),
        })
      ),
    });

    const result = await run(baseInput(), service);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.bodyPreview).toBe('{\n  "hello": "world"\n}');
    expect(result.bodyBytes).toBe(payload.byteLength);
    expect(result.contentType).toBe("application/json");
    expect(result.isJson).toBe(true);
  });

  it("falls back to raw text when a JSON content type carries invalid JSON", async () => {
    const { service } = makeService({ transport: vi.fn(okTransport(200, Buffer.from("{oops"))) });

    const result = await run(baseInput(), service);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.isJson).toBe(true);
    expect(result.bodyPreview).toBe("{oops");
  });
});

describe("runUpstreamTest — preview redaction (echo upstreams)", () => {
  it("redacts the active BEARER secret echoed in the response body", async () => {
    const secret = "sk-test-dummy";
    const { service } = makeService({
      transport: vi.fn(
        okTransport(
          200,
          Buffer.from(JSON.stringify({ headers: { authorization: `Bearer ${secret}` } })),
          { "content-type": "application/json" }
        )
      ),
    });

    const result = await run(baseInput({ auth: { type: "BEARER", secret } }), service);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // The value-substitution leaf rule replaces the whole preview: it
    // contains the marker and never the secret.
    expect(result.bodyPreview).toContain("[REDACTED]");
    expect(result.bodyPreview.includes(secret)).toBe(false);
  });

  it("redacts an API-key secret echoed in the response body", async () => {
    const secret = "k-echo-42";
    const { service } = makeService({
      transport: vi.fn(
        okTransport(
          200,
          Buffer.from(JSON.stringify({ headers: { "x-creator-key": secret } })),
          { "content-type": "application/json" }
        )
      ),
    });

    const result = await run(
      baseInput({ auth: { type: "API_KEY", headerName: "X-Creator-Key", secret } }),
      service
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.bodyPreview).toContain("[REDACTED]");
    expect(result.bodyPreview.includes(secret)).toBe(false);
  });

  it("passes previews without the secret through unchanged (no over-redaction)", async () => {
    const body = JSON.stringify({ ok: true, total: 42 });
    const { service } = makeService({
      transport: vi.fn(okTransport(200, Buffer.from(body))),
    });

    const result = await run(
      baseInput({ auth: { type: "BEARER", secret: "sk-test-dummy" } }),
      service
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.bodyPreview).toBe('{\n  "ok": true,\n  "total": 42\n}');
  });
});

describe("runUpstreamTest — safety invariants", () => {
  it("never calls settlement, ledger, or payout functions", async () => {
    const { service } = makeService();

    const result = await run(baseInput(), service);

    expect(result.kind).toBe("success");
    expect(payoutReserve).not.toHaveBeenCalled();
    expect(ledgerEarning).not.toHaveBeenCalled();
    expect(settlementFactory).not.toHaveBeenCalled();
  });

  it("never logs the transient secret through the real decrypt pipeline", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { service } = makeService();

    const result = await run(baseInput({ auth: { type: "BEARER", secret: BEARER_SECRET } }), service);

    expect(result.kind).toBe("success");
    const captured = [...logSpy.mock.calls, ...errorSpy.mock.calls].map((call) =>
      JSON.stringify(call)
    );
    expect(captured.some((entry) => entry.includes(BEARER_SECRET))).toBe(false);
  });
});
