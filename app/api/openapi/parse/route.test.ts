import { afterEach, describe, expect, it, vi } from "vitest";

// The route modules are server-only; neutralize the guard so the import
// graph loads under vitest. The heavy deps are replaced with controllable
// fakes: the Redis-backed limiter, the session auth service, the parse
// core, and the logger. `next/headers` is faked so the session-cookie
// read is deterministic.
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  rateLimiterCheck: vi.fn(),
  getSessionFromCookie: vi.fn(),
  parseOpenApiSpec: vi.fn(),
  validateUpstreamUrl: vi.fn(),
  logEvent: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));
vi.mock("@/lib/ratelimit/redis-limiter", () => ({
  rateLimiter: { check: mocks.rateLimiterCheck },
}));
vi.mock("@/lib/auth/service", () => ({
  getSessionFromCookie: mocks.getSessionFromCookie,
}));
vi.mock("@/lib/openapi", () => ({
  parseOpenApiSpec: mocks.parseOpenApiSpec,
  DEFAULT_MAX_SPEC_BYTES: 1024 * 1024,
}));
vi.mock("@/lib/ssrf/validate", () => ({
  validateUpstreamUrl: mocks.validateUpstreamUrl,
}));
vi.mock("@/lib/observability/logger", () => ({
  logEvent: mocks.logEvent,
}));

import { POST } from "./route";

const MAX_SPEC_BYTES = 1024 * 1024;

const VALID_SPEC = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Pets API", version: "1.0.0" },
  servers: [{ url: "https://api.example.com/v1" }],
  paths: {
    "/pets": {
      get: {
        operationId: "listPets",
        responses: { "200": { description: "ok" } },
      },
    },
  },
});

const OPERATIONS = [
  {
    method: "get",
    path: "/pets",
    operationId: "listPets",
    summary: null,
    description: null,
    tags: [],
    hasRequestBody: false,
    responseCodes: ["200"],
    effectiveServerUrl: "https://api.example.com/v1",
    resolvedTemplate: "https://api.example.com/v1/pets",
    callerPathTemplate: null,
    hasPathParams: false,
    securityHints: [],
    publishable: true,
    blockedReason: null,
  },
];

function parseRequest(body: unknown): Request {
  return new Request("http://metron.test/api/openapi/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Authenticated session + a session cookie present. */
function authenticatedSession() {
  mocks.cookies.mockResolvedValue({
    get: () => ({ value: "session-token" }),
  });
  mocks.getSessionFromCookie.mockResolvedValue({
    authenticated: true,
    developer: {
      id: "dev-1",
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    },
  });
}

describe("POST /api/openapi/parse (route-level)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 UNAUTHENTICATED without a valid session and never touches the limiter", async () => {
    mocks.cookies.mockResolvedValue({ get: () => undefined });
    mocks.getSessionFromCookie.mockResolvedValue({ authenticated: false });

    const response = await POST(parseRequest({ spec: VALID_SPEC }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHENTICATED" });
    expect(mocks.rateLimiterCheck).not.toHaveBeenCalled();
    expect(mocks.parseOpenApiSpec).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_BODY for non-JSON bodies", async () => {
    authenticatedSession();

    const response = await POST(parseRequest("{not json"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_BODY" });
  });

  it("returns 400 INVALID_BODY when the body misses the spec field", async () => {
    authenticatedSession();

    const response = await POST(parseRequest({ fileName: "openapi.json" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_BODY" });
  });

  it("returns 200 with discovered operations when under the limit", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: false,
    });
    mocks.parseOpenApiSpec.mockResolvedValue({
      ok: true,
      operations: OPERATIONS,
      warnings: ["no server url"],
    });

    const response = await POST(parseRequest({ spec: VALID_SPEC }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.operations).toEqual(OPERATIONS);
    // The response contract is the normalized model only: warnings and
    // raw spec text must never leak.
    expect(body.warnings).toBeUndefined();
    expect(body.spec).toBeUndefined();
    // The parse core receives exactly the spec string plus the
    // publication-grade DNS hook for parse-time publishability truth.
    expect(mocks.parseOpenApiSpec).toHaveBeenCalledWith(
      VALID_SPEC,
      expect.objectContaining({ resolveServerUrl: expect.any(Function) })
    );
    // The client-ip wiring runs for real: with the proxy-trust flag off
    // (default), every caller shares the "untrusted" bucket.
    expect(mocks.rateLimiterCheck).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "openapi-parse", identifier: "untrusted" })
    );
  });

  it("returns 429 RATE_LIMITED with a retry-after header when over the limit", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 60,
      degraded: false,
    });

    const response = await POST(parseRequest({ spec: VALID_SPEC }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({
      error: "RATE_LIMITED",
      message: "Too many spec parse requests. Try again later.",
      retryAfterSeconds: 60,
    });
    expect(mocks.parseOpenApiSpec).not.toHaveBeenCalled();
  });

  it("fails open: a degraded limiter never 429s the caller", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: true,
    });
    mocks.parseOpenApiSpec.mockResolvedValue({
      ok: true,
      operations: OPERATIONS,
      warnings: [],
    });

    const response = await POST(parseRequest({ spec: VALID_SPEC }));

    expect(response.status).toBe(200);
    expect(mocks.logEvent).toHaveBeenCalledWith("rate_limit_degraded", {
      scope: "openapi-parse",
    });
  });

  it("returns 413 SPEC_TOO_LARGE before parsing when the spec exceeds 1 MiB", async () => {
    authenticatedSession();

    const response = await POST(
      parseRequest({ spec: "a".repeat(MAX_SPEC_BYTES + 1) })
    );

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toBe("SPEC_TOO_LARGE");
    // Rejected before the limiter and before the parse core.
    expect(mocks.rateLimiterCheck).not.toHaveBeenCalled();
    expect(mocks.parseOpenApiSpec).not.toHaveBeenCalled();
  });

  it("accepts a spec at the 1 MiB declared-length bound", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: false,
    });
    mocks.parseOpenApiSpec.mockResolvedValue({
      ok: true,
      operations: [],
      warnings: [],
    });

    // The declared-length guard caps the WHOLE JSON body at 1 MiB, so a
    // max-size spec must leave headroom for the {"spec":"..."} envelope
    // (the post-parse byte check on the spec itself remains the backstop).
    const spec = "a".repeat(MAX_SPEC_BYTES - 64);

    const response = await POST(parseRequest({ spec }));

    expect(response.status).toBe(200);
    expect(mocks.parseOpenApiSpec).toHaveBeenCalledTimes(1);
  });

  it("returns 413 SPEC_TOO_LARGE from the declared content-length guard before JSON parsing or the limiter", async () => {
    authenticatedSession();
    // Deliberately NOT valid JSON: proves the guard fires before
    // request.json() buffers the body.
    const body = "x".repeat(MAX_SPEC_BYTES + 64);

    const response = await POST(
      new Request("http://metron.test/api/openapi/parse", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(body.length),
        },
        body,
      })
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "SPEC_TOO_LARGE",
      message: `Spec exceeds the ${MAX_SPEC_BYTES}-byte limit`,
    });
    expect(mocks.rateLimiterCheck).not.toHaveBeenCalled();
    expect(mocks.parseOpenApiSpec).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_SPEC with a machine reason and sanitized message", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: false,
    });
    mocks.parseOpenApiSpec.mockResolvedValue({
      ok: false,
      error: "validation_failed",
      message: "OpenAPI validation failed (2 issues)",
    });

    const response = await POST(parseRequest({ spec: VALID_SPEC }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "INVALID_SPEC",
      reason: "validation_failed",
      message: "OpenAPI validation failed (2 issues)",
    });
  });

  it("maps every parse failure code to a machine reason (e.g. unsupported_version)", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: false,
    });
    mocks.parseOpenApiSpec.mockResolvedValue({
      ok: false,
      error: "unsupported_version",
    });

    const response = await POST(parseRequest({ spec: VALID_SPEC }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "INVALID_SPEC",
      reason: "unsupported_version",
    });
  });

  it("never accepts ids or identity from the body (session-bound surface)", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: false,
    });
    mocks.parseOpenApiSpec.mockResolvedValue({
      ok: true,
      operations: [],
      warnings: [],
    });

    const response = await POST(
      parseRequest({
        spec: VALID_SPEC,
        developerId: "attacker-id",
        creatorId: "attacker-id",
        walletAddress: "0x0000000000000000000000000000000000000000",
      })
    );

    expect(response.status).toBe(200);
    // The core is called with exactly the spec plus the DNS hook —
    // identity fields are stripped by the schema and never trusted from
    // the body.
    expect(mocks.parseOpenApiSpec).toHaveBeenCalledTimes(1);
    expect(mocks.parseOpenApiSpec).toHaveBeenCalledWith(
      VALID_SPEC,
      expect.objectContaining({ resolveServerUrl: expect.any(Function) })
    );
  });

  it("returns 500 INTERNAL_ERROR when the parse core throws", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: false,
    });
    mocks.parseOpenApiSpec.mockRejectedValue(new Error("boom"));

    const response = await POST(parseRequest({ spec: VALID_SPEC }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "INTERNAL_ERROR" });
  });

  it("passes a DNS-checking resolveServerUrl hook into the parse core so private-resolving servers are blocked", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: false,
    });
    const upstreamUrl = "https://internal.example.com/v1";
    // The hostname resolves to a private IP: the publication-grade DNS
    // check fails closed with the same reason the publish path uses.
    mocks.validateUpstreamUrl.mockResolvedValue({
      ok: false,
      reason: "url_resolves_to_blocked_ip",
    });
    // Emulate the real parse core: it consults the injected hook for the
    // operation's effective server URL and marks the operation blocked.
    mocks.parseOpenApiSpec.mockImplementation(async (_spec, opts) => {
      const verdict = await opts?.resolveServerUrl?.(upstreamUrl);
      return {
        ok: true,
        operations: [
          {
            ...OPERATIONS[0],
            effectiveServerUrl: upstreamUrl,
            publishable: verdict?.ok === true,
            blockedReason: verdict?.ok === true ? null : "url_resolves_to_blocked_ip",
          },
        ],
        warnings: [],
      };
    });

    const response = await POST(parseRequest({ spec: VALID_SPEC }));

    expect(response.status).toBe(200);
    const body = await response.json();
    // The operation returned for the private-resolving server is blocked
    // at parse time — "Ready" is never shown for it.
    expect(body.operations[0]).toMatchObject({
      publishable: false,
      blockedReason: "url_resolves_to_blocked_ip",
    });
    // The hook is publication-grade: validateUpstreamUrl runs with DNS
    // resolution enabled against the operation's effective server URL.
    expect(mocks.validateUpstreamUrl).toHaveBeenCalledWith(upstreamUrl, {
      resolveDns: true,
    });
  });
});
