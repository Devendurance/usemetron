#!/usr/bin/env node
/**
 * Metron M9 — Real-Dashboard Evidence Verification.
 *
 * Run:  npm run verify:m9
 * (tsx with --conditions=react-server so `server-only` modules resolve to
 *  their empty variant under plain Node, and --env-file=.env to load the
 *  local environment.)
 *
 * READ-ONLY real-database check. Never writes, updates, deletes, or opens
 * a transaction — only SELECTs against Supabase (DATABASE_URL from .env).
 *
 * Verifies the two real M9 evidence records against the milestone's
 * expected values:
 *   - the creator settlement receipt whose x402_tx_hash =
 *     0x8acaddf3...cbb51b88: SETTLED, 1000 micro-USDC, upstream 200,
 *     route name "M5 Success Test", settled_at not null;
 *   - the payout whose tx_hash = 0xdddacd2f...26579e7: CONFIRMED,
 *     1000 micro-USDC, confirmed_at not null,
 *     attribution_tag "celo_91fed90b97fc".
 *
 * Exit code 0 = all assertions passed (evidence report printed);
 * 1 = a record is missing or any assertion failed.
 */

import { eq } from "drizzle-orm";

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

function assertEqual(
  label: string,
  actual: unknown,
  expected: unknown
): void {
  if (actual === expected) {
    report("ok", `${label}: ${String(actual)}`);
  } else {
    report(
      "fail",
      `${label}: expected ${JSON.stringify(expected)}, got ${
        actual === null || actual === undefined ? String(actual) : JSON.stringify(actual)
      }`
    );
  }
}

function assertNotNull(label: string, actual: unknown): void {
  if (actual !== null && actual !== undefined) {
    report("ok", `${label}: ${String(actual)}`);
  } else {
    report("fail", `${label}: expected a value, got ${String(actual)}`);
  }
}

/** Milestone-recorded on-chain evidence (from the M9 completion record). */
const SETTLEMENT_TX_HASH = "0x8acaddf3c939eea0d104bb4ad3ab1ea2debc7698924dc77a540951d0cbb51b88";
const PAYOUT_TX_HASH = "0xdddacd2f2cdb50f56d1e1308e51607a3e52dc785d38a3295b70e3105256579e7";

async function checkSettlementReceipt(): Promise<void> {
  console.log(`\n[settlement receipt]`);

  let db: typeof import("../lib/db").db;
  let callReceipts: typeof import("../lib/db").callReceipts;
  let proxyRoutes: typeof import("../lib/db").proxyRoutes;
  try {
    const dbModule = await import("../lib/db");
    db = dbModule.db;
    callReceipts = dbModule.callReceipts;
    proxyRoutes = dbModule.proxyRoutes;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report("fail", `Database module could not load: ${message}`);
    return;
  }

  let rows: Array<{
    payment_status: string;
    amount_micro_usdc: number;
    upstream_status_code: number | null;
    settled_at: Date | null;
    routeName: string | null;
  }>;
  try {
    rows = await db
      .select({
        payment_status: callReceipts.payment_status,
        amount_micro_usdc: callReceipts.amount_micro_usdc,
        upstream_status_code: callReceipts.upstream_status_code,
        settled_at: callReceipts.settled_at,
        routeName: proxyRoutes.name,
      })
      .from(callReceipts)
      .leftJoin(proxyRoutes, eq(proxyRoutes.id, callReceipts.route_id))
      .where(eq(callReceipts.x402_tx_hash, SETTLEMENT_TX_HASH))
      .limit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report("fail", `Receipt query failed: ${message}`);
    return;
  }

  const receipt = rows[0];
  if (receipt === undefined) {
    report(
      "fail",
      `No call_receipts row found with x402_tx_hash ${SETTLEMENT_TX_HASH}`
    );
    return;
  }

  assertEqual("payment_status", receipt.payment_status, "SETTLED");
  assertEqual("amount_micro_usdc", receipt.amount_micro_usdc, 1000);
  assertEqual("upstream_status_code", receipt.upstream_status_code, 200);
  assertEqual("route name", receipt.routeName, "M5 Success Test");
  assertNotNull("settled_at", receipt.settled_at);
}

async function checkPayout(): Promise<void> {
  console.log(`\n[payout]`);

  let db: typeof import("../lib/db").db;
  let payouts: typeof import("../lib/db").payouts;
  try {
    const dbModule = await import("../lib/db");
    db = dbModule.db;
    payouts = dbModule.payouts;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report("fail", `Database module could not load: ${message}`);
    return;
  }

  let rows: Array<{
    status: string;
    amount_micro_usdc: number;
    confirmed_at: Date | null;
    attribution_tag: string | null;
  }>;
  try {
    rows = await db
      .select({
        status: payouts.status,
        amount_micro_usdc: payouts.amount_micro_usdc,
        confirmed_at: payouts.confirmed_at,
        attribution_tag: payouts.attribution_tag,
      })
      .from(payouts)
      .where(eq(payouts.tx_hash, PAYOUT_TX_HASH))
      .limit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report("fail", `Payout query failed: ${message}`);
    return;
  }

  const payout = rows[0];
  if (payout === undefined) {
    report("fail", `No payouts row found with tx_hash ${PAYOUT_TX_HASH}`);
    return;
  }

  assertEqual("status", payout.status, "CONFIRMED");
  assertEqual("amount_micro_usdc", payout.amount_micro_usdc, 1000);
  assertNotNull("confirmed_at", payout.confirmed_at);
  assertEqual("attribution_tag", payout.attribution_tag, "celo_91fed90b97fc");
}

async function main(): Promise<void> {
  console.log("Metron M9 — real-dashboard evidence verification");
  console.log("READ-ONLY: only SELECTs are issued. No funds are moved.");

  await checkSettlementReceipt();
  await checkPayout();

  console.log(`\n[result]`);
  for (const line of lines) {
    console.log(`${" ".repeat(CHECK_ORDER - icon(line.status).length)}${icon(line.status)} ${line.text}`);
  }

  if (failures.length > 0) {
    console.log(`\n✗ ${failures.length} assertion(s) failed — see above.`);
    process.exit(1);
  }
  console.log("\n✓ All M9 real-evidence assertions passed — dashboard records match the milestone.");
  // The shared drizzle/postgres pool keeps the event loop alive; exit
  // explicitly (same pattern as scripts/reconcile-ledger.ts).
  process.exit(0);
}

main().catch((error) => {
  console.error("\n✗ M9 dashboard verification crashed:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
