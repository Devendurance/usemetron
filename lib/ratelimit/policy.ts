/**
 * Centralized rate-limit policy table (M11 §5).
 *
 * Pure module (no `server-only`): importable from tests, the limiter core,
 * and route wiring. Defaults are deliberately modest; the exact numbers
 * are documented in the hardening doc task.
 */

import { rateLimitKey } from "../redis/keys";

export type RateLimitPolicy = {
  scope: string;
  limit: number;
  windowSeconds: number;
};

/**
 * The three protected surfaces. Values are sensible abuse-protection
 * defaults; production tuning is tracked in the hardening docs.
 */
export const RATE_LIMIT_POLICIES = {
  /** Auth challenge by client IP. */
  authChallenge: { scope: "auth-challenge", limit: 20, windowSeconds: 60 },
  /** Anonymous gateway (unpaid 402) traffic by client IP. */
  gatewayAnonymous: { scope: "gateway-anonymous", limit: 60, windowSeconds: 60 },
  /** Signed gateway attempts by payment identifier (or IP fallback). */
  gatewaySigned: { scope: "gateway-signed", limit: 30, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitPolicy>;

/** Stable human-readable label for a policy, e.g. "authChallenge" -> "auth-challenge". */
export function scopeLabel(policyName: keyof typeof RATE_LIMIT_POLICIES): string {
  return RATE_LIMIT_POLICIES[policyName].scope;
}

/**
 * Redis key for a scope+identifier counter. Deliberately aliases
 * `rateLimitKey` semantics so key derivation stays centralized here.
 */
export function keyFor(scope: string, identifier: string): string {
  return rateLimitKey(scope, identifier);
}
