/**
 * Shared upstream/gateway execution boundaries (PRD §20 and M5 spec).
 */

/** Max caller request body forwarded upstream. */
export const MAX_CALLER_BODY_BYTES = 1024 * 1024; // 1 MiB

/** Upstream request timeout. */
export const UPSTREAM_TIMEOUT_MS = 30_000; // 30 seconds

/** Max upstream response body captured. */
export const MAX_UPSTREAM_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MiB

/** Machine-readable upstream failure codes. */
export const UPSTREAM_ERROR_CODES = {
  TIMEOUT: "UPSTREAM_TIMEOUT",
  UNREACHABLE: "UPSTREAM_UNREACHABLE",
  RESPONSE_TOO_LARGE: "UPSTREAM_RESPONSE_TOO_LARGE",
  UNSAFE_DESTINATION: "UPSTREAM_UNSAFE_DESTINATION",
  NON_2XX: "UPSTREAM_NON_2XX",
  INVALID_RESPONSE: "UPSTREAM_INVALID_RESPONSE",
  RESPONSE_DECODE_FAILED: "UPSTREAM_RESPONSE_DECODE_FAILED",
} as const;

export type UpstreamErrorCode = (typeof UPSTREAM_ERROR_CODES)[keyof typeof UPSTREAM_ERROR_CODES];
