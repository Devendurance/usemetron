/**
 * OpenAPI spec parsing — pure, injectable, no network, no code execution.
 *
 * Pipeline: bound size → JSON/YAML parse (data-only; the `yaml` library
 * never executes tags) → OpenAPI version gate → external $ref scan →
 * injected validation → operation discovery. Every failure maps to a
 * machine error code; raw parser internals are never surfaced.
 */

import { validate as validateOpenApi } from "@readme/openapi-parser";
import { parse as parseYaml } from "yaml";

import {
  discoverOperations,
  type DiscoveredOperation,
} from "./operations";

export const DEFAULT_MAX_SPEC_BYTES = 1024 * 1024;

export type ParseOk = {
  ok: true;
  operations: DiscoveredOperation[];
  warnings: string[];
};

export type ParseError = {
  ok: false;
  error:
    | "not_openapi"
    | "invalid_syntax"
    | "unsupported_version"
    | "too_large"
    | "validation_failed";
  message?: string;
};

export type ParseResult = ParseOk | ParseError;

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export type Validator = (doc: unknown) => Promise<ValidationResult>;

export type ParseOpenApiSpecOptions = {
  maxBytes?: number;
  validate?: Validator;
  /**
   * Publication-grade URL check (e.g. SSRF with DNS resolution) applied
   * to every operation's effective server URL at parse time. A non-ok
   * result marks the operation not publishable with its reason, so the
   * review step never shows "Ready" for a server that will fail at
   * publish (e.g. a hostname resolving to a private IP).
   */
  resolveServerUrl?: (url: string) => Promise<{ ok: boolean; reason?: string }>;
};

/**
 * Default validator backed by `@readme/openapi-parser`. External ref
 * resolution is disabled (`resolve.external: false`) so the validator can
 * never fetch remote schemas; unresolvable refs fail fast and are mapped to
 * `validation_failed`. Callers that need publication-grade SSRF checks
 * (e.g. DNS resolution of server hostnames) inject their own validator or
 * pass `resolveServerUrl`, which is threaded into `discoverOperations`.
 */
const DEFAULT_VALIDATOR: Validator = async (doc) => {
  try {
    const result = await validateOpenApi(doc as Parameters<typeof validateOpenApi>[0], {
      resolve: { external: false },
    });
    if (result.valid) return { ok: true };
    const errors = Array.isArray(result.errors)
      ? result.errors
          .map((error) =>
            typeof error === "object" && error !== null && typeof error.message === "string"
              ? error.message
              : "validation error"
          )
          .filter((message): message is string => typeof message === "string")
      : [];
    return { ok: false, errors };
  } catch {
    // Never surface raw parser internals (TypeErrors, stack traces, ...).
    return { ok: false, errors: ["validation failed"] };
  }
};

/**
 * Parses the spec text as JSON or YAML. JSON-first for input starting with
 * `{`/`[`; if strict JSON parsing fails we fall back to YAML so flow-style
 * YAML documents (`{openapi: "3.0.3", ...}`) still parse. The `yaml`
 * library is data-only by default: custom tags are never executed.
 * Returns undefined for empty/whitespace-only input.
 */
function parseDocument(specText: string): unknown {
  const trimmed = specText.trim();
  if (trimmed === "") return undefined;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(specText);
    } catch {
      // Not strict JSON — try YAML (covers flow-style YAML).
    }
  }
  return parseYaml(specText);
}

/**
 * Walks the document (cycle-safe) looking for any `$ref` that points
 * outside the document via http(s). External refs are rejected outright —
 * the import flow accepts a single self-contained file only.
 */
function hasExternalRef(value: unknown, seen: WeakSet<object>): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => hasExternalRef(item, seen));
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string" && /^https?:\/\//i.test(child)) {
      return true;
    }
    if (hasExternalRef(child, seen)) return true;
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses and validates an OpenAPI spec and discovers its operations.
 *
 * The size bound is enforced BEFORE any parsing (default 1 MiB). The
 * validator is injectable so tests never touch the real parser; the
 * default validator is `@readme/openapi-parser` with external ref
 * resolution disabled.
 */
export async function parseOpenApiSpec(
  specText: string,
  opts: ParseOpenApiSpecOptions = {}
): Promise<ParseResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_SPEC_BYTES;

  if (typeof specText !== "string") {
    return { ok: false, error: "invalid_syntax", message: "Spec must be a string" };
  }
  if (Buffer.byteLength(specText, "utf8") > maxBytes) {
    return {
      ok: false,
      error: "too_large",
      message: `Spec exceeds the ${maxBytes}-byte limit`,
    };
  }

  let doc: unknown;
  try {
    doc = parseDocument(specText);
  } catch {
    return {
      ok: false,
      error: "invalid_syntax",
      message: "Spec is not valid JSON or YAML",
    };
  }
  if (doc === undefined) {
    return { ok: false, error: "invalid_syntax", message: "Spec is empty" };
  }
  if (!isPlainObject(doc)) {
    return {
      ok: false,
      error: "not_openapi",
      message: "Spec must be a single object",
    };
  }

  // Version gate: OpenAPI 3.0.x / 3.1.x only.
  if (doc.swagger !== undefined) {
    return {
      ok: false,
      error: "unsupported_version",
      message: `Swagger ${String(doc.swagger)} is not supported; only OpenAPI 3.0.x and 3.1.x are accepted`,
    };
  }
  const version = typeof doc.openapi === "string" ? doc.openapi : null;
  if (version === null) {
    return {
      ok: false,
      error: "not_openapi",
      message: "Missing 'openapi' version field",
    };
  }
  if (!/^3\.[01](\.\d+)?$/.test(version)) {
    return {
      ok: false,
      error: "unsupported_version",
      message: `OpenAPI ${version} is not supported; only 3.0.x and 3.1.x are accepted`,
    };
  }

  // External $refs are rejected before validation so nothing is ever fetched.
  if (hasExternalRef(doc, new WeakSet())) {
    return {
      ok: false,
      error: "validation_failed",
      message: "External $refs (http/https) are not supported",
    };
  }

  const validator = opts.validate ?? DEFAULT_VALIDATOR;
  let validation: ValidationResult;
  try {
    validation = await validator(doc);
  } catch {
    validation = { ok: false, errors: ["validation failed"] };
  }
  if (!validation.ok) {
    const count = validation.errors.length;
    return {
      ok: false,
      error: "validation_failed",
      message:
        `OpenAPI validation failed` +
        (count > 0 ? ` (${count} issue${count === 1 ? "" : "s"})` : ""),
    };
  }

  const warnings: string[] = [];
  let operations: DiscoveredOperation[];
  try {
    operations = await discoverOperations(doc, {
      onWarning: (warning) => warnings.push(warning),
      ...(opts.resolveServerUrl !== undefined
        ? {
            // Narrow the parse-level hook (reason optional) to the
            // discovery contract (reason required on failure). A non-ok
            // verdict without a reason fails closed as a DNS failure.
            resolveServerUrl: async (url: string) => {
              const result = await opts.resolveServerUrl!(url);
              return result.ok
                ? { ok: true as const }
                : {
                    ok: false as const,
                    reason: result.reason ?? "url_dns_resolution_failed",
                  };
            },
          }
        : {}),
    });
  } catch {
    // Discovery must never reject: any unexpected failure maps to the
    // validation error code rather than escaping the ParseResult contract.
    return { ok: false, error: "validation_failed" };
  }
  return { ok: true, operations, warnings };
}
