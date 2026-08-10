/**
 * Metron database schema (Milestone M0: mainnet foundation).
 *
 * Authoritative definitions per docs/metron-PRD.md §15.
 *
 * Money is always stored as `bigint` micro-USDC (`bigint({ mode: "number" })`)
 * — never float types. Transaction hashes are nullable by design: a receipt
 * may be recorded before its on-chain transaction is submitted/confirmed.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Lifecycle values for call receipts. */
export const PAYMENT_STATUS = {
  VERIFIED: "VERIFIED",
  UPSTREAM_FAILED: "UPSTREAM_FAILED",
  SETTLEMENT_FAILED: "SETTLEMENT_FAILED",
  /**
   * Settlement outcome is unknown (transport/timeout/5xx — the onchain
   * result may have been broadcast). Reconcile via operator tooling.
   */
  SETTLEMENT_PENDING: "SETTLEMENT_PENDING",
  SETTLED: "SETTLED",
} as const;

/** Lifecycle values for payouts. */
export const PAYOUT_STATUS = {
  NOT_REQUIRED: "NOT_REQUIRED",
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  CONFIRMED: "CONFIRMED",
  FAILED: "FAILED",
  PENDING_RETRY: "PENDING_RETRY",
} as const;

/** Ledger entry types. */
export const LEDGER_TYPE = {
  EARNING: "EARNING",
} as const;

/** Registered API developers. */
export const developers = pgTable("developers", {
  id: uuid("id").primaryKey().defaultRandom(),
  wallet_address: text("wallet_address").notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Monetized proxy routes owned by a developer. */
export const proxyRoutes = pgTable(
  "proxy_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developer_id: uuid("developer_id")
      .notNull()
      .references(() => developers.id),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    upstream_url: text("upstream_url").notNull(),
    encrypted_upstream_auth: text("encrypted_upstream_auth"),
    price_micro_usdc: bigint("price_micro_usdc", { mode: "number" }).notNull(),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Prices are always positive.
    check("proxy_routes_price_positive", sql`${table.price_micro_usdc} > 0`),
  ]
);

/** One charged call against a proxy route. */
export const callReceipts = pgTable(
  "call_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    route_id: uuid("route_id")
      .notNull()
      .references(() => proxyRoutes.id),
    developer_id: uuid("developer_id")
      .notNull()
      .references(() => developers.id),
    caller_wallet: text("caller_wallet"),
    payment_identifier: text("payment_identifier").notNull().unique(),
    amount_micro_usdc: bigint("amount_micro_usdc", { mode: "number" }).notNull(),
    asset: text("asset").notNull(),
    network: text("network").notNull(),
    scheme: text("scheme").notNull(),
    pay_to: text("pay_to").notNull(),
    payment_status: text("payment_status").notNull(),
    upstream_status_code: integer("upstream_status_code"),
    upstream_latency_ms: integer("upstream_latency_ms"),
    x402_tx_hash: text("x402_tx_hash"),
    facilitator_response: jsonb("facilitator_response"),
    error_code: text("error_code"),
    verified_at: timestamp("verified_at", { withTimezone: true }),
    settled_at: timestamp("settled_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One settlement transaction per receipt; NULLs may repeat.
    uniqueIndex("call_receipts_x402_tx_hash_unique")
      .on(table.x402_tx_hash)
      .where(sql`${table.x402_tx_hash} is not null`),
  ]
);

/** Immutable per-receipt credit entries for developer balances. */
export const creatorLedgerEntries = pgTable(
  "creator_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developer_id: uuid("developer_id")
      .notNull()
      .references(() => developers.id),
    route_id: uuid("route_id")
      .notNull()
      .references(() => proxyRoutes.id),
    call_receipt_id: uuid("call_receipt_id")
      .notNull()
      .references(() => callReceipts.id)
      .unique(),
    amount_micro_usdc: bigint("amount_micro_usdc", { mode: "number" }).notNull(),
    type: text("type").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

/** Withdrawal attempts that move ledger credits to a developer wallet. */
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    developer_id: uuid("developer_id")
      .notNull()
      .references(() => developers.id),
    call_receipt_id: uuid("call_receipt_id")
      .notNull()
      .references(() => callReceipts.id),
    ledger_entry_id: uuid("ledger_entry_id")
      .notNull()
      .references(() => creatorLedgerEntries.id)
      .unique(),
    from_wallet: text("from_wallet").notNull(),
    to_wallet: text("to_wallet").notNull(),
    amount_micro_usdc: bigint("amount_micro_usdc", { mode: "number" }).notNull(),
    status: text("status").notNull(),
    attribution_tag: text("attribution_tag"),
    tx_hash: text("tx_hash"),
    attempt_count: integer("attempt_count").notNull().default(0),
    last_error: text("last_error"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    submitted_at: timestamp("submitted_at", { withTimezone: true }),
    confirmed_at: timestamp("confirmed_at", { withTimezone: true }),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One payout transaction per hash; NULLs may repeat.
    uniqueIndex("payouts_tx_hash_unique")
      .on(table.tx_hash)
      .where(sql`${table.tx_hash} is not null`),
  ]
);
