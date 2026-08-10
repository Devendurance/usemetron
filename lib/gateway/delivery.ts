/**
 * Protected-resource delivery after CONFIRMED settlement (M6).
 *
 * This function is only reachable from the `settled` branch of the
 * settlement pipeline, so PAYMENT-RESPONSE can never appear before a
 * confirmed settlement. Safe response headers are allowlisted here as a
 * second layer (the upstream service already filters at capture time).
 */

import { encodePaymentResponseHeader } from "@x402/core/http";

/** Headers safe to forward to the caller (lowercase keys). */
export const DELIVERABLE_HEADERS = new Set([
  "content-type",
  "content-language",
  "cache-control",
  "etag",
  "last-modified",
  "content-disposition",
]);

export type SettledDelivery = {
  status: number;
  body: BodyInit;
  headers: Record<string, string>;
};

export function buildSettledDelivery(input: {
  upstreamStatus: number;
  upstreamBody: Buffer;
  safeResponseHeaders: Record<string, string>;
  transaction: string;
  network: string;
}): SettledDelivery {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.safeResponseHeaders)) {
    const lower = name.toLowerCase();
    if (DELIVERABLE_HEADERS.has(lower)) {
      headers[lower] = value;
    }
  }
  headers["payment-response"] = encodePaymentResponseHeader({
    success: true,
    transaction: input.transaction,
    network: input.network as `${string}:${string}`,
  });
  return {
    status: input.upstreamStatus,
    body: new Uint8Array(input.upstreamBody) as BodyInit,
    headers,
  };
}
