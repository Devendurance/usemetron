/**
 * M10.1 regression tests for protected-response delivery (buildSettledDelivery).
 *
 * Covers the M10.1 §7 delivery invariants:
 * - the settled response always carries a decodable PAYMENT-RESPONSE plus
 *   X-METRON-RECEIPT-ID so callers can reconcile what they paid;
 * - safe upstream headers are preserved (content-type etc.);
 * - hop-by-hop/stale headers and cookies (content-encoding, content-length,
 *   transfer-encoding, connection, set-cookie) are NEVER forwarded;
 * - upstream status + body bytes are delivered unchanged.
 */

import { describe, expect, it } from "vitest";

import { decodePaymentResponseHeader } from "@x402/core/http";

import { buildSettledDelivery, DELIVERABLE_HEADERS } from "./delivery";

const DELIVERY_INPUT: {
  upstreamStatus: number;
  upstreamBody: Buffer;
  safeResponseHeaders: Record<string, string>;
  transaction: string;
  network: string;
  receiptId: string;
} = {
  upstreamStatus: 200,
  upstreamBody: Buffer.from('{"data":"protected"}'),
  safeResponseHeaders: {
    // Every header in the deliverable allowlist, exact values.
    "content-type": "application/json",
    "content-language": "en-US",
    "cache-control": "no-store",
    etag: '"abc123"',
    "last-modified": "Wed, 21 Oct 2015 07:28:00 GMT",
    "content-disposition": 'attachment; filename="report.json"',
    // Hop-by-hop / stale headers and cookies that must never be delivered.
    "content-encoding": "gzip",
    "content-length": "9999",
    "transfer-encoding": "chunked",
    connection: "keep-alive",
    "set-cookie": "session=evil",
    "x-internal-token": "secret",
  },
  transaction: "0xabc123def456",
  network: "eip155:42220",
  receiptId: "rcpt_abc123",
};

describe("buildSettledDelivery — protected response delivery", () => {
  it("delivers the upstream status and exact body bytes unchanged", () => {
    const delivery = buildSettledDelivery(DELIVERY_INPUT);
    expect(delivery.status).toBe(200);
    expect(delivery.body).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(delivery.body as Uint8Array).equals(DELIVERY_INPUT.upstreamBody)).toBe(true);
  });

  it("always carries a decodable PAYMENT-RESPONSE and the X-METRON-RECEIPT-ID", () => {
    const delivery = buildSettledDelivery(DELIVERY_INPUT);
    const header = delivery.headers["payment-response"];
    expect(header).toBeDefined();
    const decoded = decodePaymentResponseHeader(header!);
    expect(decoded.success).toBe(true);
    expect(decoded.transaction).toBe(DELIVERY_INPUT.transaction);
    expect(decoded.network).toBe(DELIVERY_INPUT.network);
    expect(delivery.headers["x-metron-receipt-id"]).toBe(DELIVERY_INPUT.receiptId);
  });

  it("preserves safe upstream headers (content-type etc.), case-insensitive input", () => {
    // Mixed-case input key must still be matched and lowercased on output.
    const mixedCase = buildSettledDelivery({
      ...DELIVERY_INPUT,
      safeResponseHeaders: { "Content-Type": "application/json" },
    });
    expect(mixedCase.headers["content-type"]).toBe("application/json");

    const delivery = buildSettledDelivery(DELIVERY_INPUT);
    for (const name of DELIVERABLE_HEADERS) {
      expect(delivery.headers[name]).toBe(DELIVERY_INPUT.safeResponseHeaders[name]);
    }
  });

  it("never forwards hop-by-hop or stale headers (content-encoding, content-length, transfer-encoding, connection, set-cookie)", () => {
    const delivery = buildSettledDelivery(DELIVERY_INPUT);
    for (const name of [
      "content-encoding",
      "content-length",
      "transfer-encoding",
      "connection",
      "set-cookie",
      "x-internal-token",
    ]) {
      expect(delivery.headers[name], `${name} must not be delivered`).toBeUndefined();
    }
  });

  it("upstream cookies follow the safe policy: set-cookie is not in DELIVERABLE_HEADERS", () => {
    expect(DELIVERABLE_HEADERS.has("set-cookie")).toBe(false);
    expect(DELIVERABLE_HEADERS.has("cookie")).toBe(false);
  });

  it("delivers exactly the safe allowlist plus the two Metron-controlled headers", () => {
    const delivery = buildSettledDelivery(DELIVERY_INPUT);
    expect(Object.keys(delivery.headers).sort()).toEqual(
      [...DELIVERABLE_HEADERS, "payment-response", "x-metron-receipt-id"].sort()
    );
  });
});
