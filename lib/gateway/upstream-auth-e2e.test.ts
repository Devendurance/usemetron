/**
 * M11.1 sect. 4: end-to-end auth fixture tests (A-H) through the REAL
 * service path (`createUpstreamService`): header filtering,
 * creator-credential decryption, and creator-header injection are all real.
 *
 * Fixture discipline (the ONLY test seam): SSRF/pinning is replaced -
 * `resolveAddresses` returns a stand-in public address (so the runtime pin
 * check passes) and the injected transport connects to a REAL `node:http`
 * server bound to 127.0.0.1 on an ephemeral port. Everything else in the
 * exchange is genuine: the fixture returns 200 + a marker body ONLY when
 * the expected auth header (exact name + exact value) is present, else
 * 401. No real DNS is touched (the resolver is injected), so the suite is
 * hermetic; production still rejects HTTP upstreams (see the existing
 * `UPSTREAM_HTTP_NOT_ALLOWED` unit test) - `rejectHttp: false` below is
 * confined to this loopback fixture.
 */

import { describe, expect, it, vi } from "vitest";
import { createServer, request as httpRequest } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

import {
  decryptUpstreamSecret,
  encryptUpstreamSecret,
  loadUpstreamEncryptionKey,
} from "../crypto/upstream-secrets";
import { validateUpstreamUrl } from "../ssrf/validate";
import {
  createEndpointService,
  type RouteRepository,
  type RouteRow,
} from "../endpoints/service";
import {
  createUpstreamService,
  type UpstreamExecutionInput,
  type UpstreamRouteContext,
} from "./upstream-service";
import type { UpstreamTransport, UpstreamTransportResult } from "./upstream-client";
import { UPSTREAM_ERROR_CODES } from "./limits";

/** Test key for encrypting/decrypting dummy credentials (never a real key). */
const KEY = loadUpstreamEncryptionKey(Buffer.alloc(32, 9).toString("base64"));

/** Dummy credentials only - the user's real CMC key never appears in tests. */
const CMC_KEY = "cmc-test-key-dummy";
const BEARER_TOKEN = "sk-test-dummy-value";
const WRONG_KEY = "cmc-wrong-key-dummy";
const CALLER_TOKEN = "Bearer caller-should-not-win";

function apiKeyEnvelope(headerName: string, secret: string): string {
  return encryptUpstreamSecret(secret, KEY, { authType: "API_KEY", headerName });
}

function bearerEnvelope(secret: string): string {
  return encryptUpstreamSecret(secret, KEY, { authType: "BEARER", headerName: null });
}

// ---------------------------------------------------------------------------
// Auth fixture: a REAL local HTTP server enforcing the auth contract.
// ---------------------------------------------------------------------------

type AuthExpectation =
  | { type: "none" }
  | { type: "header"; name: string; value: string }
  | { type: "bearer"; token: string };

/** Universal auth header names the "none" expectation rejects. */
const AUTH_HEADER_NAMES = ["authorization", "proxy-authorization", "x-api-key"] as const;

function expectationMet(
  headers: IncomingHttpHeaders,
  expected: AuthExpectation
): boolean {
  if (expected.type === "none") {
    return AUTH_HEADER_NAMES.every((name) => headers[name] === undefined);
  }
  if (expected.type === "bearer") {
    return headers.authorization === `Bearer ${expected.token}`;
  }
  return headers[expected.name.toLowerCase()] === expected.value;
}

type AuthFixture = {
  server: ReturnType<typeof createServer>;
  port: number;
  requests: Array<{ headers: IncomingHttpHeaders }>;
};

function startAuthFixture(expected: AuthExpectation): Promise<AuthFixture> {
  const requests: AuthFixture["requests"] = [];
  const server = createServer((req, res) => {
    requests.push({ headers: req.headers });
    const ok = expectationMet(req.headers, expected);
    res.statusCode = ok ? 200 : 401;
    res.setHeader("content-type", "text/plain");
    res.end(ok ? "AUTH_OK" : "AUTH_MISSING");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, port, requests });
    });
  });
}

function closeAuthFixture(fx: AuthFixture): Promise<void> {
  return new Promise((resolve) => fx.server.close(() => resolve()));
}

/** Runs `fn` against a fresh fixture with the given auth expectation. */
async function runWithFixture<T>(
  expected: AuthExpectation,
  fn: (fx: AuthFixture) => Promise<T>
): Promise<T> {
  const fx = await startAuthFixture(expected);
  try {
    return await fn(fx);
  } finally {
    await closeAuthFixture(fx);
  }
}

// ---------------------------------------------------------------------------
// Injected transport: real node:http exchange to the loopback fixture.
// ---------------------------------------------------------------------------

/**
 * Test-seam transport: connects to `hostname:port` (the route URL is a
 * loopback URL, so this is the fixture server) over plain HTTP. The
 * `pinnedAddress` from the resolver seam is deliberately ignored - this is
 * the documented replacement for SSRF/pinning only; the bytes exchanged are
 * real. Honors the same timeout / size caps as the production transport.
 */
function loopbackTransport(): UpstreamTransport {
  return (params) =>
    new Promise((resolve) => {
      let settled = false;

      const settle = (result: UpstreamTransportResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      // Created before `req` on purpose: the callback only runs after the
      // request is constructed below (closures over later consts are safe).
      const timer = setTimeout(() => {
        req.destroy();
        settle({ ok: false, errorCode: UPSTREAM_ERROR_CODES.TIMEOUT });
      }, params.timeoutMs);

      const req = httpRequest(
        {
          hostname: params.hostname,
          port: params.port,
          method: params.method,
          path: params.path,
          headers: params.headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > params.maxResponseBytes) {
              req.destroy();
              settle({ ok: false, errorCode: UPSTREAM_ERROR_CODES.RESPONSE_TOO_LARGE });
              return;
            }
            chunks.push(chunk);
          });
          res.on("end", () => {
            settle({
              ok: true,
              response: {
                status: res.statusCode ?? 0,
                headers: res.headers,
                body: Buffer.concat(chunks),
              },
            });
          });
          res.on("error", () => {
            settle({ ok: false, errorCode: UPSTREAM_ERROR_CODES.INVALID_RESPONSE });
          });
        }
      );

      req.on("error", () => {
        settle({ ok: false, errorCode: UPSTREAM_ERROR_CODES.UNREACHABLE });
      });

      if (params.body !== null) req.write(params.body);
      req.end();
    });
}

// ---------------------------------------------------------------------------
// Service + input builders
// ---------------------------------------------------------------------------

function makeService() {
  const transport = vi.fn(loopbackTransport());
  const service = createUpstreamService({
    transport,
    // SSRF seam: the runtime pin check runs against a stand-in public
    // address; the injected transport connects to the loopback fixture.
    resolveAddresses: async () => ({ ok: true as const, addresses: ["93.184.216.34"] }),
    timeoutMs: 5000,
  });
  return { service, transport };
}

function routeWith(port: number, encryptedUpstreamAuth: string | null): UpstreamRouteContext {
  return {
    id: "route-e2e-auth",
    developerId: "dev-e2e",
    slug: "e2eslug",
    upstreamUrl: `http://127.0.0.1:${port}/v1`,
    encryptedUpstreamAuth,
  };
}

function executionInput(
  route: UpstreamRouteContext,
  callerHeaders: Array<[string, string]>
): UpstreamExecutionInput {
  return {
    route,
    encryptionKey: KEY,
    method: "GET",
    callerPathSegments: [],
    callerQuery: new URLSearchParams(),
    // Raw caller request headers (unfiltered), same shape as a real request.
    callerHeaders,
    body: null,
    // Fixture-only: plain HTTP on loopback. Production still rejects HTTP
    // upstreams (`UPSTREAM_HTTP_NOT_ALLOWED`, covered by unit tests).
    rejectHttp: false,
  };
}

const BENIGN_CALLER_HEADERS: Array<[string, string]> = [
  ["accept", "application/json"],
  ["content-type", "application/json"],
];

// ---------------------------------------------------------------------------
// A-H matrix
// ---------------------------------------------------------------------------

describe("upstream auth E2E (A-H) through the real service path", () => {
  it("A: correct API key is accepted - success 200 with the marker body", async () => {
    await runWithFixture(
      { type: "header", name: "x-api-key", value: CMC_KEY },
      async (fx) => {
        const { service } = makeService();
        const result = await service.executeUpstream(
          executionInput(routeWith(fx.port, apiKeyEnvelope("x-api-key", CMC_KEY)), BENIGN_CALLER_HEADERS)
        );

        expect(result.kind).toBe("success");
        if (result.kind === "success") {
          expect(result.status).toBe(200);
          expect(result.responseBody.toString()).toBe("AUTH_OK");
        }
        expect(fx.requests[0]!.headers["x-api-key"]).toBe(CMC_KEY);
      }
    );
  });

  it("B: API key absent - truthful NON_2XX failure with status 401, never retried", async () => {
    await runWithFixture({ type: "header", name: "x-api-key", value: CMC_KEY }, async (fx) => {
      const { service, transport } = makeService();
      const result = await service.executeUpstream(
        executionInput(routeWith(fx.port, null), BENIGN_CALLER_HEADERS)
      );

      expect(result).toMatchObject({
        kind: "failed",
        errorCode: UPSTREAM_ERROR_CODES.NON_2XX,
        status: 401,
      });
      expect(fx.requests).toHaveLength(1); // no retry, no redirect follow
      expect(transport).toHaveBeenCalledTimes(1);
      expect(fx.requests[0]!.headers["x-api-key"]).toBeUndefined();
    });
  });

  it("B: API key wrong value - truthful NON_2XX failure with status 401, never retried", async () => {
    await runWithFixture({ type: "header", name: "x-api-key", value: CMC_KEY }, async (fx) => {
      const { service } = makeService();
      // Creator credential exists but holds the WRONG secret: the fixture
      // receives it and truthfully rejects the request.
      const result = await service.executeUpstream(
        executionInput(routeWith(fx.port, apiKeyEnvelope("x-api-key", WRONG_KEY)), BENIGN_CALLER_HEADERS)
      );

      expect(result).toMatchObject({
        kind: "failed",
        errorCode: UPSTREAM_ERROR_CODES.NON_2XX,
        status: 401,
      });
      expect(fx.requests).toHaveLength(1);
      expect(fx.requests[0]!.headers["x-api-key"]).toBe(WRONG_KEY);
    });
  });

  it("C: custom header name is accepted end-to-end", async () => {
    await runWithFixture(
      { type: "header", name: "X-Custom-Key", value: CMC_KEY },
      async (fx) => {
        const { service } = makeService();
        const result = await service.executeUpstream(
          executionInput(
            routeWith(fx.port, apiKeyEnvelope("X-Custom-Key", CMC_KEY)),
            BENIGN_CALLER_HEADERS
          )
        );

        expect(result.kind).toBe("success");
        if (result.kind === "success") {
          expect(result.status).toBe(200);
          expect(result.responseBody.toString()).toBe("AUTH_OK");
        }
        expect(fx.requests[0]!.headers["x-custom-key"]).toBe(CMC_KEY);
      }
    );
  });

  it("D: caller wrong-value override attempt - creator value wins (200)", async () => {
    await runWithFixture(
      { type: "header", name: "X-Custom-Key", value: CMC_KEY },
      async (fx) => {
        const { service } = makeService();
        const result = await service.executeUpstream(
          executionInput(routeWith(fx.port, apiKeyEnvelope("X-Custom-Key", CMC_KEY)), [
            ...BENIGN_CALLER_HEADERS,
            ["x-custom-key", "caller-wrong-value"],
          ])
        );

        expect(result.kind).toBe("success");
        if (result.kind === "success") {
          expect(result.status).toBe(200);
        }
        const sent = fx.requests[0]!.headers["x-custom-key"];
        expect(sent).toBe(CMC_KEY);
        expect(sent).not.toBe("caller-wrong-value");
      }
    );
  });

  it("E: correct Bearer credential is accepted - success 200", async () => {
    await runWithFixture({ type: "bearer", token: BEARER_TOKEN }, async (fx) => {
      const { service } = makeService();
      const result = await service.executeUpstream(
        executionInput(routeWith(fx.port, bearerEnvelope(BEARER_TOKEN)), BENIGN_CALLER_HEADERS)
      );

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.status).toBe(200);
        expect(result.responseBody.toString()).toBe("AUTH_OK");
      }
      expect(fx.requests[0]!.headers.authorization).toBe(`Bearer ${BEARER_TOKEN}`);
    });
  });

  it("F: caller authorization override attempt - creator Bearer wins (200)", async () => {
    await runWithFixture({ type: "bearer", token: BEARER_TOKEN }, async (fx) => {
      const { service } = makeService();
      const result = await service.executeUpstream(
        executionInput(routeWith(fx.port, bearerEnvelope(BEARER_TOKEN)), [
          ...BENIGN_CALLER_HEADERS,
          ["authorization", CALLER_TOKEN],
        ])
      );

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.status).toBe(200);
      }
      const sent = fx.requests[0]!.headers.authorization;
      expect(sent).toBe(`Bearer ${BEARER_TOKEN}`);
      expect(sent).not.toBe(CALLER_TOKEN);
    });
  });

  it("G: NONE - no auth header is forwarded at all", async () => {
    await runWithFixture({ type: "none" }, async (fx) => {
      const { service } = makeService();
      const result = await service.executeUpstream(
        executionInput(routeWith(fx.port, null), [
          ...BENIGN_CALLER_HEADERS,
          ["authorization", CALLER_TOKEN],
          ["x-api-key", "caller-key"],
        ])
      );

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.status).toBe(200);
      }
      const sent = fx.requests[0]!.headers;
      expect(sent.authorization).toBeUndefined();
      expect(sent["x-api-key"]).toBeUndefined();
      expect(sent["proxy-authorization"]).toBeUndefined();
      expect(sent["x-custom-key"]).toBeUndefined();
      // Benign allowlisted caller headers still pass through.
      expect(sent.accept).toBe("application/json");
      expect(sent["content-type"]).toBe("application/json");
    });
  });

  it("H: the encrypted envelope never appears in the public EndpointView", async () => {
    const rows = new Map<string, RouteRow>();
    const repo: RouteRepository = {
      async insertRoute(data) {
        const row: RouteRow = {
          id: "route-h",
          developerId: data.developerId,
          slug: data.slug,
          name: data.name,
          description: data.description,
          upstreamUrl: data.upstreamUrl,
          encryptedUpstreamAuth: data.encryptedUpstreamAuth,
          priceMicroUsdc: data.priceMicroUsdc,
          isActive: data.isActive ?? true,
          createdAt: new Date("2026-08-10T00:00:00.000Z"),
          updatedAt: new Date("2026-08-10T00:00:00.000Z"),
        };
        rows.set(row.id, row);
        return row;
      },
      async listRoutesByDeveloper(developerId) {
        return [...rows.values()].filter((r) => r.developerId === developerId);
      },
      async getRouteById(id) {
        return rows.get(id) ?? null;
      },
      async routeSlugExists() {
        return false;
      },
      async updateRoute() {
        return null;
      },
    };
    const service = createEndpointService({
      routes: repo,
      appUrl: "http://localhost:3000/",
      encryptionKey: KEY,
      rejectHttp: true,
      generateSlug: () => "e2eh",
      validateUrl: (input, options) =>
        validateUpstreamUrl(input, { ...options, resolveDns: false }),
      encryptSecret: encryptUpstreamSecret,
      decryptSecret: decryptUpstreamSecret,
    });

    const created = await service.create("dev-h", {
      name: "cmc-v2",
      upstreamUrl: "https://pro-api.coinmarketcap.com/v1",
      priceUsdc: "0.01",
      auth: { type: "apiKey", headerName: "x-api-key", secret: CMC_KEY },
    });

    // The persisted row really holds the encrypted envelope.
    const stored = rows.get(created.id)!.encryptedUpstreamAuth!;
    expect(stored).toBeTruthy();
    const envelope = JSON.parse(stored) as { ciphertext: string; authTag: string };

    const view = await service.get("dev-h", created.id);
    const serialized = JSON.stringify(view);

    expect(serialized).not.toContain(envelope.ciphertext);
    expect(serialized).not.toContain(envelope.authTag);
    expect(serialized).not.toContain(CMC_KEY);
    expect(serialized).not.toContain("encryptedUpstreamAuth");
    // Public metadata survives - the secret never does.
    expect(view.hasUpstreamAuth).toBe(true);
    expect(view.upstreamAuthType).toBe("API_KEY");
    expect(view.headerName).toBe("x-api-key");
  });
});
