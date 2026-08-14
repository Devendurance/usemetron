import { describe, expect, it } from "vitest";

import { discoverOperations, type DiscoveredOperation } from "./operations";

/**
 * Fixture builder for a spec with root server, one plain path, one
 * parameterized path, and two operations with rich metadata.
 */
function makeSpec(overrides: Record<string, unknown> = {}) {
  return {
    openapi: "3.0.3",
    info: { title: "Test API", version: "1.0.0" },
    servers: [{ url: "https://api.example.com/v1" }],
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          summary: "List pets",
          description: "Returns all pets",
          tags: ["pets", "read"],
          responses: { "200": { description: "ok" } },
        },
        post: {
          operationId: "createPet",
          requestBody: {
            content: { "application/json": { schema: { type: "object" } } },
          },
          responses: { "201": { description: "created" }, "400": { description: "bad" } },
        },
      },
      "/pets/{petId}": {
        get: {
          operationId: "getPet",
          parameters: [
            { name: "petId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "ok" } },
        },
      },
    },
    ...overrides,
  };
}

function opByPath(ops: DiscoveredOperation[], path: string, method: string) {
  const op = ops.find((o) => o.path === path && o.method === method);
  if (!op) throw new Error(`missing discovered operation ${method} ${path}`);
  return op;
}

/** The base spec with the root `servers` key removed (no server anywhere). */
function specWithoutServers() {
  const spec = makeSpec();
  delete (spec as { servers?: unknown }).servers;
  return spec;
}

describe("discoverOperations — method/path extraction", () => {
  it("extracts methods, ids, summaries, descriptions, tags and response codes", async () => {
    const ops = await discoverOperations(makeSpec());

    expect(ops).toHaveLength(3);

    const listPets = opByPath(ops, "/pets", "get");
    expect(listPets).toMatchObject({
      method: "get",
      path: "/pets",
      operationId: "listPets",
      summary: "List pets",
      description: "Returns all pets",
      tags: ["pets", "read"],
      hasRequestBody: false,
      responseCodes: ["200"],
    });

    const createPet = opByPath(ops, "/pets", "post");
    expect(createPet).toMatchObject({
      operationId: "createPet",
      tags: [],
      hasRequestBody: true,
      responseCodes: ["201", "400"],
    });
  });

  it("skips non-operation path keys (parameters, summary, x- extensions)", async () => {
    const ops = await discoverOperations(
      makeSpec({
        paths: {
          "/pets": {
            parameters: [],
            summary: "not an operation",
            "x-internal": true,
            get: { responses: { "200": { description: "ok" } } },
          },
        },
      })
    );

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ path: "/pets", method: "get" });
  });

  it("returns an empty list for non-object documents", async () => {
    expect(await discoverOperations(null)).toEqual([]);
    expect(await discoverOperations([1, 2, 3])).toEqual([]);
    expect(await discoverOperations("nope")).toEqual([]);
  });
});

describe("discoverOperations — server resolution and templates", () => {
  it("uses the root server and joins it with the operation path (no path params)", async () => {
    const listPets = opByPath(await discoverOperations(makeSpec()), "/pets", "get");

    expect(listPets.effectiveServerUrl).toBe("https://api.example.com/v1");
    expect(listPets.hasPathParams).toBe(false);
    expect(listPets.resolvedTemplate).toBe("https://api.example.com/v1/pets");
    expect(listPets.callerPathTemplate).toBeNull();
  });

  it("marks path-param operations: callerPathTemplate set, resolvedTemplate null", async () => {
    const getPet = opByPath(await discoverOperations(makeSpec()), "/pets/{petId}", "get");

    expect(getPet.hasPathParams).toBe(true);
    expect(getPet.callerPathTemplate).toBe("/pets/{petId}");
    expect(getPet.resolvedTemplate).toBeNull();
    expect(getPet.effectiveServerUrl).toBe("https://api.example.com/v1");
  });

  it("normalizes trailing slashes on the server base", async () => {
    const ops = await discoverOperations(
      makeSpec({ servers: [{ url: "https://api.example.com/v1/" }] })
    );
    expect(opByPath(ops, "/pets", "get").resolvedTemplate).toBe(
      "https://api.example.com/v1/pets"
    );
  });

  it("applies server precedence: operation servers override path servers override root", async () => {
    const ops = await discoverOperations(
      makeSpec({
        servers: [{ url: "https://root.example.com" }],
        paths: {
          "/a": {
            get: { responses: { "200": { description: "ok" } } }, // root
          },
          "/b": {
            servers: [{ url: "https://path.example.com" }],
            get: { responses: { "200": { description: "ok" } } }, // path
          },
          "/c": {
            get: {
              servers: [{ url: "https://op.example.com" }],
              responses: { "200": { description: "ok" } }, // operation
            },
          },
        },
      })
    );

    expect(opByPath(ops, "/a", "get").effectiveServerUrl).toBe("https://root.example.com");
    expect(opByPath(ops, "/b", "get").effectiveServerUrl).toBe("https://path.example.com");
    expect(opByPath(ops, "/c", "get").effectiveServerUrl).toBe("https://op.example.com");
  });

  it("treats empty servers arrays as unset (falls through precedence)", async () => {
    const ops = await discoverOperations(
      makeSpec({
        paths: {
          "/a": {
            servers: [],
            get: {
              servers: [],
              responses: { "200": { description: "ok" } },
            },
          },
        },
      })
    );

    expect(opByPath(ops, "/a", "get").effectiveServerUrl).toBe("https://api.example.com/v1");
  });

  it("substitutes server URL variables from their defaults", async () => {
    const ops = await discoverOperations(
      makeSpec({
        servers: [
          {
            url: "https://{env}.example.com/{base}",
            variables: { env: { default: "api" }, base: { default: "v2" } },
          },
        ],
      })
    );

    const listPets = opByPath(ops, "/pets", "get");
    expect(listPets.effectiveServerUrl).toBe("https://api.example.com/v2");
    expect(listPets.resolvedTemplate).toBe("https://api.example.com/v2/pets");
  });

  it("treats servers with unresolvable variables as no server (warning emitted)", async () => {
    const warnings: string[] = [];
    const ops = await discoverOperations(
      makeSpec({
        servers: [{ url: "https://{env}.example.com", variables: { env: {} } }],
      }),
      { onWarning: (w) => warnings.push(w) }
    );

    expect(opByPath(ops, "/pets", "get").effectiveServerUrl).toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]!.toLowerCase()).toContain("server");
  });

  it("treats relative server URLs as unresolvable (warning emitted)", async () => {
    const warnings: string[] = [];
    const ops = await discoverOperations(makeSpec({ servers: [{ url: "/v1" }] }), {
      onWarning: (w) => warnings.push(w),
    });

    expect(opByPath(ops, "/pets", "get").effectiveServerUrl).toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("reports missing servers as publishable:false with 'no base URL' and a warning", async () => {
    const warnings: string[] = [];
    const ops = await discoverOperations(specWithoutServers(), {
      onWarning: (w) => warnings.push(w),
    });

    const op = opByPath(ops, "/pets", "get");
    expect(op.effectiveServerUrl).toBeNull();
    expect(op.resolvedTemplate).toBeNull();
    expect(op.publishable).toBe(false);
    expect(op.blockedReason).toBe("no base URL");
    expect(warnings.some((w) => w.includes("/pets"))).toBe(true);
  });
});

describe("discoverOperations — publishability and SSRF-safe servers", () => {
  async function serversFor(path: string, url: string) {
    const ops = await discoverOperations(
      makeSpec({
        paths: {
          [path]: {
            servers: [{ url }],
            get: { responses: { "200": { description: "ok" } } },
          },
        },
      })
    );
    return ops[0]!;
  }

  it("publishes public https servers", async () => {
    const op = await serversFor("/ok", "https://api.example.com");
    expect(op.publishable).toBe(true);
    expect(op.blockedReason).toBeNull();
  });

  it.each([
    ["http://localhost:3000", "url_blocked_hostname"],
    ["http://localhost", "url_blocked_hostname"],
    ["https://169.254.169.254/latest", "url_blocked_ip"],
    ["http://10.0.0.1/api", "url_blocked_ip"],
    ["https://127.0.0.1/", "url_blocked_ip"],
  ])("blocks %s (%s)", async (url, reason) => {
    const op = await serversFor("/blocked", url);
    expect(op.publishable).toBe(false);
    expect(op.blockedReason).toBe(reason);
    expect(op.effectiveServerUrl).toBe(url);
  });

  it("blocks servers with embedded credentials", async () => {
    const op = await serversFor("/creds", "https://user:pass@example.com");
    expect(op.publishable).toBe(false);
    expect(op.blockedReason).toBe("url_embedded_credentials");
  });

  it("blocks non-http(s) schemes", async () => {
    const op = await serversFor("/ftp", "ftp://example.com/files");
    expect(op.publishable).toBe(false);
    expect(op.blockedReason).toBe("url_unsupported_scheme");
  });

  it("applies an injected resolveServerUrl hook over the default check", async () => {
    const blocked = (
      await discoverOperations(makeSpec(), {
        resolveServerUrl: async () => ({ ok: false, reason: "url_resolves_to_blocked_ip" }),
      })
    )[0]!;
    expect(blocked.publishable).toBe(false);
    expect(blocked.blockedReason).toBe("url_resolves_to_blocked_ip");

    const allowed = (
      await discoverOperations(makeSpec(), {
        resolveServerUrl: async () => ({ ok: true }),
      })
    )[0]!;
    expect(allowed.publishable).toBe(true);
    expect(allowed.blockedReason).toBeNull();
  });
});

describe("discoverOperations — security hints", () => {
  function specWithSecurity() {
    return {
      openapi: "3.0.3",
      info: { title: "Sec", version: "1.0.0" },
      servers: [{ url: "https://api.example.com" }],
      security: [{ ApiKeyAuth: [] }],
      paths: {
        "/things": {
          get: {
            security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
            responses: { "200": { description: "ok" } },
          },
          post: {
            responses: { "200": { description: "ok" } }, // root fallback
          },
          delete: {
            security: [{ BasicAuth: [] }], // unsupported for auto-suggest
            responses: { "204": { description: "gone" } },
          },
          patch: {
            security: [{ QueryKey: [] }], // apiKey not in a header
            responses: { "200": { description: "ok" } },
          },
          put: {
            security: [{ OAuth: [] }], // oauth2 — no hint
            responses: { "200": { description: "ok" } },
          },
          options: {
            security: [{ Sneaky: [] }],
            responses: { "204": { description: "ok" } },
          },
        },
      },
      components: {
        securitySchemes: {
          ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
          // HTTP auth scheme values are case-insensitive (RFC 7235).
          BearerAuth: { type: "http", scheme: "Bearer" },
          BasicAuth: { type: "http", scheme: "basic" },
          QueryKey: { type: "apiKey", in: "query", name: "key" },
          OAuth: {
            type: "oauth2",
            flows: { implicit: { authorizationUrl: "https://example.com/auth", scopes: {} } },
          },
          Sneaky: {
            type: "apiKey",
            in: "header",
            name: "X-Sneaky",
            // Malicious extra fields that look like secrets — must never surface.
            value: "sk_live_sneaky_value_1",
            secret: "sk_live_sneaky_secret_2",
          },
        },
      },
    };
  }

  it("suggests apiKey header and bearer hints from referenced schemes", async () => {
    const ops = await discoverOperations(specWithSecurity());
    const get = opByPath(ops, "/things", "get");

    expect(get.securityHints).toEqual([
      { type: "apiKey", headerName: "X-API-Key" },
      { type: "bearer", headerName: null },
    ]);
  });

  it("falls back to root-level security when the operation defines none", async () => {
    const ops = await discoverOperations(specWithSecurity());
    expect(opByPath(ops, "/things", "post").securityHints).toEqual([
      { type: "apiKey", headerName: "X-API-Key" },
    ]);
  });

  it("records no hints for basic/oauth2 (creator chooses manually)", async () => {
    const ops = await discoverOperations(specWithSecurity());
    expect(opByPath(ops, "/things", "delete").securityHints).toEqual([]);
    expect(opByPath(ops, "/things", "put").securityHints).toEqual([]);
  });

  it("records apiKey hints without a header name when the key lives in query/cookie", async () => {
    const ops = await discoverOperations(specWithSecurity());
    expect(opByPath(ops, "/things", "patch").securityHints).toEqual([
      { type: "apiKey", headerName: null },
    ]);
  });

  it("never surfaces secret-looking fields from securitySchemes", async () => {
    const ops = await discoverOperations(specWithSecurity());
    const serialized = JSON.stringify(ops);

    expect(opByPath(ops, "/things", "options").securityHints).toEqual([
      { type: "apiKey", headerName: "X-Sneaky" },
    ]);
    expect(serialized).not.toContain("sk_live_sneaky_value_1");
    expect(serialized).not.toContain("sk_live_sneaky_secret_2");
  });
});
