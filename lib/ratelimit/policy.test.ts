import { describe, expect, it } from "vitest";

import { RATE_LIMIT_POLICIES, keyFor, scopeLabel } from "./policy";

describe("RATE_LIMIT_POLICIES", () => {
  it("centralizes exactly the three protected surfaces", () => {
    expect(Object.keys(RATE_LIMIT_POLICIES)).toEqual([
      "authChallenge",
      "gatewayAnonymous",
      "gatewaySigned",
    ]);
    expect(Object.values(RATE_LIMIT_POLICIES).map((p) => p.scope)).toEqual([
      "auth-challenge",
      "gateway-anonymous",
      "gateway-signed",
    ]);
  });

  it("defines a positive limit and bounded window for every policy", () => {
    for (const policy of Object.values(RATE_LIMIT_POLICIES)) {
      expect(policy.limit).toBeGreaterThan(0);
      expect(policy.windowSeconds).toBeGreaterThan(0);
      expect(policy.windowSeconds).toBeLessThanOrEqual(3600);
    }
  });
});

describe("keyFor", () => {
  it("derives the ratelimit Redis key from scope and identifier", () => {
    expect(keyFor("auth-challenge", "203.0.113.7")).toBe("ratelimit:auth-challenge:203.0.113.7");
  });

  it("matches rateLimitKey semantics for every scope", () => {
    expect(keyFor("gateway-anonymous", "untrusted")).toBe("ratelimit:gateway-anonymous:untrusted");
    expect(keyFor("gateway-signed", "0xabc123")).toBe("ratelimit:gateway-signed:0xabc123");
  });
});

describe("scopeLabel", () => {
  it("maps policy names to their stable scope labels", () => {
    expect(scopeLabel("authChallenge")).toBe("auth-challenge");
    expect(scopeLabel("gatewayAnonymous")).toBe("gateway-anonymous");
    expect(scopeLabel("gatewaySigned")).toBe("gateway-signed");
  });
});
