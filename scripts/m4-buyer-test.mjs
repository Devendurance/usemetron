import {
  wrapFetchWithPayment,
  x402HTTPClient,
} from "@x402/fetch";

import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const rawKey = process.env.M4_BUYER_PRIVATE_KEY;
const url = process.env.M4_URL;

if (!rawKey) {
  throw new Error("M4_BUYER_PRIVATE_KEY is missing");
}

if (!url) {
  throw new Error("M4_URL is missing");
}

const privateKey = rawKey.startsWith("0x")
  ? rawKey
  : `0x${rawKey}`;

const signer = privateKeyToAccount(privateKey);

console.log("Buyer:", signer.address);
console.log("Resource:", url);
console.log("");

const client = new x402Client();

client.register(
  "eip155:*",
  new ExactEvmScheme(signer)
);

const httpClient = new x402HTTPClient(client);

let capturedPaymentSignature = null;

const capturingFetch = async (input, init) => {
  const request =
    input instanceof Request
      ? new Request(input, init)
      : new Request(input, init);

  const signature =
    request.headers.get("PAYMENT-SIGNATURE");

  if (signature) {
    capturedPaymentSignature = signature;
    console.log("✓ PAYMENT-SIGNATURE created");
  }

  return fetch(request);
};

const fetchWithPayment = wrapFetchWithPayment(
  capturingFetch,
  client
);

console.log("=== REAL M6 SETTLEMENT TEST ===");

const response = await fetchWithPayment(url, {
  method: "GET",
});

console.log("HTTP status:", response.status);

const result = await httpClient.processResponse(response);

console.log(
  "Response body:",
  typeof result.body === "string"
    ? result.body
    : JSON.stringify(result.body, null, 2)
);

console.log(
  "Payment status:",
  result.paymentStatus
);

if (result.header) {
  console.log(
    "Payment response:",
    JSON.stringify(result.header, null, 2)
  );
}

if (!capturedPaymentSignature) {
  throw new Error(
    "No PAYMENT-SIGNATURE was generated"
  );
}

console.log("");
console.log("=== REPLAY TEST ===");

const replay = await fetch(url, {
  method: "GET",
  headers: {
    "PAYMENT-SIGNATURE":
      capturedPaymentSignature,
  },
});

console.log(
  "Replay HTTP status:",
  replay.status
);

console.log(
  "Replay response:",
  await replay.text()
);

console.log("");
console.log(
  "PAYMENT-SIGNATURE was intentionally not printed."
);