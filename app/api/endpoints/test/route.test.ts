/**
 * POST /api/endpoints/test — route-level tests.
 *
 * The route wires the REAL test-console core and the REAL crypto over a
 * mocked session, limiter, route repo, and upstream service. Financial
 * modules (payouts/ledger/settlement) are replaced with spies and asserted
 * never to run: the test console must never touch money paths.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// The route modules are server-only; neutralize the guard so the import
// graph loads under vitest.
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  // Deterministic 32-byte test key (base64 of 32 x 0x07), usable inside
  // the hoisted mock factory without imports.
  const testKeyBase64 = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=";
  return {
    testKeyBase64,
    cookies: vi.fn(),
    getSessionFromCookie: vi.fn(),
    rateLimiterCheck: vi.fn(),
    logEvent: vi.fn(),
    getRouteById: vi.fn(),
    executeUpstream: vi.fn(),
    // Financial modules — must never be called by this route.
    reserveOutstandingEarnings: vi.fn(),
    reserveEarningForPayout: vi.fn(),
    createEarningForReceipt: vi.fn(),
    createSettlementService: vi.fn(),
  };
});

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));
vi.mock("@/lib/auth/service", () => ({
  getSessionFromCookie: mocks.getSessionFromCookie,
}));
vi.mock("@/lib/ratelimit/redis-limiter", () => ({
  rateLimiter: { check: mocks.rateLimiterCheck },
}));
vi.mock("@/lib/observability/logger", () => ({
  logEvent: mocks.logEvent,
}));
vi.mock("@/lib/db/routes", () => ({
  getRouteById: mocks.getRouteById,
}));
vi.mock("@/lib/gateway/instance", () => ({
  upstreamService: { executeUpstream: mocks.executeUpstream },
  encryptionKey: () => Buffer.from(mocks.testKeyBase64, "base64"),
}));
vi.mock("@/lib/db/payouts", () => ({
  reserveOutstandingEarnings: mocks.reserveOutstandingEarnings,
  reserveEarningForPayout: mocks.reserveEarningForPayout,
}));
vi.mock("@/lib/db/ledger", () => ({
  createEarningForReceipt: mocks.createEarningForReceipt,
}));
vi.mock("@/lib/gateway/settlement-service", () => ({
  createSettlementService: mocks.createSettlementService,
}));

import { decryptUpstreamSecret, encryptUpstreamSecret } from "@/lib/crypto/upstream-secrets";
import { POST } from "./route";

const TEST_KEY = Buffer.from(mocks.testKeyBase64, "base64");
const STORED_SECRET = "sk_stored_secret_456";
const DRAFT_SECRET = "sk_draft_secret_xyz";
const PUBLIC_URL = "https://93.184.216.34";

function testRequest(body: unknown): Request {
  return new Request("http://metron.test/api/endpoints/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function authenticatedSession() {
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "session-token" }) });
  mocks.getSessionFromCookie.mockResolvedValue({
    authenticated: true,
    developer: {
      id: "dev-1",
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    },
  });
}

function allowRateLimit() {
  mocks.rateLimiterCheck.mockResolvedValue({
    allowed: true,
    retryAfterSeconds: 0,
    degraded: false,
  });
}

function successExecution() {
  mocks.executeUpstream.mockResolvedValue({
    kind: "success",
    status: 200,
    latencyMs: 12,
    responseBody: Buffer.from('{"ok":true}'),
    safeResponseHeaders: { "content-type": "application/json" },
  });
}

function draftBody(
  overrides: {
    draft?: Record<string, unknown>;
    request?: Record<string, unknown>;
    [key: string]: unknown;
  } = {}
) {
  const { draft, request, ...rest } = overrides;
  return {
    draft: { upstreamUrl: PUBLIC_URL, auth: { type: "none" }, ...draft },
    request: { method: "GET", ...request },
    ...rest,
  };
}

const OWNED_ROUTE = {
  id: "route-1",
  developerId: "dev-1",
  slug: "abc123",
  name: "Test API",
  description: null,
  upstreamUrl: `${PUBLIC_URL}/api`,
  encryptedUpstreamAuth: encryptUpstreamSecret(STORED_SECRET, TEST_KEY, {
    authType: "BEARER",
    headerName: null,
  }),
  priceMicroUsdc: 1000000,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/endpoints/test (route-level)", () => {
  it("returns 401 UNAUTHENTICATED without a valid session and never touches the limiter", async () => {
    mocks.cookies.mockResolvedValue({ get: () => undefined });
    mocks.getSessionFromCookie.mockResolvedValue({ authenticated: false });

    const response = await POST(testRequest(draftBody()));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHENTICATED" });
    expect(mocks.rateLimiterCheck).not.toHaveBeenCalled();
    expect(mocks.executeUpstream).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_BODY for non-JSON bodies", async () => {
    authenticatedSession();

    const response = await POST(testRequest("{not json"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_BODY" });
  });

  it("returns 400 INVALID_BODY when neither endpointId nor draft is supplied", async () => {
    authenticatedSession();

    const response = await POST(testRequest({ request: { method: "GET" } }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_BODY" });
  });

  it("returns 400 INVALID_BODY when both endpointId and draft are supplied", async () => {
    authenticatedSession();

    const response = await POST(
      testRequest({ endpointId: "route-1", draft: { upstreamUrl: PUBLIC_URL, auth: { type: "none" } }, request: { method: "GET" } })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_BODY" });
  });

  it("returns 400 INVALID_BODY for GET requests with a body", async () => {
    authenticatedSession();

    const response = await POST(testRequest(draftBody({ request: { method: "GET", body: "x" } })));

    expect(response.status).toBe(400);
    expect(mocks.executeUpstream).not.toHaveBeenCalled();
  });

  it("returns 400 REQUEST_TOO_LARGE before rate limiting when the request body exceeds 1 MiB", async () => {
    authenticatedSession();

    const response = await POST(
      testRequest(draftBody({ request: { method: "POST", body: "a".repeat(1024 * 1024 + 1) } }))
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("REQUEST_TOO_LARGE");
    expect(mocks.rateLimiterCheck).not.toHaveBeenCalled();
    expect(mocks.executeUpstream).not.toHaveBeenCalled();
  });

  it("returns 429 RATE_LIMITED with retry-after and never executes", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 60,
      degraded: false,
    });

    const response = await POST(testRequest(draftBody()));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    const body = await response.json();
    expect(body.error).toBe("RATE_LIMITED");
    expect(body.retryAfterSeconds).toBe(60);
    expect(mocks.executeUpstream).not.toHaveBeenCalled();
  });

  it("fails open: a degraded limiter never 429s the caller", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: true,
    });
    successExecution();

    const response = await POST(testRequest(draftBody()));

    expect(response.status).toBe(200);
    expect(mocks.logEvent).toHaveBeenCalledWith("rate_limit_degraded", {
      scope: "endpoint-test",
    });
  });

  it("draft path: runs a NONE test and wires the endpoint-test policy to the trust-gated IP", async () => {
    authenticatedSession();
    allowRateLimit();
    successExecution();

    const response = await POST(testRequest(draftBody()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result).toMatchObject({ kind: "success", status: 200, isJson: true });
    // The core pretty-prints JSON previews.
    expect(body.result.bodyPreview).toBe('{\n  "ok": true\n}');

    expect(mocks.rateLimiterCheck).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "endpoint-test", identifier: "untrusted" })
    );
    expect(mocks.executeUpstream).toHaveBeenCalledTimes(1);
    const executionInput = mocks.executeUpstream.mock.calls[0][0];
    expect(executionInput.route.upstreamUrl).toBe(PUBLIC_URL);
    expect(executionInput.route.encryptedUpstreamAuth).toBeNull();
    expect(executionInput.method).toBe("GET");
  });

  it("draft path: transient BEARER secret is encrypted, executed, and never disclosed or logged", async () => {
    authenticatedSession();
    allowRateLimit();
    successExecution();

    const response = await POST(
      testRequest(
        draftBody({ draft: { auth: { type: "bearer", secret: DRAFT_SECRET } } })
      )
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    // Never returned to the caller.
    expect(text.includes(DRAFT_SECRET)).toBe(false);

    // The service received a REAL encrypted envelope that decrypts back to
    // the transient secret — the same encrypt -> decrypt path as publish.
    const executionInput = mocks.executeUpstream.mock.calls[0][0];
    expect(typeof executionInput.route.encryptedUpstreamAuth).toBe("string");
    const decrypted = decryptUpstreamSecret(
      executionInput.route.encryptedUpstreamAuth,
      TEST_KEY
    );
    expect(decrypted.secret).toBe(DRAFT_SECRET);
    expect(decrypted.authType).toBe("BEARER");
  });

  it("draft path: caller headers pass through the gateway filter policy before the core", async () => {
    authenticatedSession();
    allowRateLimit();
    successExecution();

    const response = await POST(
      testRequest(
        draftBody({
          draft: { auth: { type: "none" } },
          request: {
            method: "GET",
            path: "/v1/translate",
            query: { lang: "en" },
            headers: {
              accept: "application/json",
              authorization: "Bearer attacker",
              "x-forwarded-for": "6.6.6.6",
            },
          },
        })
      )
    );

    expect(response.status).toBe(200);
    const executionInput = mocks.executeUpstream.mock.calls[0][0];
    // The route pre-filters with filterCallerHeaders: only allowlisted
    // headers survive; spoofed credentials/hop headers are gone.
    expect(executionInput.callerHeaders).toEqual({ accept: "application/json" });
    expect(executionInput.callerPathSegments).toEqual(["v1", "translate"]);
    expect(executionInput.callerQuery.get("lang")).toBe("en");
  });

  it("endpointId path: stored encrypted credential is used server-side without disclosure", async () => {
    authenticatedSession();
    allowRateLimit();
    successExecution();
    mocks.getRouteById.mockResolvedValue(OWNED_ROUTE);

    const response = await POST(
      testRequest({ endpointId: "route-1", request: { method: "GET" } })
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text.includes(STORED_SECRET)).toBe(false);
    expect(text.includes(OWNED_ROUTE.encryptedUpstreamAuth)).toBe(false);

    expect(mocks.getRouteById).toHaveBeenCalledWith("route-1");
    const executionInput = mocks.executeUpstream.mock.calls[0][0];
    expect(executionInput.route.upstreamUrl).toBe(`${PUBLIC_URL}/api`);
    // The stored envelope is re-encrypted transiently (never the stored
    // ciphertext), and decrypts back to the stored secret.
    expect(executionInput.route.encryptedUpstreamAuth).not.toBe(
      OWNED_ROUTE.encryptedUpstreamAuth
    );
    const decrypted = decryptUpstreamSecret(
      executionInput.route.encryptedUpstreamAuth,
      TEST_KEY
    );
    expect(decrypted.secret).toBe(STORED_SECRET);
  });

  it("endpointId path: an unknown or foreign route is a 404", async () => {
    authenticatedSession();
    allowRateLimit();

    mocks.getRouteById.mockResolvedValue(null);
    const notFound = await POST(testRequest({ endpointId: "nope", request: { method: "GET" } }));
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: "ENDPOINT_NOT_FOUND" });

    mocks.getRouteById.mockResolvedValue({ ...OWNED_ROUTE, developerId: "dev-2" });
    const foreign = await POST(testRequest({ endpointId: "route-1", request: { method: "GET" } }));
    expect(foreign.status).toBe(404);
    expect(mocks.executeUpstream).not.toHaveBeenCalled();
  });

  it("returns 500 INTERNAL_ERROR when the stored credential cannot be decrypted", async () => {
    authenticatedSession();
    allowRateLimit();
    mocks.getRouteById.mockResolvedValue({
      ...OWNED_ROUTE,
      encryptedUpstreamAuth: "not-an-envelope",
    });

    const response = await POST(testRequest({ endpointId: "route-1", request: { method: "GET" } }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "INTERNAL_ERROR" });
    expect(mocks.executeUpstream).not.toHaveBeenCalled();
  });

  it("returns 500 INTERNAL_ERROR when the route repository throws", async () => {
    authenticatedSession();
    allowRateLimit();
    mocks.getRouteById.mockRejectedValue(new Error("db down"));

    const response = await POST(testRequest({ endpointId: "route-1", request: { method: "GET" } }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "INTERNAL_ERROR" });
  });

  it("maps upstream non-2xx results truthfully through the console result", async () => {
    authenticatedSession();
    allowRateLimit();
    mocks.executeUpstream.mockResolvedValue({
      kind: "failed",
      errorCode: "UPSTREAM_NON_2XX",
      status: 503,
      latencyMs: 30,
    });

    const response = await POST(testRequest(draftBody()));

    expect(response.status).toBe(200);
    const body = await response.json();
    // The core measures its own latency; the upstream status and error
    // code are passed through truthfully.
    expect(body.result).toMatchObject({
      kind: "non_2xx",
      status: 503,
      errorCode: "UPSTREAM_NON_2XX",
    });
    expect(body.result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("blocks SSRF destinations pre-execution (draft path)", async () => {
    authenticatedSession();
    allowRateLimit();

    const response = await POST(
      testRequest(draftBody({ draft: { upstreamUrl: "https://169.254.169.254/latest/meta-data" } }))
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result).toEqual({ kind: "ssrf_blocked", reason: "url_blocked_ip" });
    expect(mocks.executeUpstream).not.toHaveBeenCalled();
  });

  it("never accepts identity fields from the body (session-bound surface)", async () => {
    authenticatedSession();
    allowRateLimit();
    successExecution();

    const response = await POST(
      testRequest({
        ...draftBody(),
        developerId: "attacker-id",
        creatorId: "attacker-id",
        walletAddress: "0x0000000000000000000000000000000000000000",
      })
    );

    expect(response.status).toBe(200);
    // The console context identity is fixed; the session identity owns
    // nothing here (no ownership read happens on the draft path).
    const executionInput = mocks.executeUpstream.mock.calls[0][0];
    expect(executionInput.route.developerId).toBe("test-console");
  });

  it("never touches settlement, ledger, or payout functions", async () => {
    authenticatedSession();
    allowRateLimit();
    successExecution();

    const response = await POST(
      testRequest(draftBody({ draft: { auth: { type: "bearer", secret: DRAFT_SECRET } } }))
    );

    expect(response.status).toBe(200);
    expect(mocks.reserveOutstandingEarnings).not.toHaveBeenCalled();
    expect(mocks.reserveEarningForPayout).not.toHaveBeenCalled();
    expect(mocks.createEarningForReceipt).not.toHaveBeenCalled();
    expect(mocks.createSettlementService).not.toHaveBeenCalled();
  });
});
