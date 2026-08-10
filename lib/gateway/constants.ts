/**
 * Gateway shared constants.
 */

/** x402 V2 payment protocol headers (never forwarded upstream). */
export const PAYMENT_HEADERS = [
  "payment-required",
  "payment-signature",
  "payment-response",
] as const;
