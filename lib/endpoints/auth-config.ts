/**
 * Upstream authentication policy validation for creator endpoints.
 *
 * Supports NONE, BEARER (Authorization: Bearer <secret>) and API_KEY
 * (<header-name>: <secret>) with a safe custom header name. Dangerous and
 * protocol-reserved header names are rejected case-insensitively.
 */

export type UpstreamAuthInput =
  | { type: "none" }
  | { type: "bearer"; secret: string }
  | { type: "apiKey"; headerName: string; secret: string };

export type UpstreamAuthValidationResult =
  | { ok: true; authType: "NONE" | "BEARER" | "API_KEY"; headerName: string | null }
  | { ok: false; reason: string };

/**
 * Header names that must never be user-configurable (case-insensitive).
 * Protocol, transport, and Metron payment headers are all reserved.
 */
const FORBIDDEN_HEADER_NAMES = new Set([
  "host",
  "cookie",
  "set-cookie",
  "connection",
  "content-length",
  "content-type",
  "transfer-encoding",
  "trailer",
  "upgrade",
  "keep-alive",
  "expect",
  "te",
  "authorization",
  "proxy-authorization",
  "proxy-connection",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  // x-api-key is intentionally NOT forbidden: the gateway strips any
  // caller-supplied x-api-key (headers.ts DENY_HEADERS) and injects the
  // creator's configured value AFTER filtering, so a caller can never
  // override it. PRD §11 names X-API-Key as a common form.
  "x-metron-receipt-id",
  "payment-required",
  "payment-signature",
  "payment-response",
  "x-payment",
  "x-payment-receipt",
]);

const HEADER_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/;

function validateHeaderName(headerName: string): string | null {
  if (!HEADER_NAME_PATTERN.test(headerName)) {
    return "invalid_header_name";
  }
  if (FORBIDDEN_HEADER_NAMES.has(headerName.toLowerCase())) {
    return "forbidden_header_name";
  }
  return null;
}

function validateSecret(secret: string): string | null {
  if (typeof secret !== "string" || secret.length === 0) {
    return "empty_secret";
  }
  if (secret.length > 4096) {
    return "secret_too_long";
  }
  if (/[\r\n]/.test(secret)) {
    return "secret_contains_newline";
  }
  return null;
}

/**
 * Validates a normalized auth config. `headerName` may already be trimmed;
 * secrets are trimmed of surrounding whitespace before validation.
 */
export function validateUpstreamAuth(
  input: UpstreamAuthInput
): UpstreamAuthValidationResult {
  if (typeof input !== "object" || input === null || typeof input.type !== "string") {
    return { ok: false, reason: "invalid_auth_config" };
  }

  switch (input.type) {
    case "none":
      return { ok: true, authType: "NONE", headerName: null };
    case "bearer": {
      const secret = (input as { secret: string }).secret?.trim() ?? "";
      const secretIssue = validateSecret(secret);
      if (secretIssue) return { ok: false, reason: secretIssue };
      return { ok: true, authType: "BEARER", headerName: null };
    }
    case "apiKey": {
      const headerName = (input as { headerName: string }).headerName?.trim() ?? "";
      const secret = (input as { secret: string }).secret?.trim() ?? "";
      const headerIssue = validateHeaderName(headerName);
      if (headerIssue) return { ok: false, reason: headerIssue };
      const secretIssue = validateSecret(secret);
      if (secretIssue) return { ok: false, reason: secretIssue };
      return { ok: true, authType: "API_KEY", headerName };
    }
    default:
      return { ok: false, reason: "invalid_auth_config" };
  }
}
