/**
 * M10 external buyer client (standalone).
 *
 * Proves the full economic loop from OUTSIDE Metron: this script has no
 * dependency on Metron internals (no lib/, app/, @/, DB, Redis). It only uses
 * the public x402 protocol packages and viem to pay the M10 protected
 * endpoint via the official `wrapFetchWithPayment` flow:
 *
 *   1. Resolve signer from M10_BUYER_PRIVATE_KEY (never printed/logged).
 *   2. Register the Exact EVM scheme on an x402Client for eip155:*.
 *   3. Wrap fetch; the wrapper transparently handles 402 -> PAYMENT-SIGNATURE
 *      creation -> retry. The raw signature is never printed.
 *   4. Perform exactly one GET on M10_METRON_URL.
 *   5. Decode the PAYMENT-RESPONSE via the official x402HTTPClient path and
 *      print the settlement result + x402 transaction hash.
 *
 * The whole flow lives in `main()` and only runs when this file is the entry
 * point (standard ESM CLI guard). Importing this module from tests is safe.
 *
 * Usage:
 *   M10_BUYER_PRIVATE_KEY=0x... M10_METRON_URL=https://... npm run m10:client
 */

import { wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { pathToFileURL } from "node:url";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Decode a binary response body (Buffer/TypedArray/ArrayBuffer) as text,
 * honoring the charset declared in the content-type header. Defaults to
 * utf-8, which matches the plain `String(buffer)` form for text payloads.
 * Never throws: any failure falls back to the caller's String() handling.
 */
function decodeBinaryBody(body, contentType) {
  const charsetMatch = /charset=([^;\s"]+)/i.exec(contentType ?? "");
  let decoder;
  try {
    decoder = new TextDecoder(charsetMatch ? charsetMatch[1] : undefined);
  } catch {
    // Unknown charset label: fall back to utf-8.
    decoder = new TextDecoder();
  }
  return decoder.decode(body);
}

/**
 * Describe a response body for console output. Pure helper: NEVER throws,
 * never touches secrets, and does not hide malformed bodies - it prints the
 * raw content in the most faithful textual form available.
 *
 * - null/undefined -> "(empty body)"
 * - string         -> as-is
 * - plain object   -> pretty-printed JSON
 * - Buffer/TypedArray/ArrayBuffer -> String() textual form (not JSON noise)
 * - anything else  -> String(...)
 *
 * @param body The parsed response body (any type).
 * @param contentType The response content-type header, if any (informational).
 * @returns A string safe to print.
 */
export function describeResponseBody(body, contentType) {
  try {
    if (body === null || body === undefined) {
      return "(empty body)";
    }
    if (typeof body === "string") {
      return body;
    }
    if (typeof body === "object") {
      // Binary payloads: show the decoded text instead of Buffer JSON noise.
      if (ArrayBuffer.isView(body) || body instanceof ArrayBuffer) {
        return decodeBinaryBody(body, contentType);
      }
      const json = JSON.stringify(body, null, 2);
      return json === undefined ? String(body) : json;
    }
    return String(body);
  } catch {
    // Defensive: hostile input (circular refs, throwing toString) must never
    // crash the client or the tests that import this helper.
    try {
      return String(body);
    } catch {
      return "(unprintable body)";
    }
  }
}

async function main() {
  try {
    // --- Environment validation ---------------------------------------------
    // The private key is read into a local variable only. It is never printed,
    // logged, or stringified anywhere in this script.
    const rawKey = process.env.M10_BUYER_PRIVATE_KEY;
    const url = process.env.M10_METRON_URL;

    if (!rawKey) {
      throw new Error(
        "M10_BUYER_PRIVATE_KEY is missing - set it in the environment before running the M10 external client."
      );
    }

    if (!url) {
      throw new Error(
        "M10_METRON_URL is missing - set it in the environment before running the M10 external client."
      );
    }

    // --- Signer & payment client --------------------------------------------

    const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
    const signer = privateKeyToAccount(privateKey);

    console.log("Buyer:", signer.address);
    console.log("Resource:", url);
    console.log("");

    const client = new x402Client();
    client.register("eip155:*", new ExactEvmScheme(signer));

    // Official decode path (same as scripts/m4-buyer-test.mjs).
    const httpClient = new x402HTTPClient(client);

    // Plain global fetch on purpose: any wrapping that captured/logged the
    // PAYMENT-SIGNATURE would violate this client's security requirements.
    const fetchWithPayment = wrapFetchWithPayment(fetch, client);

    // --- Payment loop ---------------------------------------------------------

    console.log("=== M10 EXTERNAL PAYMENT LOOP ===");

    const response = await fetchWithPayment(url, {
      method: "GET",
    });

    console.log("HTTP status:", response.status);

    const contentType = response.headers.get("content-type");
    console.log("content-type:", contentType ?? "unknown");

    const result = await httpClient.processResponse(response);

    console.log("Payment status:", result.paymentStatus);
    console.log(
      "Response body:",
      describeResponseBody(result.body, contentType)
    );

    const header = result.header;
    if (header && "success" in header) {
      console.log("Settlement success:", header.success);
      console.log("x402 transaction hash:", header.transaction);
      if (header.network) console.log("Network:", header.network);
      if (header.payer) console.log("Payer:", header.payer);
      if (!header.success) {
        if (header.errorReason) console.log("Error reason:", header.errorReason);
        if (header.errorMessage) console.log("Error message:", header.errorMessage);
      }
    } else if (header) {
      console.log(
        "No settlement header decoded (payment-required or unsupported response)."
      );
    } else {
      console.log("No PAYMENT-RESPONSE header present.");
    }

    const receiptId = response.headers.get("X-METRON-RECEIPT-ID");
    if (receiptId) {
      console.log("X-METRON-RECEIPT-ID:", receiptId);
    }

    // --- Exit contract ----------------------------------------------------------

    if (response.status < 200 || response.status >= 300) {
      console.error(
        `Metron request failed: final HTTP status ${response.status} is not 2xx.`
      );
      process.exitCode = 1;
      return;
    }

    console.log("Done: Metron request succeeded with a 2xx response.");
  } catch (error) {
    // Never swallow failures: report the full error and exit non-zero.
    // Print message + stack (+ cause) — never the raw error object, which
    // can carry incidental secret-bearing fields (env snapshots, headers).
    console.error("M10 external client failed.");
    if (error instanceof Error) {
      console.error(error.message);
      if (error.stack) console.error(error.stack);
      if (error.cause !== undefined) {
        console.error(
          "Caused by:",
          error.cause instanceof Error ? error.cause.message : String(error.cause)
        );
      }
    } else {
      console.error(String(error));
    }
    process.exitCode = 1;
  }
}

// Standard ESM CLI guard: only run when this file is the entry point.
// Compared via file URLs (`pathToFileURL`) because the naive
// `import.meta.url === process.argv[1]` comparison is never true on Windows,
// where argv[1] is a plain path while import.meta.url is a file:// URL.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main();
}
