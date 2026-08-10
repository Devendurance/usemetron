/**
 * Client identifier resolution for rate limiting (M11 §5).
 *
 * Pure module (no `server-only`). SECURITY RULE: X-Forwarded-For is only
 * trusted when a deployment explicitly opts in via
 * `RATE_LIMIT_TRUST_PROXY_HEADER=true`; otherwise every caller shares the
 * "untrusted" bucket so a spoofed header can never evade a limit.
 */

export const UNTRUSTED_IDENTIFIER = "untrusted";
export const UNKNOWN_IDENTIFIER = "unknown";

/** Max length of a usable forwarded identifier (covers bracketed IPv6). */
export const MAX_FORWARDED_IDENTIFIER_LENGTH = 64;

/** Charset of IPv4/IPv6 literals (with optional brackets); rejects junk. */
const IP_LITERAL_CHARS = /^[0-9a-fA-F:.\[\]]+$/;

export type ClientRequestLike = {
  headers: { get(name: string): string | null };
};

/**
 * Resolves the rate-limit identifier for a request:
 * - `trustProxyHeader === false` (default): "untrusted" bucket — the
 *   header is never consulted.
 * - trusted + valid first X-Forwarded-For entry: that entry (trimmed,
 *   bounded, charset-checked).
 * - trusted + absent/empty/garbage/oversized value: "unknown".
 */
export function resolveClientIdentifier(
  request: ClientRequestLike,
  trustProxyHeader: boolean
): string {
  if (!trustProxyHeader) {
    return UNTRUSTED_IDENTIFIER;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded === null) {
    return UNTRUSTED_IDENTIFIER;
  }

  // The first entry is the client as recorded by the trusted proxy; any
  // later entries were appended by hops we do not vouch for.
  const first = forwarded.split(",")[0]?.trim() ?? "";

  if (first === "") {
    return UNKNOWN_IDENTIFIER;
  }
  if (first.length > MAX_FORWARDED_IDENTIFIER_LENGTH) {
    return UNKNOWN_IDENTIFIER;
  }
  if (!IP_LITERAL_CHARS.test(first)) {
    return UNKNOWN_IDENTIFIER;
  }
  return first;
}
