#!/usr/bin/env node
/**
 * Metron M0 — Mainnet Foundation Verification.
 *
 * Run:  npm run verify:foundation
 * (tsx with --conditions=react-server so `server-only` modules resolve to
 *  their empty variant under plain Node, and --env-file=.env to load the
 *  local environment.)
 *
 * Verifies, without moving any funds:
 *   - environment contract (names only; values are never printed)
 *   - Celo Mainnet constants (chain id, CAIP-2, USDC, settlement wallet)
 *   - amount representation (integer base units, no floats)
 *   - attribution utility encode/decode
 *   - Postgres connectivity (when DATABASE_URL is configured)
 *   - Redis connectivity (when Upstash credentials are configured)
 *   - x402 facilitator /health and /supported against the real API
 *   - payout signer address match (when a private key is configured)
 *
 * No /verify, no /settle, no transactions, no durable rows are ever created.
 * Exit code 0 = all configured checks passed; 1 = a check failed.
 */

import postgres from "postgres";

import { METRON_ATTRIBUTION_TAG } from "../lib/celo/config";
import { AMOUNT_EXAMPLES, fromMicroUsdc, toMicroUsdc } from "../lib/celo/amounts";

const CHECK_ORDER = 20;

type CheckStatus = "ok" | "warn" | "fail";

const lines: Array<{ status: CheckStatus; text: string }> = [];
const failures: string[] = [];

function report(status: CheckStatus, text: string): void {
  lines.push({ status, text });
  if (status === "fail") failures.push(text);
}

function icon(status: CheckStatus): string {
  return status === "ok" ? "✓" : status === "warn" ? "!" : "✗";
}

/** Template placeholder values (from .env.example) are not real credentials. */
function isPlaceholderValue(value: string): boolean {
  return /REPLACE_WITH|example\.|db\.example|placeholder/i.test(value);
}

async function checkEnvironment(): Promise<void> {
  const { validateEnv, SECRET_ENV_VARS, REQUIRED_ENV_VARS, ENV_NAMES } = await import(
    "../lib/env"
  );
  const result = validateEnv(process.env);

  console.log(`\n[environment] (variable names only, values never shown)`);
  const missing = result.missing;
  if (missing.length === 0) {
    report("ok", `All ${REQUIRED_ENV_VARS.length} required variables configured`);
  } else {
    report(
      "warn",
      `${REQUIRED_ENV_VARS.length - missing.length} of ${
        REQUIRED_ENV_VARS.length
      } required variables configured; missing: ${missing.join(", ")}`
    );
    const missingSecrets = missing.filter((name) => SECRET_ENV_VARS.includes(name));
    if (missingSecrets.length > 0) {
      report("warn", `Missing secrets (names only): ${missingSecrets.join(", ")}`);
    }
  }
  report(
    "ok",
    `METRON_SETTLEMENT_PRIVATE_KEY: ${
      process.env[ENV_NAMES.METRON_SETTLEMENT_PRIVATE_KEY] ? "configured (never shown)" : "not configured"
    }`
  );
}

async function checkCeloConfig(): Promise<void> {
  const { validateCeloConfig, CELO_CHAIN_ID, CELO_NETWORK, USDC_ADDRESS, USDC_DECIMALS } =
    await import("../lib/celo/config");

  console.log(`\n[celo mainnet]`);
  const result = validateCeloConfig(process.env);
  for (const check of result.checks) {
    if (check.status === "ok") {
      report("ok", `${check.name}: ${check.message}`);
    } else {
      report("fail", `${check.name}: ${check.status} — ${check.message}`);
    }
  }
  report("ok", `Chain ID: ${CELO_CHAIN_ID}`);
  report("ok", `CAIP-2 network: ${CELO_NETWORK}`);
  report("ok", `USDC decimals: ${USDC_DECIMALS} (address: ${USDC_ADDRESS})`);
}

async function checkAmountRepresentation(): Promise<void> {
  console.log(`\n[amount representation]`);
  let ok = true;
  for (const [display, expected] of Object.entries(AMOUNT_EXAMPLES)) {
    const actual = toMicroUsdc(display);
    if (actual !== expected) {
      ok = false;
      report("fail", `toMicroUsdc("${display}") = ${actual}, expected ${expected}`);
    }
  }
  const roundTrip = fromMicroUsdc(toMicroUsdc("0.005")) === "0.005";
  if (!roundTrip) {
    ok = false;
    report("fail", "fromMicroUsdc(toMicroUsdc(\"0.005\")) did not round-trip");
  }
  if (ok) {
    report("ok", "Integer base-unit conversions match PRD examples (0.001→1000, 0.005→5000, 0.01→10000)");
  }
}

async function checkAttribution(): Promise<void> {
  const { buildAttributionDataSuffix, decodeAttributionData, containsMetronTag } =
    await import("../lib/attribution");

  console.log(`\n[attribution]`);
  const suffix = buildAttributionDataSuffix();
  const decoded = decodeAttributionData(suffix);
  if (decoded === null) {
    report("fail", `Tag "${METRON_ATTRIBUTION_TAG}" could not be decoded from its own suffix`);
    return;
  }
  if (containsMetronTag(decoded.codes)) {
    report("ok", `Tag "${METRON_ATTRIBUTION_TAG}" configured and encode/decode verified`);
  } else {
    report("fail", `Decoded codes ${decoded.codes.join(", ")} do not contain the Metron tag`);
  }

  const multi = decodeAttributionData(buildAttributionDataSuffix(["existing_code_123"]));
  if (multi !== null && containsMetronTag(multi.codes) && multi.codes.includes("existing_code_123")) {
    report("ok", "Multi-code form preserves an extra code alongside the Metron tag");
  } else {
    report("fail", "Multi-code attribution form did not preserve both codes");
  }
}

async function checkPostgres(): Promise<void> {
  const { validateEnv } = await import("../lib/env");
  const url = validateEnv(process.env).values.DATABASE_URL;

  console.log(`\n[postgres]`);
  if (url === undefined) {
    report("warn", "DATABASE_URL not configured — connectivity unverified");
    return;
  }
  if (isPlaceholderValue(url)) {
    report("warn", "DATABASE_URL contains placeholder values — connectivity unverified");
    return;
  }

  const client = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    onnotice: () => {},
  });
  try {
    const rows = await client.unsafe<Array<Record<string, unknown>>>("select 1 as ok");
    if (rows[0]?.ok === 1) {
      report("ok", "Postgres reachable (select 1 succeeded)");
    } else {
      report("fail", "Postgres returned an unexpected result for select 1");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report("fail", `Postgres unreachable: ${message}`);
  } finally {
    try {
      await client.end({ timeout: 5 });
    } catch {
      // Best-effort close.
    }
  }
}

async function checkRedis(): Promise<void> {
  const { probeRedis } = await import("../lib/redis/probe");
  const { validateEnv } = await import("../lib/env");

  console.log(`\n[redis]`);
  const env = validateEnv(process.env);
  const url = env.values.UPSTASH_REDIS_REST_URL;
  const token = env.values.UPSTASH_REDIS_REST_TOKEN;
  if (url === undefined || token === undefined) {
    report("warn", "Upstash credentials not configured — connectivity unverified");
    return;
  }
  if (isPlaceholderValue(url) || isPlaceholderValue(token)) {
    report("warn", "Upstash credentials contain placeholder values — connectivity unverified");
    return;
  }

  const result = await probeRedis({ timeoutMs: 10_000 });
  if (result.ok) {
    report("ok", "Redis reachable — write/read/delete probe verified and cleaned up");
  } else {
    report("fail", `Redis probe failed: ${result.error}`);
  }
}

async function checkX402(): Promise<void> {
  console.log(`\n[x402 facilitator]`);
  let client: typeof import("../lib/x402/client");
  try {
    client = await import("../lib/x402/client");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report("fail", `Facilitator module could not load: ${message}`);
    return;
  }
  const { fetchHealth, fetchSupported } = client;
  const { expectSupportedCapability } = await import("../lib/x402/capability");
  const health = await fetchHealth();
  if (health.ok && health.status === 200) {
    report("ok", "/health reachable (HTTP 200)");
  } else {
    report("fail", `/health failed (HTTP ${health.status})`);
    return;
  }

  const supported = await fetchSupported();
  const capability = expectSupportedCapability(supported);
  if (capability.ok && capability.kind !== null) {
    report(
      "ok",
      `Expected capability found: x402 v${capability.kind.x402Version}, scheme "${capability.kind.scheme}", network "${capability.kind.network}"`
    );
  } else {
    report("fail", `Expected capability NOT advertised: ${capability.detail}`);
    return;
  }

  const signers = supported.signers["eip155:42220"];
  if (signers !== undefined && signers.length > 0) {
    report("ok", `Facilitator signer for eip155:42220 advertised: ${signers.join(", ")}`);
  }
}

async function checkPayoutSigner(): Promise<void> {
  const { METRON_SETTLEMENT_WALLET } = await import("../lib/celo/config");

  console.log(`\n[settlement wallet]`);
  let verifyPayoutSigner: () => ReturnType<
    typeof import("../lib/wallet/settlement-wallet").verifyPayoutSigner
  >;
  try {
    verifyPayoutSigner = (await import("../lib/wallet/settlement-wallet")).verifyPayoutSigner;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report("fail", `Settlement wallet module could not load: ${message}`);
    return;
  }

  const signer = (() => {
    try {
      return verifyPayoutSigner();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report("fail", `Payout signer verification failed: ${message}`);
      return null;
    }
  })();
  if (signer === null) return;
  switch (signer.status) {
    case "configured-match":
      report("ok", "PAYOUT SIGNER CONFIGURED — ADDRESS MATCHES REGISTERED WALLET");
      break;
    case "configured-mismatch":
      report(
        "fail",
        `CRITICAL: PAYOUT SIGNER ADDRESS DOES NOT MATCH REGISTERED WALLET (signer ${signer.signerAddress}, registered ${METRON_SETTLEMENT_WALLET})`
      );
      break;
    case "not-configured":
    default:
      report("warn", "PAYOUT SIGNER NOT YET CONFIGURED");
      break;
  }
}

async function main(): Promise<void> {
  console.log("Metron M0 — mainnet foundation verification");
  console.log("Sensitive values are never printed. No funds are moved.");

  await checkEnvironment();
  await checkCeloConfig();
  await checkAmountRepresentation();
  await checkAttribution();
  await checkPostgres();
  await checkRedis();
  await checkX402();
  await checkPayoutSigner();

  console.log(`\n[result]`);
  for (const line of lines) {
    console.log(`${" ".repeat(CHECK_ORDER - icon(line.status).length)}${icon(line.status)} ${line.text}`);
  }

  if (failures.length > 0) {
    console.log(`\n✗ ${failures.length} check(s) failed — see above.`);
    process.exit(1);
  }
  console.log("\n✓ All configured foundation checks passed.");
}

main().catch((error) => {
  console.error("\n✗ Foundation verification crashed:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
