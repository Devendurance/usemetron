CREATE TABLE "call_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"developer_id" uuid NOT NULL,
	"caller_wallet" text,
	"payment_identifier" text NOT NULL,
	"amount_micro_usdc" bigint NOT NULL,
	"asset" text NOT NULL,
	"network" text NOT NULL,
	"scheme" text NOT NULL,
	"pay_to" text NOT NULL,
	"payment_status" text NOT NULL,
	"upstream_status_code" integer,
	"upstream_latency_ms" integer,
	"x402_tx_hash" text,
	"facilitator_response" jsonb,
	"error_code" text,
	"verified_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_receipts_payment_identifier_unique" UNIQUE("payment_identifier")
);
--> statement-breakpoint
CREATE TABLE "creator_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"call_receipt_id" uuid NOT NULL,
	"amount_micro_usdc" bigint NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_ledger_entries_call_receipt_id_unique" UNIQUE("call_receipt_id")
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "developers_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"call_receipt_id" uuid NOT NULL,
	"ledger_entry_id" uuid NOT NULL,
	"from_wallet" text NOT NULL,
	"to_wallet" text NOT NULL,
	"amount_micro_usdc" bigint NOT NULL,
	"status" text NOT NULL,
	"attribution_tag" text,
	"tx_hash" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_ledger_entry_id_unique" UNIQUE("ledger_entry_id")
);
--> statement-breakpoint
CREATE TABLE "proxy_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"upstream_url" text NOT NULL,
	"encrypted_upstream_auth" text,
	"price_micro_usdc" bigint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proxy_routes_slug_unique" UNIQUE("slug"),
	CONSTRAINT "proxy_routes_price_positive" CHECK ("proxy_routes"."price_micro_usdc" > 0)
);
--> statement-breakpoint
ALTER TABLE "call_receipts" ADD CONSTRAINT "call_receipts_route_id_proxy_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."proxy_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_receipts" ADD CONSTRAINT "call_receipts_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_ledger_entries" ADD CONSTRAINT "creator_ledger_entries_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_ledger_entries" ADD CONSTRAINT "creator_ledger_entries_route_id_proxy_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."proxy_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_ledger_entries" ADD CONSTRAINT "creator_ledger_entries_call_receipt_id_call_receipts_id_fk" FOREIGN KEY ("call_receipt_id") REFERENCES "public"."call_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_call_receipt_id_call_receipts_id_fk" FOREIGN KEY ("call_receipt_id") REFERENCES "public"."call_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_ledger_entry_id_creator_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."creator_ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxy_routes" ADD CONSTRAINT "proxy_routes_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_receipts_x402_tx_hash_unique" ON "call_receipts" USING btree ("x402_tx_hash") WHERE "call_receipts"."x402_tx_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_tx_hash_unique" ON "payouts" USING btree ("tx_hash") WHERE "payouts"."tx_hash" is not null;