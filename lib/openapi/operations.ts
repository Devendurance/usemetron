/**
 * OpenAPI operation discovery — pure, injectable, no network.
 *
 * Turns a parsed OpenAPI 3.0.x/3.1.x document into a list of
 * `DiscoveredOperation` records the import flow can review and publish.
 * Server resolution follows OpenAPI precedence: operation `servers` →
 * path-level `servers` → root `servers`. Publishability is decided by a
 * synchronous host/IP safety check (reusing `lib/ssrf/validate.ts`) plus
 * an optional injected `resolveServerUrl` hook for publication-grade
 * checks (e.g. DNS resolution) that need I/O and are therefore injected.
 */

import { isBlockedHostname, isBlockedIp } from "../ssrf/validate";

export type SecurityHint =
  | { type: "apiKey"; headerName: string | null }
  | { type: "bearer"; headerName: null };

export type DiscoveredOperation = {
  method: string;
  path: string;
  operationId: string | null;
  summary: string | null;
  description: string | null;
  tags: string[];
  hasRequestBody: boolean;
  responseCodes: string[];
  effectiveServerUrl: string | null;
  /** effectiveServerUrl + operation path — the upstream URL when the operation has no path params. */
  resolvedTemplate: string | null;
  /** The operation path template callers append after the slug — set only when the operation has path params. */
  callerPathTemplate: string | null;
  hasPathParams: boolean;
  securityHints: SecurityHint[];
  publishable: boolean;
  blockedReason: string | null;
};

export type DiscoverOperationsOptions = {
  /**
   * Additional publication-grade URL validation (e.g. SSRF check with DNS
   * resolution). When provided and the operation has a resolvable server,
   * a non-ok result marks the operation not publishable with its reason.
   */
  resolveServerUrl?: (
    url: string
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Warning sink for recoverable discovery issues (missing/unresolvable servers). */
  onWarning?: (warning: string) => void;
};

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

/** Any absolute scheme:// URL, so relative paths are distinguished from unsupported schemes. */
const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Resolves a server object's URL, substituting template variables from
 * their `default` values. Returns null (with a warning via `warn`) when the
 * server is not an object, has no URL, or a variable has no default.
 */
function resolveServerUrl(
  server: unknown,
  warn: (warning: string) => void
): string | null {
  if (!isPlainObject(server) || typeof server.url !== "string") return null;
  const raw = server.url.trim();
  if (raw === "") return null;

  const variables = isPlainObject(server.variables) ? server.variables : {};
  let unresolvedName: string | null = null;
  const url = raw.replace(/\{([^}]+)\}/g, (whole, name: string) => {
    const variable = variables[name];
    if (isPlainObject(variable) && typeof variable.default === "string") {
      return variable.default;
    }
    unresolvedName = name;
    return whole;
  });

  if (unresolvedName !== null) {
    warn(
      `Server URL variable "{${unresolvedName}}" has no default; server treated as unset`
    );
    return null;
  }
  return url;
}

/** Synchronous, network-free safety check over an absolute server URL. */
function syncSafetyCheck(
  url: string
): { ok: true } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "url_malformed" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "url_unsupported_scheme" };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, reason: "url_embedded_credentials" };
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(host)) {
    return { ok: false, reason: "url_blocked_hostname" };
  }
  const isIpLiteral = host.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (isIpLiteral && isBlockedIp(host)) {
    return { ok: false, reason: "url_blocked_ip" };
  }
  return { ok: true };
}

function hasPathParams(path: string): boolean {
  return path.split("/").some((segment) => /^\{[^}]+\}$/.test(segment));
}

/**
 * Collects security hints from the schemes referenced by the effective
 * security list (operation-level, falling back to the document root).
 * Only `apiKey` (with an optional header name) and HTTP bearer schemes are
 * auto-suggestable; basic/oauth2/mutualTLS/openIdConnect produce no hint —
 * the creator can still pick an auth mode manually. Secret values never
 * exist on schemes (they carry names/header suggestions only) and nothing
 * beyond type + headerName is ever returned.
 */
function securityHintsFor(doc: Record<string, unknown>, operation: Record<string, unknown>): SecurityHint[] {
  const effectiveSecurity = Array.isArray(operation.security)
    ? operation.security
    : Array.isArray(doc.security)
      ? doc.security
      : [];

  const components = isPlainObject(doc.components) ? doc.components : {};
  const schemes = isPlainObject(components.securitySchemes) ? components.securitySchemes : {};

  const hints: SecurityHint[] = [];
  const seen = new Set<string>();

  for (const entry of effectiveSecurity) {
    if (!isPlainObject(entry)) continue;
    for (const name of Object.keys(entry)) {
      const scheme = schemes[name];
      if (!isPlainObject(scheme)) continue;
      if (scheme.type === "apiKey") {
        const headerName =
          scheme.in === "header" && typeof scheme.name === "string" ? scheme.name : null;
        const key = `apiKey:${headerName ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          hints.push({ type: "apiKey", headerName });
        }
      } else if (scheme.type === "http" && String(scheme.scheme).toLowerCase() === "bearer") {
        if (!seen.has("bearer")) {
          seen.add("bearer");
          hints.push({ type: "bearer", headerName: null });
        }
      }
    }
  }
  return hints;
}

/**
 * Discovers publishable operation metadata from a parsed OpenAPI document.
 *
 * The document must already have passed the version gate (3.0.x/3.1.x) and
 * syntax/validation checks — this function only reads structure. It is
 * async because the optional `resolveServerUrl` hook performs I/O.
 */
export async function discoverOperations(
  doc: unknown,
  opts: DiscoverOperationsOptions = {}
): Promise<DiscoveredOperation[]> {
  const warn = opts.onWarning ?? (() => {});
  if (!isPlainObject(doc)) return [];

  const rootServers =
    Array.isArray(doc.servers) && doc.servers.length > 0 ? doc.servers : null;
  const paths = isPlainObject(doc.paths) ? doc.paths : {};
  const operations: DiscoveredOperation[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (path.startsWith("x-") || !isPlainObject(pathItem)) continue;
    const pathServers =
      Array.isArray(pathItem.servers) && pathItem.servers.length > 0
        ? pathItem.servers
        : null;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!isPlainObject(operation)) continue;

      const opServers =
        Array.isArray(operation.servers) && operation.servers.length > 0
          ? operation.servers
          : null;
      const server = opServers?.[0] ?? pathServers?.[0] ?? rootServers?.[0] ?? null;

      let effectiveServerUrl: string | null = null;
      let blockedReason: string | null = null;
      let publishable = false;

      if (server === null) {
        warn(
          `No server URL defined for ${method.toUpperCase()} ${path}; import requires a base URL`
        );
      } else {
        effectiveServerUrl = resolveServerUrl(server, warn);
        if (effectiveServerUrl === null) {
          warn(
            `No usable server URL for ${method.toUpperCase()} ${path}; import requires a base URL`
          );
        } else if (!ABSOLUTE_URL_RE.test(effectiveServerUrl)) {
          warn(
            `Relative server URL for ${method.toUpperCase()} ${path} treated as unset; import requires an absolute base URL`
          );
          effectiveServerUrl = null;
        } else {
          const safety = syncSafetyCheck(effectiveServerUrl);
          if (!safety.ok) {
            blockedReason = safety.reason;
          } else if (opts.resolveServerUrl) {
            const hookResult = await opts.resolveServerUrl(effectiveServerUrl);
            if (!hookResult.ok) {
              blockedReason = hookResult.reason;
            }
          }
        }
      }

      if (effectiveServerUrl === null && blockedReason === null) {
        blockedReason = "no base URL";
      }
      publishable = effectiveServerUrl !== null && blockedReason === null;

      const responses = isPlainObject(operation.responses) ? operation.responses : {};
      operations.push({
        method,
        path,
        operationId:
          typeof operation.operationId === "string" ? operation.operationId : null,
        summary: typeof operation.summary === "string" ? operation.summary : null,
        description:
          typeof operation.description === "string" ? operation.description : null,
        tags: asStringArray(operation.tags),
        hasRequestBody: isPlainObject(operation.requestBody),
        responseCodes: Object.keys(responses),
        effectiveServerUrl,
        resolvedTemplate:
          effectiveServerUrl !== null && !hasPathParams(path)
            ? `${effectiveServerUrl.replace(/\/+$/, "")}${path}`
            : null,
        callerPathTemplate: hasPathParams(path) ? path : null,
        hasPathParams: hasPathParams(path),
        securityHints: securityHintsFor(doc, operation),
        publishable,
        blockedReason,
      });
    }
  }

  return operations;
}
