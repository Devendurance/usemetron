#!/usr/bin/env node
/**
 * Metron M11.1 — Live Upstream Verification (operator-only).
 *
 * Run:  CMC_API_KEY=<real key> npm run verify:upstream:live
 * (tsx with --conditions=react-server so `server-only` modules resolve to
 *  their empty variant under plain Node, and --env-file=.env to load the
 *  local environment — the real key comes from the operator's shell env,
 *  never from a file.)
 *
 * Drives the REAL production upstream path — the shared upstream service
 * (lib/gateway/instance.ts: runtime SSRF revalidation + address pin,
 * creator-auth decrypt, header injection, pinned TLS transport) — against
 * the real authenticated CoinMarketCap upstream:
 *   https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest
 * Authenticated via an API-key header (defaults to CoinMarketCap's official
 * `X-CMC_PRO_API_KEY`; override with CMC_AUTH_HEADER). The key is encrypted
 * with the real AES-256-GCM envelope (`encryptUpstreamSecret`), so
 * encryption → decryption → injection is exercised end to end. The route's
 * base URL already contains the full upstream path and no caller path
 * segments are appended, so the full path is requested.
 *
 * The key is read from the environment ONLY. It is never printed: only the
 * configured header name and a sha256 fingerprint/length are reported, and
 * the encrypted envelope is never logged.
 *
 * Exit code 0 = the upstream returned 2xx (full chain proven);
 * 1 = any failure (missing key, rejected request, non-2xx, transport
 * error). NOT part of `npm test` — real network + operator key.
 */

import { createHash } from "node:crypto";

const UPSTREAM_URL = "https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest";
/** Header name defaults to CoinMarketCap's official credential header. */
const AUTH_HEADER_NAME = process.env.CMC_AUTH_HEADER?.trim() || "X-CMC_PRO_API_KEY";
const ENV_VAR_NAME = "CMC_API_KEY";

async function main() {
  console.log("Metron M11.1 — live upstream verification (CoinMarketCap)");
  console.log("Real production path: SSRF pin → decrypt → auth injection → pinned transport.");

  const apiKey = process.env[ENV_VAR_NAME];
  if (apiKey === undefined || apiKey === "") {
    throw new Error(
      `Missing ${ENV_VAR_NAME} environment variable — run with CMC_API_KEY=<key> npm run verify:upstream:live. ` +
        "The key is only ever read from the environment and is never printed."
    );
  }

  // A sha256 digest is a safe fingerprint: it identifies the loaded key
  // without revealing any part of it. Never print the key itself.
  const fingerprint = createHash("sha256").update(apiKey, "utf8").digest("hex").slice(0, 8);
  console.log(`- Auth header: ${AUTH_HEADER_NAME} (sha256:${fingerprint}…, ${apiKey.length} chars)`);
  console.log(`- Upstream:   ${UPSTREAM_URL}`);

  const { upstreamService, encryptionKey } = await import("../lib/gateway/instance");
  const { encryptUpstreamSecret } = await import("../lib/crypto/upstream-secrets");

  const key = encryptionKey();
  const encryptedUpstreamAuth = encryptUpstreamSecret(apiKey, key, {
    authType: "API_KEY",
    headerName: AUTH_HEADER_NAME,
  });

  const result = await upstreamService.executeUpstream({
    route: {
      id: "verify-upstream-live",
      developerId: "verify-upstream-live",
      slug: "verify-upstream-live",
      upstreamUrl: UPSTREAM_URL,
      encryptedUpstreamAuth,
    },
    encryptionKey: key,
    method: "GET",
    callerPathSegments: [],
    callerQuery: new URLSearchParams(),
    callerHeaders: {},
    body: null,
  });

  console.log("\n[result]");
  if (result.kind === "success") {
    const bodyText = result.responseBody.toString("utf8");
    let bodyIsJson = false;
    try {
      JSON.parse(bodyText);
      bodyIsJson = true;
    } catch {
      bodyIsJson = false;
    }
    console.log(`✓ HTTP ${result.status} (${result.latencyMs} ms)`);
    console.log(`✓ Body: ${bodyIsJson ? "valid JSON" : "NOT JSON"} (${bodyText.length} bytes)`);
    console.log(
      "\n✓ LIVE upstream verification passed — full production chain proven against the real authenticated upstream."
    );
    process.exit(0);
  }

  if (result.kind === "failed") {
    const status = result.status === null ? "no HTTP response" : `HTTP ${result.status}`;
    console.log(`✗ ${status} — errorCode ${result.errorCode} (${result.latencyMs} ms)`);
  } else {
    console.log(`✗ Request rejected — errorCode ${result.errorCode}`);
  }
  console.log(
    "\n✗ LIVE upstream verification FAILED — see status/errorCode above (reported truthfully, never masked)."
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(
    `\n✗ LIVE upstream verification could not run: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
