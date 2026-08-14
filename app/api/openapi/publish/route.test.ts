/**
 * POST /api/openapi/publish — route-level tests.
 *
 * The route wires the REAL error mapping (`toEndpointErrorResponse`) over
 * a mocked session, limiter, logger, and endpoint service. The endpoint
 * service instance is replaced so the assertions focus on the batch
 * contract: session-derived ownership, per-operation results, sequential
 * deterministic execution, and partial-failure semantics.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// The route modules are server-only; neutralize the guard so the import
// graph loads under vitest.
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getSessionFromCookie: vi.fn(),
  rateLimiterCheck: vi.fn(),
  logEvent: vi.fn(),
  endpointCreate: vi.fn(),
}));

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
vi.mock("@/lib/endpoints/instance", () => ({
  endpointService: { create: mocks.endpointCreate },
}));

import { EndpointServiceError } from "@/lib/endpoints/service";
import { POST } from "./route";

const PRODUCTION_BASE = "https://metron.app";

const VALID_OPERATIONS = [
  {
    key: "listPets",
    name: "List pets",
    description: "Lists all pets",
    upstreamUrl: "https://api.example.com/v1/pets",
    priceUsdc: "0.005",
    auth: { type: "bearer" as const, secret: "sk_live_123" },
  },
  {
    key: "getPet",
    name: "Get pet",
    upstreamUrl: "https://api.example.com/v1/pets/{petId}",
    priceUsdc: "0.01",
    auth: { type: "none" as const },
  },
];

function endpointView(id: string, slug: string) {
  return {
    id,
    slug,
    name: "route",
    description: null,
    upstreamUrl: "https://api.example.com/upstream",
    priceMicroUsdc: 5000,
    priceUsdc: "0.005",
    isActive: true,
    hasUpstreamAuth: false,
    upstreamAuthType: "NONE",
    headerName: null,
    poweredUrl: `${PRODUCTION_BASE}/p/${slug}`,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function publishRequest(body: unknown): Request {
  return new Request("http://metron.test/api/openapi/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Authenticated session + a session cookie present. */
function authenticatedSession(developerId = "dev-1") {
  mocks.cookies.mockResolvedValue({
    get: () => ({ value: "session-token" }),
  });
  mocks.getSessionFromCookie.mockResolvedValue({
    authenticated: true,
    developer: {
      id: developerId,
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

/** Default happy path: every create succeeds with canonical powered URLs. */
function everyCreateSucceeds() {
  let callIndex = 0;
  mocks.endpointCreate.mockImplementation(() => {
    callIndex += 1;
    return Promise.resolve(endpointView(`id-${callIndex}`, `slug-${callIndex}`));
  });
}

describe("POST /api/openapi/publish (route-level)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 UNAUTHENTICATED without a valid session and never touches the limiter or service", async () => {
    mocks.cookies.mockResolvedValue({ get: () => undefined });
    mocks.getSessionFromCookie.mockResolvedValue({ authenticated: false });

    const response = await POST(
      publishRequest({ operations: VALID_OPERATIONS })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHENTICATED" });
    expect(mocks.rateLimiterCheck).not.toHaveBeenCalled();
    expect(mocks.endpointCreate).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_BODY for non-JSON bodies", async () => {
    authenticatedSession();

    const response = await POST(publishRequest("{not json"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_BODY" });
    expect(mocks.endpointCreate).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_BODY when operations is missing or empty", async () => {
    authenticatedSession();

    const missing = await POST(publishRequest({}));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "INVALID_BODY" });

    const empty = await POST(publishRequest({ operations: [] }));
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "INVALID_BODY" });
    expect(mocks.endpointCreate).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_BODY for an oversized batch (> 50 operations)", async () => {
    authenticatedSession();

    const oversized = Array.from({ length: 51 }, (_, i) => ({
      key: `op-${i}`,
      name: `Operation ${i}`,
      upstreamUrl: "https://api.example.com/pets",
      priceUsdc: "0.005",
      auth: { type: "none" },
    }));
    const response = await POST(publishRequest({ operations: oversized }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_BODY" });
    // Rejected before the limiter and before any create.
    expect(mocks.rateLimiterCheck).not.toHaveBeenCalled();
    expect(mocks.endpointCreate).not.toHaveBeenCalled();
  });

  it("accepts a batch exactly at the 50-operation bound", async () => {
    authenticatedSession();
    allowRateLimit();
    everyCreateSucceeds();

    const atBound = Array.from({ length: 50 }, (_, i) => ({
      key: `op-${i}`,
      name: `Operation ${i}`,
      upstreamUrl: "https://api.example.com/pets",
      priceUsdc: "0.005",
      auth: { type: "none" },
    }));
    const response = await POST(publishRequest({ operations: atBound }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toHaveLength(50);
    expect(mocks.endpointCreate).toHaveBeenCalledTimes(50);
  });

  it("creates every operation as the session developer and returns per-op results", async () => {
    authenticatedSession("dev-session-42");
    allowRateLimit();
    everyCreateSucceeds();

    const response = await POST(
      publishRequest({ operations: VALID_OPERATIONS })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual([
      {
        key: "listPets",
        ok: true,
        id: "id-1",
        slug: "slug-1",
        poweredUrl: "https://metron.app/p/slug-1",
      },
      {
        key: "getPet",
        ok: true,
        id: "id-2",
        slug: "slug-2",
        poweredUrl: "https://metron.app/p/slug-2",
      },
    ]);

    // Ownership is ALWAYS the session developer id — the service receives
    // exactly the parsed operation inputs, in body order (sequential,
    // deterministic — no parallel creates).
    expect(mocks.endpointCreate).toHaveBeenCalledTimes(2);
    expect(mocks.endpointCreate.mock.calls.map((call) => call[0])).toEqual([
      "dev-session-42",
      "dev-session-42",
    ]);
    expect(mocks.endpointCreate.mock.calls[0][1]).toEqual({
      name: "List pets",
      description: "Lists all pets",
      upstreamUrl: "https://api.example.com/v1/pets",
      priceUsdc: "0.005",
      auth: { type: "bearer", secret: "sk_live_123" },
    });
    expect(mocks.endpointCreate.mock.calls[1][1]).toEqual({
      name: "Get pet",
      upstreamUrl: "https://api.example.com/v1/pets/{petId}",
      priceUsdc: "0.01",
      auth: { type: "none" },
    });
    // The client-ip wiring runs for real: with the proxy-trust flag off
    // (default), every caller shares the "untrusted" bucket.
    expect(mocks.rateLimiterCheck).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "openapi-publish", identifier: "untrusted" })
    );
  });

  it("never accepts developerId or wallet from the body (session-bound surface)", async () => {
    authenticatedSession("dev-session-42");
    allowRateLimit();
    everyCreateSucceeds();

    const response = await POST(
      publishRequest({
        developerId: "attacker-id",
        walletAddress: "0x0000000000000000000000000000000000000000",
        operations: [
          {
            key: "listPets",
            name: "List pets",
            upstreamUrl: "https://api.example.com/pets",
            priceUsdc: "0.005",
            auth: { type: "none" },
            id: "attacker-supplied-id",
            slug: "attacker-supplied-slug",
          },
        ],
      })
    );

    expect(response.status).toBe(200);
    // Identity and id fields are stripped by the schema — the service is
    // called with the session developer id only, and the route never
    // invents or trusts ids.
    expect(mocks.endpointCreate).toHaveBeenCalledTimes(1);
    expect(mocks.endpointCreate).toHaveBeenCalledWith(
      "dev-session-42",
      {
        name: "List pets",
        upstreamUrl: "https://api.example.com/pets",
        priceUsdc: "0.005",
        auth: { type: "none" },
      }
    );
  });

  it("passes through the powered URL computed from the production base", async () => {
    authenticatedSession();
    allowRateLimit();
    mocks.endpointCreate.mockResolvedValue(
      endpointView("id-1", "canonical-slug")
    );

    const response = await POST(
      publishRequest({ operations: [VALID_OPERATIONS[0]] })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // The canonical powered URL (NEXT_PUBLIC_APP_URL-backed) is surfaced
    // unchanged; the route never reconstructs or rewrites it.
    expect(body.results[0]).toEqual({
      key: "listPets",
      ok: true,
      id: "id-1",
      slug: "canonical-slug",
      poweredUrl: "https://metron.app/p/canonical-slug",
    });
  });

  it("partial failure: one invalid operation fails, others are still created", async () => {
    authenticatedSession();
    allowRateLimit();
    mocks.endpointCreate
      .mockResolvedValueOnce(endpointView("id-1", "slug-1"))
      .mockRejectedValueOnce(new EndpointServiceError("INVALID_PRICE", 400))
      .mockResolvedValueOnce(endpointView("id-3", "slug-3"));

    const operations = [
      VALID_OPERATIONS[0],
      { ...VALID_OPERATIONS[1], key: "badPrice", priceUsdc: "0.0000001" },
      { key: "extra", name: "Extra", upstreamUrl: "https://api.example.com/x", priceUsdc: "0.01", auth: { type: "none" } },
    ];
    const response = await POST(publishRequest({ operations }));

    // Partial-failure semantics: HTTP 200 with per-op results carrying
    // both outcomes; every operation is attempted despite the failure.
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual([
      { key: "listPets", ok: true, id: "id-1", slug: "slug-1", poweredUrl: "https://metron.app/p/slug-1" },
      { key: "badPrice", ok: false, error: "INVALID_PRICE" },
      { key: "extra", ok: true, id: "id-3", slug: "slug-3", poweredUrl: "https://metron.app/p/slug-3" },
    ]);
    expect(mocks.endpointCreate).toHaveBeenCalledTimes(3);
  });

  it("maps every per-operation service failure to its existing machine code", async () => {
    authenticatedSession();
    allowRateLimit();
    mocks.endpointCreate
      .mockRejectedValueOnce(new EndpointServiceError("UNSAFE_UPSTREAM_URL", 400))
      .mockRejectedValueOnce(new EndpointServiceError("INVALID_AUTH_CONFIG", 400))
      .mockRejectedValueOnce(new Error("boom")); // non-service error -> INTERNAL_ERROR

    const operations = [
      { key: "a", name: "A", upstreamUrl: "https://api.example.com/a", priceUsdc: "0.01", auth: { type: "none" } },
      { key: "b", name: "B", upstreamUrl: "https://api.example.com/b", priceUsdc: "0.01", auth: { type: "none" } },
      { key: "c", name: "C", upstreamUrl: "https://api.example.com/c", priceUsdc: "0.01", auth: { type: "none" } },
    ];
    const response = await POST(publishRequest({ operations }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results.map((r: { key: string; ok: boolean; error?: string }) => r.error)).toEqual([
      "UNSAFE_UPSTREAM_URL",
      "INVALID_AUTH_CONFIG",
      "INTERNAL_ERROR",
    ]);
    // The batch keeps going after each failure (no abort, no leak).
    expect(mocks.endpointCreate).toHaveBeenCalledTimes(3);
  });

  it("duplicate-submission: two identical publishes create twice (no server idempotency key in V1.5A)", async () => {
    authenticatedSession();
    allowRateLimit();
    everyCreateSucceeds();

    const first = await POST(publishRequest({ operations: VALID_OPERATIONS }));
    // Fresh mock sequence so the identical request yields the identical
    // server view (real service behavior, modulo slug randomness).
    everyCreateSucceeds();
    const second = await POST(publishRequest({ operations: VALID_OPERATIONS }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // Documented limitation: the server has no idempotency key; the
    // client-side in-flight guard + retry-only-failed semantics protect
    // the UI. The server contract is deterministic per-op results — it
    // never invents ids or dedupes.
    expect(mocks.endpointCreate).toHaveBeenCalledTimes(4);
    const firstResults = await first.json();
    const secondResults = await second.json();
    expect(firstResults.results).toEqual(secondResults.results);
  });

  it("returns 429 RATE_LIMITED with a retry-after header when over the limit", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 45,
      degraded: false,
    });

    const response = await POST(
      publishRequest({ operations: VALID_OPERATIONS })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("45");
    expect(await response.json()).toEqual({
      error: "RATE_LIMITED",
      message: "Too many publish requests. Try again later.",
      retryAfterSeconds: 45,
    });
    // No creates run when the caller is limited.
    expect(mocks.endpointCreate).not.toHaveBeenCalled();
  });

  it("fails open: a degraded limiter never 429s the caller", async () => {
    authenticatedSession();
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: true,
    });
    everyCreateSucceeds();

    const response = await POST(
      publishRequest({ operations: VALID_OPERATIONS })
    );

    expect(response.status).toBe(200);
    expect(mocks.logEvent).toHaveBeenCalledWith("rate_limit_degraded", {
      scope: "openapi-publish",
    });
  });
});
