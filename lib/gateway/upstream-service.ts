/**
 * M5 upstream execution orchestrator (injectable, testable).
 *
 * Runs AFTER the M4 verification pipeline succeeded (VERIFIED receipt
 * exists): build the safe upstream request from the persisted route +
 * caller path/query, runtime-SSRF revalidate and pin the destination,
 * decrypt the creator credential, execute once, and report the result.
 *
 * No settlement, no earnings, no payouts, no automatic retries.
 */

import { decryptUpstreamSecret } from "../crypto/upstream-secrets";
import {
  composeUpstreamUrl,
  type UpstreamUrlComposition,
} from "./upstream-url";
import {
  creatorAuthHeaders,
  filterCallerHeaders,
  type UpstreamHeaders,
} from "./headers";
import {
  MAX_UPSTREAM_RESPONSE_BYTES,
  UPSTREAM_ERROR_CODES,
  UPSTREAM_TIMEOUT_MS,
  type UpstreamErrorCode,
} from "./limits";
import {
  decodeResponseBody,
  normalizeResponseHeadersAfterDecode,
} from "./content-encoding";
import {
  pinnedUpstreamTransport,
  type UpstreamTransport,
  type UpstreamTransportResponse,
} from "./upstream-client";
import { isBlockedIp, resolvePublicAddresses } from "../ssrf/validate";

export type UpstreamRouteContext = {
  id: string;
  developerId: string;
  slug: string;
  upstreamUrl: string;
  encryptedUpstreamAuth: string | null;
};

export type UpstreamExecutionInput = {
  route: UpstreamRouteContext;
  encryptionKey: Buffer;
  method: "GET" | "POST";
  /** Path segments after the Metron slug. */
  callerPathSegments: string[];
  callerQuery: URLSearchParams;
  /** Raw caller headers (unfiltered). */
  callerHeaders: UpstreamHeaders | Iterable<[string, string]>;
  /** Raw caller body bytes; POST only (GET must pass null). */
  body: Buffer | null;
  rejectHttp?: boolean;
};

export type UpstreamExecutionResult =
  | {
      kind: "success";
      status: number;
      latencyMs: number;
      /** Bounded captured body (withheld from the caller until settlement). */
      responseBody: Buffer;
      /** Safe response headers captured from the upstream (allowlisted). */
      safeResponseHeaders: Record<string, string>;
    }
  | {
      kind: "failed";
      errorCode: UpstreamErrorCode;
      status: number | null;
      latencyMs: number;
    }
  | { kind: "request_rejected"; errorCode: string };

/** Response headers safe to forward to the caller after settlement. */
export const SAFE_UPSTREAM_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-language",
  "cache-control",
  "etag",
  "last-modified",
  "content-disposition",
]);

export type UpstreamServiceDeps = {
  resolveAddresses?: (hostname: string) => ReturnType<typeof resolvePublicAddresses>;
  transport?: UpstreamTransport;
  timeoutMs?: number;
  maxResponseBytes?: number;
  now?: () => number;
};

export type UpstreamService = ReturnType<typeof createUpstreamService>;

export function createUpstreamService(deps: UpstreamServiceDeps = {}) {
  const resolveAddresses = deps.resolveAddresses ?? resolvePublicAddresses;
  const transport = deps.transport ?? pinnedUpstreamTransport;
  const timeoutMs = deps.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const maxResponseBytes = deps.maxResponseBytes ?? MAX_UPSTREAM_RESPONSE_BYTES;
  const now = deps.now ?? (() => Date.now());

  async function executeUpstream(
    input: UpstreamExecutionInput
  ): Promise<UpstreamExecutionResult> {
    const started = now();

    // 1. Compose the safe upstream URL (origin from the route only).
    let composition: UpstreamUrlComposition;
    try {
      composition = composeUpstreamUrl({
        upstreamBaseUrl: input.route.upstreamUrl,
        callerPathSegments: input.callerPathSegments,
        callerQuery: input.callerQuery,
      });
    } catch {
      return {
        kind: "request_rejected",
        errorCode: "UPSTREAM_CONFIG_INVALID",
      };
    }
    if (!composition.ok) {
      return {
        kind: "request_rejected",
        errorCode:
          composition.reason === "path_traversal"
            ? "UPSTREAM_PATH_TRAVERSAL"
            : "UPSTREAM_CONFIG_INVALID",
      };
    }

    const url = composition.url;
    if (url.protocol !== "https:" && input.rejectHttp !== false) {
      return { kind: "request_rejected", errorCode: "UPSTREAM_HTTP_NOT_ALLOWED" };
    }
    if (url.username !== "" || url.password !== "") {
      return { kind: "request_rejected", errorCode: "UPSTREAM_CONFIG_INVALID" };
    }

    // 2. Runtime SSRF: revalidate + resolve + pin public addresses only.
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const resolved = await resolveAddresses(hostname);
    if (!resolved.ok) {
      return {
        kind: "failed",
        errorCode:
          resolved.reason === "url_dns_resolution_failed"
            ? UPSTREAM_ERROR_CODES.UNREACHABLE
            : UPSTREAM_ERROR_CODES.UNSAFE_DESTINATION,
        status: null,
        latencyMs: now() - started,
      };
    }
    const pinnedAddress = resolved.addresses[0]!;
    if (isBlockedIp(pinnedAddress)) {
      return {
        kind: "failed",
        errorCode: UPSTREAM_ERROR_CODES.UNSAFE_DESTINATION,
        status: null,
        latencyMs: now() - started,
      };
    }

    // 3. Header policy: filter caller headers, then inject creator auth.
    const filtered = filterCallerHeaders(input.callerHeaders);
    const auth: UpstreamHeaders =
      input.route.encryptedUpstreamAuth === null
        ? {}
        : creatorAuthHeaders(
            (() => {
              const decrypted = decryptUpstreamSecret(
                input.route.encryptedUpstreamAuth,
                input.encryptionKey
              );
              return {
                authType: decrypted.authType,
                headerName: decrypted.headerName ?? "",
                secret: decrypted.secret,
              };
            })()
          );
    const headers: UpstreamHeaders = {
      ...filtered,
      ...auth,
      // M10.1: never negotiate upstream compression — callers cannot supply
      // `accept-encoding` (removed from the allowlist), so pin identity
      // explicitly. The gateway decodes any compressed reply itself.
      "accept-encoding": "identity",
      host: hostname,
    };

    // 4. Execute exactly once (never retry).
    const port = url.port !== "" ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    const result = await transport({
      hostname,
      pinnedAddress,
      port,
      method: input.method,
      path: composition.path + (url.search !== "" ? url.search : ""),
      headers,
      body: input.body,
      timeoutMs,
      maxResponseBytes,
      rejectHttp: input.rejectHttp,
    });

    const latencyMs = now() - started;

    if (!result.ok) {
      return {
        kind: "failed",
        errorCode: result.errorCode as UpstreamErrorCode,
        status: null,
        latencyMs,
      };
    }
    const response: UpstreamTransportResponse = result.response;
    if (response.status < 200 || response.status >= 300) {
      return {
        kind: "failed",
        errorCode: UPSTREAM_ERROR_CODES.NON_2XX,
        status: response.status,
        latencyMs,
      };
    }

    // M10.1: decode compressed 2xx bodies before capture. The transport
    // caps the RAW bytes; `maxResponseBytes` (same value) caps the DECODED
    // payload, so a small compressed body cannot decompress unboundedly.
    // Fail closed — a body we cannot decode truthfully is never delivered.
    // Read `content-encoding` case-insensitively: node:http lowercases
    // header keys, but an injected/transport response may carry a
    // mixed-case key (e.g. "Content-Encoding") — a case-sensitive lookup
    // would miss it and pass compressed bytes through with no header left
    // to decode them with.
    let rawEncoding: string | string[] | undefined;
    for (const [name, value] of Object.entries(response.headers)) {
      if (name.toLowerCase() === "content-encoding") {
        rawEncoding = value;
        break;
      }
    }
    const contentEncoding = Array.isArray(rawEncoding)
      ? rawEncoding.join(", ")
      : rawEncoding;
    let responseBody = response.body;
    let responseHeaders = response.headers;
    if (
      contentEncoding !== undefined &&
      contentEncoding !== null &&
      contentEncoding !== "" &&
      contentEncoding !== "identity"
    ) {
      const decoded = decodeResponseBody(response.body, contentEncoding, maxResponseBytes);
      if (!decoded.ok) {
        return {
          kind: "failed",
          errorCode: UPSTREAM_ERROR_CODES.RESPONSE_DECODE_FAILED,
          status: response.status,
          latencyMs,
        };
      }
      responseBody = decoded.body;
      responseHeaders = normalizeResponseHeadersAfterDecode(
        response.headers,
        decoded.body.byteLength
      );
    }

    const safeResponseHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(responseHeaders)) {
      if (SAFE_UPSTREAM_RESPONSE_HEADERS.has(name.toLowerCase())) {
        if (typeof value === "string") safeResponseHeaders[name.toLowerCase()] = value;
      }
    }
    return {
      kind: "success",
      status: response.status,
      latencyMs,
      responseBody,
      safeResponseHeaders,
    };
  }

  return { executeUpstream };
}
