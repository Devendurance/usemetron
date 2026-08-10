/**
 * M10.1: Upstream content-encoding decoding (pure, unit-testable).
 *
 * Metron forwards upstream body bytes to the caller. When an upstream
 * responds with a compressed body (gzip/deflate/br), the bytes must be
 * decoded before the caller can parse them as JSON; otherwise the caller
 * receives gzip bytes but (after `normalizeResponseHeadersAfterDecode`)
 * no `content-encoding` header to decode them with.
 *
 * This module is deliberately PURE: no `server-only`, no transport, no DB
 * imports — only `node:zlib` — so vitest can exercise it fully offline.
 *
 * Encoding notes (RFC 9110):
 * - `gzip`/`x-gzip` → zlib-wrapped gzip (`gunzipSync`).
 * - `deflate` → zlib-wrapped deflate (RFC 1950). Raw deflate streams
 *   (RFC 1951, `Content-Encoding: deflate` produced with a raw DEFLATE
 *   stream) are NOT supported and surface as `malformed`.
 * - `br` → brotli (`brotliDecompressSync`).
 *
 * The decoded output is bounded with zlib's `maxOutputLength` BEFORE the
 * buffer is accepted, so a small compressed payload cannot decompress
 * unbounded (compression-bomb safety).
 */

import {
  brotliDecompressSync,
  gunzipSync,
  inflateSync,
} from "node:zlib";

/** Encodings this gateway can decode for upstream bodies. */
export const SUPPORTED_CONTENT_ENCODINGS = ["gzip", "x-gzip", "deflate", "br"] as const;

export type ContentEncoding = (typeof SUPPORTED_CONTENT_ENCODINGS)[number];

export type DecodeResult =
  | { ok: true; body: Buffer }
  | { ok: false; reason: "unsupported_encoding" | "malformed" | "decoded_too_large" };

type Decoder = (body: Buffer, maxDecodedBytes: number) => Buffer;

/** Map a content-encoding token to its decoder, or null when unsupported. */
function decoderFor(encoding: string): Decoder | null {
  switch (encoding) {
    case "gzip":
    case "x-gzip":
      return (body, maxOutputLength) => gunzipSync(body, { maxOutputLength });
    case "deflate":
      return (body, maxOutputLength) => inflateSync(body, { maxOutputLength });
    case "br":
      return (body, maxOutputLength) => brotliDecompressSync(body, { maxOutputLength });
    default:
      return null;
  }
}

function isTooLargeError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ERR_BUFFER_TOO_LARGE";
}

/**
 * Decode an upstream response body according to its `content-encoding`.
 *
 * Matching is exact and case-sensitive per RFC 9110 token semantics:
 * `undefined`, `null`, `""` and `"identity"` pass through unchanged; any
 * other unsupported value (including comma-separated lists such as
 * `"gzip, br"`, parameters like `"gzip;q=1"`, or uppercase `"GZIP"`)
 * yields `unsupported_encoding`. This gateway never negotiates multiple
 * encodings, so a list is refused rather than partially decoded.
 *
 * `maxDecodedBytes` is the hard cap on the DECODED size. zlib throws
 * `ERR_BUFFER_TOO_LARGE` when the output would exceed it, which is mapped
 * to `decoded_too_large` (checked before the buffer is returned). Any other
 * decode failure (corrupt/truncated data) is mapped to `malformed` and
 * never throws.
 */
export function decodeResponseBody(
  body: Buffer,
  contentEncoding: string | undefined | null,
  maxDecodedBytes: number
): DecodeResult {
  if (
    contentEncoding === undefined ||
    contentEncoding === null ||
    contentEncoding === "" ||
    contentEncoding === "identity"
  ) {
    return { ok: true, body };
  }

  const decode = decoderFor(contentEncoding);
  if (decode === null) {
    return { ok: false, reason: "unsupported_encoding" };
  }

  try {
    const decoded = decode(body, maxDecodedBytes);
    // Defensive post-check: guarantee the invariant even if a future zlib
    // release stops honoring `maxOutputLength` for one of the methods.
    if (decoded.byteLength > maxDecodedBytes) {
      return { ok: false, reason: "decoded_too_large" };
    }
    return { ok: true, body: decoded };
  } catch (error) {
    if (isTooLargeError(error)) {
      return { ok: false, reason: "decoded_too_large" };
    }
    return { ok: false, reason: "malformed" };
  }
}

/**
 * Normalize response headers after a successful decode (pure; does not
 * mutate the input). Removes `content-encoding` (case-insensitive) and
 * replaces `content-length` (case-insensitive) with the decoded length so
 * the caller sees an accurate, encoding-free representation of the body.
 */
export function normalizeResponseHeadersAfterDecode(
  headers: Record<string, string | string[] | undefined>,
  decodedLength: number
): Record<string, string | string[] | undefined> {
  const normalized: Record<string, string | string[] | undefined> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === "content-encoding" || lower === "content-length") continue;
    normalized[name] = value;
  }
  normalized["content-length"] = String(decodedLength);
  return normalized;
}
