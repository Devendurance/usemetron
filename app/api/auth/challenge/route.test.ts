import { afterEach, describe, expect, it, vi } from "vitest";

// The route modules are server-only; neutralize the guard so the import
// graph loads under vitest. The heavy deps are replaced with controllable
// fakes: the Redis-backed limiter, the auth service, and the logger.
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  rateLimiterCheck: vi.fn(),
  authChallenge: vi.fn(),
  toAuthErrorResponse: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("@/lib/ratelimit/redis-limiter", () => ({
  rateLimiter: { check: mocks.rateLimiterCheck },
}));
vi.mock("@/lib/auth/service", () => ({
  authService: { challenge: mocks.authChallenge },
}));
vi.mock("@/lib/auth/auth-service", () => ({
  toAuthErrorResponse: mocks.toAuthErrorResponse,
}));
vi.mock("@/lib/observability/logger", () => ({
  logEvent: mocks.logEvent,
}));

import { POST } from "./route";

const VALID_BODY = {
  address: "0x1234567890abcdef1234567890abcdef12345678",
  chainId: 42220,
};

function challengeRequest(): Request {
  return new Request("http://metron.test/api/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(VALID_BODY),
  });
}

describe("POST /api/auth/challenge (route-level)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with nonce and message when under the limit", async () => {
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: false,
    });
    mocks.authChallenge.mockResolvedValue({ nonce: "nonce-1", message: "Sign this message" });

    const response = await POST(challengeRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.nonce).toBe("nonce-1");
    expect(body.message).toBe("Sign this message");
    // The client-ip wiring runs for real: with the proxy-trust flag off
    // (default), every caller shares the "untrusted" bucket.
    expect(mocks.rateLimiterCheck).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "auth-challenge", identifier: "untrusted" })
    );
  });

  it("returns 429 RATE_LIMITED with a retry-after header when over the limit", async () => {
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 60,
      degraded: false,
    });

    const response = await POST(challengeRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    const body = await response.json();
    expect(body.error).toBe("RATE_LIMITED");
    expect(body.retryAfterSeconds).toBe(60);
    expect(mocks.authChallenge).not.toHaveBeenCalled();
  });

  it("fails open: a degraded limiter never 429s the caller", async () => {
    mocks.rateLimiterCheck.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: true,
    });
    mocks.authChallenge.mockResolvedValue({ nonce: "nonce-2", message: "Sign this message" });

    const response = await POST(challengeRequest());

    expect(response.status).toBe(200);
    expect(mocks.logEvent).toHaveBeenCalledWith("rate_limit_degraded", {
      scope: "auth-challenge",
    });
  });
});
