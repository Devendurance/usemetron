import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MAX_SPEC_BYTES, parseOpenApiSpec } from "./parse";

const VALID_JSON_3_0 = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Pets API", version: "1.0.0" },
  servers: [{ url: "https://api.example.com/v1" }],
  paths: {
    "/pets": {
      get: {
        operationId: "listPets",
        summary: "List pets",
        responses: { "200": { description: "ok" } },
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
});

const VALID_YAML_3_0 = [
  "openapi: 3.0.3",
  "info:",
  "  title: YAML API",
  "  version: 1.0.0",
  "servers:",
  "  - url: https://yaml.example.com",
  "paths:",
  "  /health:",
  "    get:",
  "      operationId: getHealth",
  "      responses:",
  '        "200":',
  "          description: ok",
  "",
].join("\n");

const VALID_PRACTICAL_3_1 = JSON.stringify({
  openapi: "3.1.0",
  info: {
    title: "Prices API",
    version: "2.1.0",
    license: { name: "MIT" },
  },
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  servers: [{ url: "https://api.practical.dev/v2" }],
  paths: {
    "/prices/{symbol}": {
      get: {
        operationId: "getPrice",
        parameters: [
          { name: "symbol", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: {
                  type: ["object", "null"],
                  properties: { price: { type: ["number", "null"] } },
                  required: ["price"],
                },
              },
            },
          },
          "404": { description: "missing" },
        },
      },
    },
    "/health": {
      get: { responses: { "200": { description: "ok" } } },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: { type: "http", scheme: "bearer" },
    },
  },
});

describe("parseOpenApiSpec — valid documents", () => {
  it("parses a valid JSON 3.0 spec and discovers operations", async () => {
    const result = await parseOpenApiSpec(VALID_JSON_3_0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.operations).toHaveLength(2);
    expect(result.operations[0]).toMatchObject({
      method: "get",
      path: "/pets",
      operationId: "listPets",
      effectiveServerUrl: "https://api.example.com/v1",
      publishable: true,
      blockedReason: null,
    });
    expect(result.operations[1]).toMatchObject({
      path: "/pets/{petId}",
      hasPathParams: true,
      callerPathTemplate: "/pets/{petId}",
    });
  });

  it("parses a valid YAML 3.0 spec", async () => {
    const result = await parseOpenApiSpec(VALID_YAML_3_0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      operationId: "getHealth",
      path: "/health",
      resolvedTemplate: "https://yaml.example.com/health",
    });
  });

  it("parses a practical OpenAPI 3.1 spec (nullable types, dialect)", async () => {
    const result = await parseOpenApiSpec(VALID_PRACTICAL_3_1);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operations).toHaveLength(2);
    const price = result.operations.find((o) => o.path === "/prices/{symbol}")!;
    expect(price.responseCodes).toEqual(["200", "404"]);
    expect(price.securityHints).toEqual([]); // scheme declared but never referenced
  });

  it("parses flow-style YAML that starts with '{' (JSON parse falls back to YAML)", async () => {
    const flow = `{openapi: "3.0.3", info: {title: Flow, version: "1"}, servers: [{url: "https://flow.example.com"}], paths: {"/f": {get: {responses: {"200": {description: ok}}}}}}`;
    const result = await parseOpenApiSpec(flow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operations[0]).toMatchObject({
      path: "/f",
      resolvedTemplate: "https://flow.example.com/f",
    });
  });

  it("accepts internal $refs without fetching anything", async () => {
    const spec = JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Refs", version: "1.0.0" },
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/pets": {
          get: {
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Pet" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Pet: { type: "object", properties: { id: { type: "integer" } } },
        },
      },
    });

    const result = await parseOpenApiSpec(spec);
    expect(result.ok).toBe(true);
  });

  it("handles YAML alias cycles without hanging", async () => {
    const cyclic = [
      "openapi: 3.0.3",
      "info:",
      "  title: cyclic",
      "  version: '1'",
      "x-self: &self",
      "  type: object",
      "servers:",
      "  - url: https://api.example.com",
      "paths:",
      "  /loop:",
      "    get:",
      "      responses:",
      "        '200':",
      "          description: ok",
      "          content:",
      "            application/json:",
      "              schema:",
      "                type: object",
      "                properties:",
      "                  self: *self",
      "",
    ].join("\n");

    const result = await parseOpenApiSpec(cyclic);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.operations).toHaveLength(1);
  });
});

describe("parseOpenApiSpec — rejection paths", () => {
  it("rejects malformed JSON with invalid_syntax", async () => {
    const result = await parseOpenApiSpec('{"openapi": "3.0.3",');
    expect(result).toMatchObject({ ok: false, error: "invalid_syntax" });
  });

  it("rejects malformed YAML with invalid_syntax", async () => {
    const result = await parseOpenApiSpec("openapi: 3.0.3\ninfo: [unclosed");
    expect(result).toMatchObject({ ok: false, error: "invalid_syntax" });
  });

  it("rejects empty and whitespace-only input", async () => {
    expect(await parseOpenApiSpec("")).toMatchObject({ ok: false, error: "invalid_syntax" });
    expect(await parseOpenApiSpec("   \n\t ")).toMatchObject({
      ok: false,
      error: "invalid_syntax",
    });
  });

  it("rejects documents that are not OpenAPI with not_openapi", async () => {
    expect(await parseOpenApiSpec('{"hello": "world"}')).toMatchObject({
      ok: false,
      error: "not_openapi",
    });
    expect(await parseOpenApiSpec("[1, 2, 3]")).toMatchObject({
      ok: false,
      error: "not_openapi",
    });
    expect(await parseOpenApiSpec("foo: bar")).toMatchObject({
      ok: false,
      error: "not_openapi",
    });
  });

  it("rejects swagger 2.0 with a truthful unsupported_version message", async () => {
    const swagger2 = JSON.stringify({
      swagger: "2.0",
      info: { title: "Legacy", version: "1.0.0" },
      host: "api.example.com",
      basePath: "/v1",
      schemes: ["https"],
      paths: { "/pets": { get: { responses: { "200": { description: "ok" } } } } },
    });

    const result = await parseOpenApiSpec(swagger2);
    expect(result).toMatchObject({ ok: false, error: "unsupported_version" });
    if (!result.ok) {
      expect(result.message?.toLowerCase()).toContain("swagger 2.0");
      expect(result.message?.toLowerCase()).toContain("3.0");
    }
  });

  it("rejects other unsupported openapi versions", async () => {
    for (const version of ["2.0", "3.2.0", "4.0.0"]) {
      const spec = JSON.stringify({
        openapi: version,
        info: { title: "x", version: "1" },
        paths: {},
      });
      expect(await parseOpenApiSpec(spec)).toMatchObject({
        ok: false,
        error: "unsupported_version",
      });
    }
  });

  it("enforces the default 1 MiB size bound before parsing", async () => {
    const oversized = "x".repeat(DEFAULT_MAX_SPEC_BYTES + 1);
    const result = await parseOpenApiSpec(oversized);
    expect(result).toMatchObject({ ok: false, error: "too_large" });

    // Exactly at the bound must NOT be too_large (proceeds and fails later).
    const atBound = await parseOpenApiSpec("x".repeat(DEFAULT_MAX_SPEC_BYTES));
    expect(atBound).not.toMatchObject({ ok: false, error: "too_large" });
  });

  it("honors a custom maxBytes option", async () => {
    expect(await parseOpenApiSpec(VALID_JSON_3_0, { maxBytes: 64 })).toMatchObject({
      ok: false,
      error: "too_large",
    });
    expect(await parseOpenApiSpec(VALID_JSON_3_0, { maxBytes: 1024 * 1024 })).toMatchObject({
      ok: true,
    });
  });
});

describe("parseOpenApiSpec — external references", () => {
  function specWithExternalRef(ref: string) {
    return JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Ext", version: "1.0.0" },
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/pets": {
          get: {
            responses: {
              "200": {
                description: "ok",
                content: { "application/json": { schema: { $ref: ref } } },
              },
            },
          },
        },
      },
    });
  }

  it("rejects http external $refs with validation_failed", async () => {
    const result = await parseOpenApiSpec(specWithExternalRef("http://evil.example.com/schema.yaml"));
    expect(result).toMatchObject({ ok: false, error: "validation_failed" });
    if (!result.ok) {
      expect(result.message?.toLowerCase()).toContain("external");
      expect(result.message?.toLowerCase()).toContain("$ref");
      // Never surface raw parser internals.
      expect(result.message).not.toContain("TypeError");
    }
  });

  it("rejects https external $refs", async () => {
    const result = await parseOpenApiSpec(
      specWithExternalRef("https://evil.example.com/schema.yaml")
    );
    expect(result).toMatchObject({ ok: false, error: "validation_failed" });
  });
});

describe("parseOpenApiSpec — injected validator", () => {
  it("calls the injected validator with the parsed document", async () => {
    const seenDocs: unknown[] = [];
    const validate = vi.fn(async (doc: unknown) => {
      seenDocs.push(doc);
      return { ok: true as const };
    });
    const result = await parseOpenApiSpec(VALID_JSON_3_0, { validate });

    expect(seenDocs).toHaveLength(1);
    expect(seenDocs[0]).toMatchObject({
      openapi: "3.0.3",
      info: { title: "Pets API" },
    });
    expect(result.ok).toBe(true);
  });

  it("maps validator failures to validation_failed without leaking internals", async () => {
    const validate = vi.fn(async () => ({
      ok: false as const,
      errors: [
        "REQUIRED must have required property 'url'",
        "ANOTHER must NOT have additional properties",
      ],
    }));

    const result = await parseOpenApiSpec(VALID_JSON_3_0, { validate });
    expect(result).toMatchObject({ ok: false, error: "validation_failed" });
    if (!result.ok) {
      expect(result.message).not.toContain("REQUIRED");
      expect(result.message).not.toContain("must have required property");
    }
  });

  it("maps a throwing validator to validation_failed", async () => {
    const validate = vi.fn(async () => {
      throw new Error("internal parser crash: out of memory");
    });

    const result = await parseOpenApiSpec(VALID_JSON_3_0, { validate });
    expect(result).toMatchObject({ ok: false, error: "validation_failed" });
    if (!result.ok) {
      expect(result.message).not.toContain("out of memory");
    }
  });

  it("surfaces discovery warnings when the document has no servers", async () => {
    const spec = JSON.stringify({
      openapi: "3.0.3",
      info: { title: "NoServers", version: "1.0.0" },
      paths: {
        "/a": { get: { responses: { "200": { description: "ok" } } } },
      },
    });
    const validate = vi.fn(async () => ({ ok: true as const }));

    const result = await parseOpenApiSpec(spec, { validate });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.operations[0]).toMatchObject({
      publishable: false,
      blockedReason: "no base URL",
    });
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("parseOpenApiSpec — injected resolveServerUrl (parse-time DNS truthfulness)", () => {
  it("marks operations not publishable when the server hostname resolves to a private IP", async () => {
    const resolveServerUrl = vi.fn(async () => ({
      ok: false as const,
      reason: "url_resolves_to_blocked_ip",
    }));

    const result = await parseOpenApiSpec(VALID_JSON_3_0, { resolveServerUrl });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(resolveServerUrl).toHaveBeenCalledWith("https://api.example.com/v1");
    expect(result.operations[0]).toMatchObject({
      effectiveServerUrl: "https://api.example.com/v1",
      publishable: false,
      blockedReason: "url_resolves_to_blocked_ip",
    });
  });

  it("keeps operations publishable when the server hostname resolves to a public IP", async () => {
    const resolveServerUrl = vi.fn(async () => ({ ok: true as const }));

    const result = await parseOpenApiSpec(VALID_JSON_3_0, { resolveServerUrl });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(resolveServerUrl).toHaveBeenCalledWith("https://api.example.com/v1");
    expect(result.operations[0]).toMatchObject({
      publishable: true,
      blockedReason: null,
    });
  });
});

describe("parseOpenApiSpec — secrets safety", () => {
  it("never returns secret-looking fields from securitySchemes", async () => {
    const spec = JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Secrets", version: "1.0.0" },
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/things": {
          get: {
            security: [{ Sneaky: [] }],
            responses: { "200": { description: "ok" } },
          },
        },
      },
      components: {
        securitySchemes: {
          Sneaky: {
            type: "apiKey",
            in: "header",
            name: "X-Sneaky",
            value: "sk_live_parse_secret_1",
            secret: "sk_live_parse_secret_2",
          },
        },
      },
    });
    const validate = vi.fn(async () => ({ ok: true as const }));

    const result = await parseOpenApiSpec(spec, { validate });
    expect(result.ok).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("sk_live_parse_secret_1");
    expect(serialized).not.toContain("sk_live_parse_secret_2");
    if (result.ok) {
      expect(result.operations[0]!.securityHints).toEqual([
        { type: "apiKey", headerName: "X-Sneaky" },
      ]);
    }
  });
});
