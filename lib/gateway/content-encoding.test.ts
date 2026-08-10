import { describe, expect, it } from "vitest";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";

import {
  decodeResponseBody,
  normalizeResponseHeadersAfterDecode,
  SUPPORTED_CONTENT_ENCODINGS,
} from "./content-encoding";

const SAMPLE = Buffer.from(
  JSON.stringify({
    ok: true,
    message: "hello from the upstream service",
    nested: { a: [1, 2, 3], b: "text with unicode: ünïcödé 🚀" },
  })
);

describe("SUPPORTED_CONTENT_ENCODINGS", () => {
  it("declares exactly gzip, x-gzip, deflate, br", () => {
    expect([...SUPPORTED_CONTENT_ENCODINGS]).toEqual(["gzip", "x-gzip", "deflate", "br"]);
  });
});

describe("decodeResponseBody — identity / absent encoding", () => {
  it.each([undefined, null, "", "identity"])(
    "passes the body through unchanged for %j",
    (encoding) => {
      const result = decodeResponseBody(SAMPLE, encoding, 1024 * 1024);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.body.equals(SAMPLE)).toBe(true);
        expect(result.body).toBe(SAMPLE); // exact same Buffer instance
      }
    }
  );
});

describe("decodeResponseBody — compressed round-trips", () => {
  it("decodes gzip with exact byte equality", () => {
    const compressed = gzipSync(SAMPLE);
    expect(compressed.equals(SAMPLE)).toBe(false);

    const result = decodeResponseBody(compressed, "gzip", 1024 * 1024);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.equals(SAMPLE)).toBe(true);
  });

  it("decodes x-gzip with exact byte equality", () => {
    const compressed = gzipSync(SAMPLE);
    const result = decodeResponseBody(compressed, "x-gzip", 1024 * 1024);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.equals(SAMPLE)).toBe(true);
  });

  it("decodes deflate (RFC 9110 zlib-wrapped) via zlib.deflateSync", () => {
    const compressed = deflateSync(SAMPLE);
    const result = decodeResponseBody(compressed, "deflate", 1024 * 1024);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.equals(SAMPLE)).toBe(true);
  });

  it("decodes br via zlib.brotliCompressSync", () => {
    const compressed = brotliCompressSync(SAMPLE);
    const result = decodeResponseBody(compressed, "br", 1024 * 1024);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.equals(SAMPLE)).toBe(true);
  });

  it("decodes an empty gzip body", () => {
    const result = decodeResponseBody(gzipSync(Buffer.alloc(0)), "gzip", 1024);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.byteLength).toBe(0);
  });
});

describe("decodeResponseBody — decoded size cap (compression-bomb safety)", () => {
  it.each([
    ["gzip", (b: Buffer) => gzipSync(b)],
    ["x-gzip", (b: Buffer) => gzipSync(b)],
    ["deflate", (b: Buffer) => deflateSync(b)],
    ["br", (b: Buffer) => brotliCompressSync(b)],
  ] as const)("rejects %s when the decoded size exceeds maxDecodedBytes", (encoding, compress) => {
    const bomb = Buffer.from("A".repeat(64 * 1024)); // ~4 bytes compressed
    const compressed = compress(bomb);
    expect(compressed.byteLength).toBeLessThan(1024);

    const result = decodeResponseBody(compressed, encoding, 1024);
    expect(result).toEqual({ ok: false, reason: "decoded_too_large" });
  });

  it("accepts a decoded size exactly at maxDecodedBytes", () => {
    const payload = Buffer.from("x".repeat(100));
    const result = decodeResponseBody(gzipSync(payload), "gzip", 100);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.byteLength).toBe(100);
  });
});

describe("decodeResponseBody — malformed input", () => {
  it.each([
    ["gzip", Buffer.from("this is not gzip data at all, definitely corrupt")],
    ["x-gzip", Buffer.from("this is not gzip data at all, definitely corrupt")],
    ["deflate", Buffer.from("this is not deflate data at all, definitely corrupt")],
    ["br", Buffer.from("this is not brotli data at all, definitely corrupt")],
  ] as const)("returns malformed (no throw) for %s", (encoding, garbage) => {
    expect(() => decodeResponseBody(garbage, encoding, 1024 * 1024)).not.toThrow();
    expect(decodeResponseBody(garbage, encoding, 1024 * 1024)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("returns malformed for truncated gzip", () => {
    const truncated = gzipSync(SAMPLE).subarray(0, 10);
    expect(decodeResponseBody(truncated, "gzip", 1024 * 1024)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("decodeResponseBody — unsupported encodings", () => {
  it.each([
    "br, gzip",
    "gzip, br",
    "zstd",
    "gzip;q=1",
    "gzip;q=1.0",
    "GZIP",
    "Identity ",
    "deflate, gzip",
  ])("rejects %j as unsupported_encoding", (encoding) => {
    expect(decodeResponseBody(SAMPLE, encoding, 1024 * 1024)).toEqual({
      ok: false,
      reason: "unsupported_encoding",
    });
  });
});

describe("normalizeResponseHeadersAfterDecode", () => {
  it("removes content-encoding and recomputes content-length, keeping other headers", () => {
    const result = normalizeResponseHeadersAfterDecode(
      {
        "content-encoding": "gzip",
        "content-length": "999",
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      42
    );
    expect(result).toEqual({
      "content-type": "application/json",
      "cache-control": "no-store",
      "content-length": "42",
    });
  });

  it("removes content-encoding case-insensitively", () => {
    for (const key of ["Content-Encoding", "CONTENT-ENCODING", "cOnTeNt-EnCoDiNg"]) {
      const result = normalizeResponseHeadersAfterDecode({ [key]: "gzip" }, 7);
      expect(result).toEqual({ "content-length": "7" });
    }
  });

  it("removes array-valued content-encoding headers", () => {
    const result = normalizeResponseHeadersAfterDecode(
      { "content-encoding": ["gzip", "br"], "x-extra": ["a", "b"] },
      5
    );
    expect(result).toEqual({ "x-extra": ["a", "b"], "content-length": "5" });
  });

  it("replaces an existing content-length regardless of casing", () => {
    const result = normalizeResponseHeadersAfterDecode(
      { "Content-Length": "123", "content-type": "application/json" },
      77
    );
    expect(result).toEqual({ "content-type": "application/json", "content-length": "77" });
  });

  it("does not mutate the input headers object", () => {
    const input: Record<string, string | string[] | undefined> = {
      "content-encoding": "gzip",
      "content-length": "123",
      "content-type": "application/json",
    };
    const snapshot = { ...input };
    normalizeResponseHeadersAfterDecode(input, 456);
    expect(input).toEqual(snapshot);
  });

  it("handles an empty headers object", () => {
    expect(normalizeResponseHeadersAfterDecode({}, 0)).toEqual({ "content-length": "0" });
  });
});
