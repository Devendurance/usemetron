/**
 * Client-safe fetchers for the OpenAPI import API (`/api/openapi/parse`
 * and `/api/openapi/publish`).
 *
 * This module is browser-safe (no server-only imports) and mirrors the
 * wire contract of both routes. It owns the client-side copy of the
 * `DiscoveredOperation` shape plus shared helpers: machine-error mapping,
 * blocked-reason copy, and the https-public base URL validator used by the
 * review step.
 *
 * All fetchers return parsed JSON and throw an `OpenApiClientError`
 * carrying the server `error` code so UI can map codes to friendly copy.
 */

/** Client-side mirror of `lib/openapi/operations.ts` (server module). */
export type SecurityHint =
  | { type: "apiKey"; headerName: string | null }
  | { type: "bearer"; headerName: null };

/** Client-side mirror of `lib/openapi/operations.ts` (server module). */
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
  /** effectiveServerUrl + operation path — set when the operation has no path params. */
  resolvedTemplate: string | null;
  /** The operation path template callers append after the slug — set only when the operation has path params. */
  callerPathTemplate: string | null;
  hasPathParams: boolean;
  securityHints: SecurityHint[];
  publishable: boolean;
  blockedReason: string | null;
};

export type OpenApiErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_BODY"
  | "INVALID_SPEC"
  | "SPEC_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class OpenApiClientError extends Error {
  readonly code: OpenApiErrorCode;
  readonly status: number;
  /** Machine reason for INVALID_SPEC responses (sanitized by the server). */
  readonly reason: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(options: {
    code: OpenApiErrorCode;
    status: number;
    reason?: string | null;
    retryAfterSeconds?: number | null;
    message?: string;
  }) {
    super(options.message ?? `OpenAPI import request failed with ${options.code}`);
    this.name = "OpenApiClientError";
    this.code = options.code;
    this.status = options.status;
    this.reason = options.reason ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

const PARSE_ERROR_MESSAGES: Record<OpenApiErrorCode, string> = {
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  INVALID_BODY: "The request was not accepted. Paste the spec again and retry.",
  INVALID_SPEC: "This document could not be parsed as an OpenAPI spec.",
  SPEC_TOO_LARGE:
    "This spec is larger than the 1 MiB limit. Trim it and try again.",
  RATE_LIMITED: "Too many parse requests. Wait a moment and try again.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
};

const PARSE_REASON_MESSAGES: Record<string, string> = {
  invalid_syntax: "This file is not valid JSON or YAML. Check the syntax and try again.",
  not_openapi:
    "This doesn't look like an OpenAPI document — key fields are missing.",
  unsupported_version:
    "Only OpenAPI 3.0.x and 3.1.x documents are supported.",
  validation_failed:
    "The document failed OpenAPI validation. Check its structure and try again.",
  too_large: "This spec is larger than the 1 MiB limit. Trim it and try again.",
};

export function parseErrorMessage(
  code: OpenApiErrorCode,
  reason: string | null
): string {
  if (code === "INVALID_SPEC" && reason !== null) {
    return PARSE_REASON_MESSAGES[reason] ?? PARSE_ERROR_MESSAGES.INVALID_SPEC;
  }
  return PARSE_ERROR_MESSAGES[code] ?? PARSE_ERROR_MESSAGES.INTERNAL_ERROR;
}

const BLOCKED_REASON_LABELS: Record<string, string> = {
  "no base URL": "Missing base URL — set one below",
  url_blocked_hostname: "Blocked: localhost or private hostname",
  url_blocked_ip: "Blocked: private or loopback IP address",
  url_resolves_to_blocked_ip: "Blocked: server resolves to a private address",
  url_dns_resolution_failed: "Server hostname could not be resolved",
  url_malformed: "Server URL is not a valid URL",
  url_unsupported_scheme: "Server URL must use http or https",
  url_embedded_credentials: "Server URL must not contain credentials",
};

export function blockedReasonLabel(reason: string | null): string {
  if (reason === null) return "Not publishable";
  return BLOCKED_REASON_LABELS[reason] ?? "Blocked by the platform's safety checks";
}

/**
 * Validates a base URL override strictly: absolute, https, and a public
 * destination (no localhost/.local hostnames, no private/loopback/link-local
 * IPv4 literals). Best-effort client guard only — the server performs the
 * authoritative SSRF check at publish time. Returns the parsed URL or null.
 */
export function parsePublicHttpsUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (host === "") return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return null;
  }

  // IPv4 literal: reject private/loopback/link-local/reserved ranges.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return null;
    const value =
      ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
    const blockedRanges: ReadonlyArray<readonly [number, number]> = [
      [0x00000000, 0x00ffffff], // 0.0.0.0/8
      [0x0a000000, 0x0affffff], // 10.0.0.0/8
      [0x7f000000, 0x7fffffff], // 127.0.0.0/8 loopback
      [0x64400000, 0x647fffff], // 100.64.0.0/10 CGNAT
      [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 link-local
      [0xac100000, 0xac1fffff], // 172.16.0.0/12
      [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
      [0xc6120000, 0xc613ffff], // 198.18.0.0/15
      [0xe0000000, 0xefffffff], // 224.0.0.0/4 multicast
      [0xf0000000, 0xffffffff], // 240.0.0.0/4 reserved
    ];
    if (blockedRanges.some(([start, end]) => value >= start && value <= end)) {
      return null;
    }
  }

  return url;
}

export type PublishAuthInput =
  | { type: "none" }
  | { type: "bearer"; secret: string }
  | { type: "apiKey"; headerName: string; secret: string };

export type PublishOperationInput = {
  key: string;
  name: string;
  description?: string;
  upstreamUrl: string;
  priceUsdc: string;
  auth?: PublishAuthInput;
};

export type PublishOperationResult =
  | { key: string; ok: true; id: string; slug: string; poweredUrl: string }
  | { key: string; ok: false; error: string };

const PARSE_ERROR_CODES: readonly OpenApiErrorCode[] = [
  "UNAUTHENTICATED",
  "INVALID_BODY",
  "INVALID_SPEC",
  "SPEC_TOO_LARGE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
];

function isOpenApiErrorCode(value: string): value is OpenApiErrorCode {
  return (PARSE_ERROR_CODES as readonly string[]).includes(value);
}

async function request<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new OpenApiClientError({
      code: "INTERNAL_ERROR",
      status: 0,
      message: "Could not reach the Metron service.",
    });
  }

  let responseBody: unknown = null;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const errorBody =
      responseBody && typeof responseBody === "object" && "error" in responseBody
        ? (responseBody as {
            error?: unknown;
            reason?: unknown;
            retryAfterSeconds?: unknown;
          })
        : null;
    const code: OpenApiErrorCode =
      typeof errorBody?.error === "string" && isOpenApiErrorCode(errorBody.error)
        ? errorBody.error
        : "INTERNAL_ERROR";
    throw new OpenApiClientError({
      code,
      status: response.status,
      reason: typeof errorBody?.reason === "string" ? errorBody.reason : null,
      retryAfterSeconds:
        typeof errorBody?.retryAfterSeconds === "number"
          ? errorBody.retryAfterSeconds
          : null,
    });
  }

  return responseBody as T;
}

export function parseOpenApiSpec(
  spec: string,
  // Kept for call-site compatibility only: the parse API no longer
  // accepts a file name (the server schema dropped it), so it is never
  // sent on the wire.
  fileName?: string
): Promise<{ operations: DiscoveredOperation[] }> {
  void fileName;
  return request<{ operations: DiscoveredOperation[] }>("/api/openapi/parse", {
    spec,
  });
}

export function publishOpenApiOperations(
  operations: PublishOperationInput[]
): Promise<{ results: PublishOperationResult[] }> {
  return request<{ results: PublishOperationResult[] }>("/api/openapi/publish", {
    operations,
  });
}
