/**
 * Upstream header policy for the gateway.
 *
 * Only safe caller headers needed for normal API behavior are forwarded.
 * Payment protocol headers, cookies, auth, hop-by-hop and tracing headers
 * are never forwarded, and creator-configured upstream auth is injected
 * only after filtering so callers can never override it.
 */

import { PAYMENT_HEADERS } from "./constants";

/** Header names never forwarded from the caller (case-insensitive). */
const DENY_HEADERS = new Set([
  ...PAYMENT_HEADERS,
  "x-payment",
  "x-payment-response",
  "x-payment-receipt",
  "host",
  "cookie",
  "set-cookie",
  "authorization",
  "proxy-authorization",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "expect",
  "content-length",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "x-metron-receipt-id",
  "x-metron-session",
  "x-api-key",
  "via",
]);

/** Header names that may be forwarded from the caller (case-insensitive). */
const ALLOW_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "user-agent",
  "cache-control",
  "pragma",
  "referer",
  "origin",
  "if-none-match",
  "if-modified-since",
  "range",
  "x-request-id",
  "x-correlation-id",
]);

export type UpstreamHeaders = Record<string, string>;

/**
 * Filters a caller's raw header map down to the safe allowlist.
 * Multiple values for one name are joined with ", " (safe for the allowed
 * header set).
 */
export function filterCallerHeaders(
  rawHeaders: Iterable<[string, string]> | Record<string, string>
): UpstreamHeaders {
  const entries =
    typeof (rawHeaders as { entries?: unknown }).entries === "function"
      ? Array.from(rawHeaders as Iterable<[string, string]>)
      : Object.entries(rawHeaders as Record<string, string>);

  const result: UpstreamHeaders = {};
  for (const [name, value] of entries) {
    const lower = name.toLowerCase();
    if (DENY_HEADERS.has(lower)) continue;
    if (!ALLOW_HEADERS.has(lower)) continue;
    const existing = result[lower];
    result[lower] = existing === undefined ? value : `${existing}, ${value}`;
  }
  return result;
}

export type CreatorAuthHeaders = { authType: "NONE" } | {
  authType: "BEARER";
  headerName: string;
  secret: string;
} | {
  authType: "API_KEY";
  headerName: string;
  secret: string;
};

/**
 * Builds the creator auth header for a decrypted credential. Applied AFTER
 * caller-header filtering so a caller can never override it.
 */
export function creatorAuthHeaders(auth: CreatorAuthHeaders): UpstreamHeaders {
  if (auth.authType === "NONE") return {};
  if (auth.authType === "BEARER") {
    return { authorization: `Bearer ${auth.secret}` };
  }
  return { [auth.headerName.toLowerCase()]: auth.secret };
}
