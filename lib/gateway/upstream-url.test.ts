import { describe, expect, it } from "vitest";

import { composeUpstreamUrl } from "./upstream-url";

describe("composeUpstreamUrl", () => {
  it("appends the nested caller path to the upstream base path", () => {
    const result = composeUpstreamUrl({
      upstreamBaseUrl: "https://example.dev/v1",
      callerPathSegments: ["translate"],
      callerQuery: new URLSearchParams(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.toString()).toBe("https://example.dev/v1/translate");
      expect(result.path).toBe("/v1/translate");
    }
  });

  it("preserves query parameters", () => {
    const result = composeUpstreamUrl({
      upstreamBaseUrl: "https://example.dev/v1",
      callerPathSegments: ["translate", "sub"],
      callerQuery: new URLSearchParams({ q: "en", lang: "fr" }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.searchParams.get("q")).toBe("en");
      expect(result.url.searchParams.get("lang")).toBe("fr");
      expect(result.url.toString()).toContain("/v1/translate/sub");
    }
  });

  it("handles root base with no caller path", () => {
    const result = composeUpstreamUrl({
      upstreamBaseUrl: "https://api.example.com/",
      callerPathSegments: [],
      callerQuery: new URLSearchParams(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.path).toBe("/");
  });

  it("rejects traversal attempts", () => {
    for (const segments of [
      [".."],
      ["..", "secret"],
      ["a", "..", "b"],
      ["."],
      [""],
    ]) {
      const result = composeUpstreamUrl({
        upstreamBaseUrl: "https://example.dev/v1",
        callerPathSegments: segments,
        callerQuery: new URLSearchParams(),
      });
      expect(result.ok, `should reject ${JSON.stringify(segments)}`).toBe(false);
      if (!result.ok) expect(result.reason).toBe("path_traversal");
    }
  });

  it("rejects encoded traversal attempts", () => {
    const result = composeUpstreamUrl({
      upstreamBaseUrl: "https://example.dev/v1",
      callerPathSegments: ["..%2F", "%2e%2e"],
      callerQuery: new URLSearchParams(),
    });
    expect(result.ok).toBe(false);
  });

  it("the caller can never change the upstream origin", () => {
    const result = composeUpstreamUrl({
      upstreamBaseUrl: "https://example.dev/v1",
      callerPathSegments: ["evil.com", "x"],
      callerQuery: new URLSearchParams(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.origin).toBe("https://example.dev");
    }
  });

  it("fragments are never forwarded", () => {
    const result = composeUpstreamUrl({
      upstreamBaseUrl: "https://example.dev/v1",
      callerPathSegments: ["x"],
      callerQuery: new URLSearchParams(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.hash).toBe("");
      expect(result.path).not.toContain("#");
    }
  });

  it("rejects a malformed upstream base URL", () => {
    const result = composeUpstreamUrl({
      upstreamBaseUrl: "not a url",
      callerPathSegments: [],
      callerQuery: new URLSearchParams(),
    });
    expect(result.ok).toBe(false);
  });
});
