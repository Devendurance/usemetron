import { describe, expect, it } from "vitest";

import {
  MAX_FORWARDED_IDENTIFIER_LENGTH,
  UNKNOWN_IDENTIFIER,
  UNTRUSTED_IDENTIFIER,
  resolveClientIdentifier,
} from "./client-ip";

function requestWith(xForwardedFor: string | null) {
  return {
    headers: {
      get: (name: string) => (name === "x-forwarded-for" ? xForwardedFor : null),
    },
  };
}

describe("resolveClientIdentifier", () => {
  it("never trusts X-Forwarded-For unless the proxy flag is explicitly enabled", () => {
    expect(resolveClientIdentifier(requestWith("203.0.113.7"), false)).toBe(UNTRUSTED_IDENTIFIER);
  });

  it("returns the untrusted bucket when the header is absent", () => {
    expect(resolveClientIdentifier(requestWith(null), true)).toBe(UNTRUSTED_IDENTIFIER);
    expect(resolveClientIdentifier(requestWith(null), false)).toBe(UNTRUSTED_IDENTIFIER);
  });

  it("uses the first forwarded entry when the proxy is trusted", () => {
    expect(resolveClientIdentifier(requestWith("203.0.113.7"), true)).toBe("203.0.113.7");
    expect(resolveClientIdentifier(requestWith(" 203.0.113.7 , 10.0.0.1 "), true)).toBe(
      "203.0.113.7"
    );
  });

  it("returns unknown for empty or whitespace-only values", () => {
    expect(resolveClientIdentifier(requestWith(""), true)).toBe(UNKNOWN_IDENTIFIER);
    expect(resolveClientIdentifier(requestWith("   "), true)).toBe(UNKNOWN_IDENTIFIER);
    expect(resolveClientIdentifier(requestWith(",,"), true)).toBe(UNKNOWN_IDENTIFIER);
  });

  it("returns unknown for garbage values", () => {
    expect(resolveClientIdentifier(requestWith("not an ip!!"), true)).toBe(UNKNOWN_IDENTIFIER);
    expect(resolveClientIdentifier(requestWith("user@example.com"), true)).toBe(UNKNOWN_IDENTIFIER);
    expect(resolveClientIdentifier(requestWith("1.2.3.4; rm -rf /"), true)).toBe(UNKNOWN_IDENTIFIER);
  });

  it("bounds the identifier length, returning unknown for oversized values", () => {
    const oversized = "203.0.113.7".padEnd(MAX_FORWARDED_IDENTIFIER_LENGTH + 10, "x");
    expect(resolveClientIdentifier(requestWith(oversized), true)).toBe(UNKNOWN_IDENTIFIER);
  });

  it("accepts IPv6 literals", () => {
    expect(resolveClientIdentifier(requestWith("2001:db8::1"), true)).toBe("2001:db8::1");
    expect(resolveClientIdentifier(requestWith("[2001:db8::1]:8080"), true)).toBe(
      "[2001:db8::1]:8080"
    );
  });
});
