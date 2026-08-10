import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EndpointClientError,
  endpointErrorMessage,
  fetchEndpoint,
  fetchEndpoints,
  formatEndpointDate,
  parsePriceMicroUsdc,
  parseUpstreamUrl,
} from "./client";

describe("parsePriceMicroUsdc", () => {
  it("converts a decimal USDC string to micro-USDC", () => {
    expect(parsePriceMicroUsdc("0.005")).toBe(5000);
    expect(parsePriceMicroUsdc("1")).toBe(1_000_000);
    expect(parsePriceMicroUsdc("0.000001")).toBe(1);
    expect(parsePriceMicroUsdc("0")).toBe(0);
    expect(parsePriceMicroUsdc("2.50")).toBe(2_500_000);
  });

  it("rejects non-positive, non-numeric and oversized fractional prices", () => {
    expect(parsePriceMicroUsdc("-0.005")).toBeNull();
    expect(parsePriceMicroUsdc("abc")).toBeNull();
    expect(parsePriceMicroUsdc("")).toBeNull();
    expect(parsePriceMicroUsdc("0.0050000")).toBeNull(); // 7 decimals
    expect(parsePriceMicroUsdc("0.0000009")).toBeNull(); // sub-micro
  });
});

describe("parseUpstreamUrl", () => {
  it("accepts HTTP and HTTPS absolute URLs", () => {
    expect(parseUpstreamUrl("https://api.example.com/route")?.protocol).toBe("https:");
    expect(parseUpstreamUrl("http://api.example.com/route")).not.toBeNull();
    expect(parseUpstreamUrl("  https://api.example.com/route  ")).not.toBeNull();
  });

  it("rejects non-http(s), relative and malformed URLs", () => {
    expect(parseUpstreamUrl("ftp://example.com/x")).toBeNull();
    expect(parseUpstreamUrl("//example.com/x")).toBeNull();
    expect(parseUpstreamUrl("example.com/x")).toBeNull();
    expect(parseUpstreamUrl("https://")).toBeNull();
    expect(parseUpstreamUrl("")).toBeNull();
    expect(parseUpstreamUrl("not a url")).toBeNull();
  });
});

describe("endpointErrorMessage", () => {
  it("maps known server error codes to friendly copy", () => {
    expect(endpointErrorMessage("INVALID_PRICE")).toBe(
      "Enter a price of at least 0.001 USDC with up to 6 decimal places"
    );
    expect(endpointErrorMessage("UNSAFE_UPSTREAM_URL")).toBe(
      "That URL is not allowed (private/local/unsafe destinations are blocked)"
    );
    expect(endpointErrorMessage("INVALID_UPSTREAM_URL")).toBe(
      "Enter a valid HTTP or HTTPS upstream URL."
    );
    expect(endpointErrorMessage("UNAUTHENTICATED")).toBe(
      "Your session has expired. Sign in again to continue."
    );
  });

  it("falls back for unknown codes", () => {
    expect(endpointErrorMessage("INTERNAL_ERROR" as never)).toMatch(/try again|went wrong/i);
  });
});

describe("formatEndpointDate", () => {
  it("formats a valid ISO date as a readable date", () => {
    const result = formatEndpointDate("2025-01-15T10:00:00.000Z");
    expect(result).toContain("2025");
    expect(result).not.toBe("—");
  });

  it("returns a placeholder for invalid dates", () => {
    expect(formatEndpointDate("not-a-date")).toBe("—");
  });
});

describe("EndpointClientError", () => {
  it("carries the server error code and HTTP status", () => {
    const error = new EndpointClientError("INVALID_PRICE", 400);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("INVALID_PRICE");
    expect(error.status).toBe(400);
    expect(error.message).toContain("INVALID_PRICE");
  });
});

describe("fetchEndpoints", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the endpoint list on success", async () => {
    const payload = {
      endpoints: [{ id: "e1", slug: "abc", name: "Translate", priceUsdc: "0.005" }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const result = await fetchEndpoints();
    expect(result.endpoints[0]).toMatchObject({ id: "e1", name: "Translate" });
  });

  it("throws EndpointClientError with the server code on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "UNAUTHENTICATED" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    )));

    await expect(fetchEndpoints()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });
});

describe("fetchEndpoint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the single endpoint on success", async () => {
    const payload = { endpoint: { id: "e1", slug: "abc", name: "Translate", priceUsdc: "0.005" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const result = await fetchEndpoint("e1");
    expect(result.endpoint.id).toBe("e1");
  });

  it("throws EndpointClientError on 404 not found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "ENDPOINT_NOT_FOUND" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    )));

    await expect(fetchEndpoint("missing")).rejects.toMatchObject({
      code: "ENDPOINT_NOT_FOUND",
      status: 404,
    });
  });
});
