import { describe, expect, it, vi } from "vitest";

import { checkRateLimit, type RateLimitDeps } from "./limiter";

const INPUT = {
  scope: "auth-challenge",
  identifier: "203.0.113.7",
  limit: 5,
  windowSeconds: 60,
};

function makeDeps(): {
  deps: RateLimitDeps;
  incr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
} {
  const incr = vi.fn(async () => 1);
  const expire = vi.fn(async () => 1);
  const del = vi.fn(async () => 1);
  return { deps: { incr, expire, del }, incr, expire, del };
}

describe("checkRateLimit", () => {
  it("allows requests while the counter is at or under the limit", async () => {
    const { deps, incr, expire } = makeDeps();
    incr.mockResolvedValue(3);

    const verdict = await checkRateLimit(INPUT, deps);

    expect(verdict).toEqual({ allowed: true, retryAfterSeconds: 0, degraded: false });
    expect(incr).toHaveBeenCalledWith("ratelimit:auth-challenge:203.0.113.7");
    expect(expire).not.toHaveBeenCalled();
  });

  it("allows the request exactly at the limit boundary", async () => {
    const { deps, incr } = makeDeps();
    incr.mockResolvedValue(5);

    const verdict = await checkRateLimit(INPUT, deps);

    expect(verdict).toEqual({ allowed: true, retryAfterSeconds: 0, degraded: false });
  });

  it("blocks requests over the limit with retryAfterSeconds = windowSeconds", async () => {
    const { deps, incr } = makeDeps();
    incr.mockResolvedValue(6);

    const verdict = await checkRateLimit(INPUT, deps);

    expect(verdict).toEqual({ allowed: false, retryAfterSeconds: 60, degraded: false });
  });

  it("sets the bounded TTL window exactly when the counter starts (counter === 1)", async () => {
    const { deps, incr, expire, del } = makeDeps();
    incr.mockResolvedValue(1);

    const verdict = await checkRateLimit(INPUT, deps);

    expect(verdict).toEqual({ allowed: true, retryAfterSeconds: 0, degraded: false });
    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith("ratelimit:auth-challenge:203.0.113.7", 60);
    expect(del).not.toHaveBeenCalled();
  });

  it("never re-applies the TTL on subsequent increments", async () => {
    const { deps, incr, expire } = makeDeps();
    incr.mockResolvedValue(2);

    await checkRateLimit(INPUT, deps);

    expect(expire).not.toHaveBeenCalled();
  });

  it("fails open (degraded, allowed) when INCR throws", async () => {
    const { deps, incr } = makeDeps();
    incr.mockRejectedValue(new Error("redis unavailable"));

    const verdict = await checkRateLimit(INPUT, deps);

    expect(verdict).toEqual({ allowed: true, retryAfterSeconds: 0, degraded: true });
  });

  it("fails open (degraded, allowed) when EXPIRE throws", async () => {
    const { deps, incr, expire } = makeDeps();
    incr.mockResolvedValue(1);
    expire.mockRejectedValue(new Error("redis unavailable"));

    const verdict = await checkRateLimit(INPUT, deps);

    expect(verdict).toEqual({ allowed: true, retryAfterSeconds: 0, degraded: true });
  });

  it("retries EXPIRE once when the first EXPIRE fails after counter start", async () => {
    const { deps, incr, expire, del } = makeDeps();
    incr.mockResolvedValue(1);
    expire
      .mockRejectedValueOnce(new Error("transient redis failure"))
      .mockResolvedValueOnce(1);

    const verdict = await checkRateLimit(INPUT, deps);

    expect(verdict).toEqual({ allowed: true, retryAfterSeconds: 0, degraded: false });
    expect(expire).toHaveBeenCalledTimes(2);
    expect(expire).toHaveBeenNthCalledWith(
      2,
      "ratelimit:auth-challenge:203.0.113.7",
      60
    );
    expect(del).not.toHaveBeenCalled();
  });

  it("DELs the key and degrades when EXPIRE keeps failing after counter start", async () => {
    const { deps, incr, expire, del } = makeDeps();
    incr.mockResolvedValue(1);
    expire.mockRejectedValue(new Error("redis unavailable"));

    const verdict = await checkRateLimit(INPUT, deps);

    // The counter was left without a TTL: the window is reset by deleting
    // the key so the bucket can never accumulate into a permanent 429.
    expect(verdict).toEqual({ allowed: true, retryAfterSeconds: 0, degraded: true });
    expect(expire).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("ratelimit:auth-challenge:203.0.113.7");
  });

  it("stays fail-open when the DEL fallback also throws", async () => {
    const { deps, incr, expire, del } = makeDeps();
    incr.mockResolvedValue(1);
    expire.mockRejectedValue(new Error("redis unavailable"));
    del.mockRejectedValue(new Error("also unavailable"));

    await expect(checkRateLimit(INPUT, deps)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: true,
    });
  });

  it("never throws, even when every dependency fails", async () => {
    const { deps, incr, expire } = makeDeps();
    incr.mockRejectedValue(new Error("boom"));
    expire.mockRejectedValue(new Error("also boom"));

    await expect(checkRateLimit(INPUT, deps)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
      degraded: true,
    });
  });
});
