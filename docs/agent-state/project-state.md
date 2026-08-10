# Metron — Project State

> Current system snapshot. The implementation authority is `docs/metron-PRD.md`.
> This file records what Metron IS today, based on the actual repository.

## Product

Metron turns callable API requests into paid work: a developer publishes an existing
HTTP endpoint with a flat USDC price and gets a Metron-powered URL; a caller, script,
or AI agent calls that URL, receives an x402 V2 payment requirement, authorizes the
exact payment, and receives the real upstream response after Metron's payment and
execution policy completes.

Positioning: **pay-per-request API infrastructure** ("Turn API calls into paid work. /
One call. One price. One settlement."). Zero-code for creators beyond endpoint
configuration; no accounts required for callers.

Stack: Next.js 16 (App Router) + TypeScript strict + Tailwind v4 + Drizzle/postgres.js +
Upstash Redis + viem + RainbowKit/wagmi + @x402 packages + @celo/attribution-tags + vitest.

## Canonical production constants (public, non-secret)

| Field | Value |
|---|---|
| Network | Celo Mainnet |
| Chain ID | `42220` |
| CAIP-2 | `eip155:42220` |
| USDC | `0xcEBA9300f2b948710d2653dD7B07f33A8B32118C` (viem checksum form `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`) |
| USDC decimals | 6 |
| Registered Metron payTo/treasury wallet | `0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa` |
| Attribution tag | `celo_91fed90b97fc` |
| x402 | V2, scheme `exact` |
| Facilitator API | `https://api.x402.celo.org` (dashboard `https://x402.celo.org` is NOT the API host) |
| Headers | `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE` (Base64 JSON, official encoders) |

x402 amounts are integer micro-USDC strings (`5000` = 0.005 USDC). Minimum route price
0.001 USDC (1000 base units). Protocol fee 0% (MVP).

## Current architecture (implemented flow)

```
creator SIWE auth (RainbowKit + server SIWE + Redis nonce + opaque HttpOnly session)
→ publish endpoint (POST /api/endpoints; SSRF validation; encrypted upstream auth)
→ GET|POST /p/{slug}[/path...]
→ no signature → HTTP 402 + PAYMENT-REQUIRED (server-built, real route price)
→ caller retries with PAYMENT-SIGNATURE
→ decode + policy/resource validation + deterministic payment identifier
→ durable Postgres replay PRECHECK (known auth → 409 before /verify)
→ Redis SET NX replay lock + Postgres UNIQUE payment_identifier
→ real facilitator POST /verify (same payload+requirements)
→ durable VERIFIED call_receipt
→ runtime SSRF (DNS pinning) + real upstream execution (1 MiB in / 5 MiB out / 30s)
→ upstream 2xx → durable SETTLEMENT_PENDING (before /settle) → /settle exactly once
→ SETTLED (+ tx hash) + exactly one creator EARNING (atomic transaction)
→ PAYMENT-RESPONSE + protected upstream body delivered
→ payout: reserve outstanding earnings (FOR UPDATE SKIP LOCKED) → crash-safe
  broadcast of attributed USDC transfer → CONFIRMED payout
```

Safety switches (server-side env gates, both currently FALSE):
- `X402_SETTLEMENT_ENABLED` — without `true`/`1`, settlement returns `501 SETTLEMENT_DISABLED` before any /settle call.
- `PAYOUTS_ENABLED` — without `true`/`1`, POST /api/payouts returns `403 PAYOUTS_DISABLED` before any signer/transaction work.

## Database (Supabase Postgres, drizzle)

- `developers` — `wallet_address` UNIQUE (SIWE identity; payout destination is this wallet).
- `proxy_routes` — slug UNIQUE; `price_micro_usdc` bigint CHECK > 0; `encrypted_upstream_auth`; `is_active`.
- `call_receipts` — `payment_identifier` UNIQUE; `x402_tx_hash` partial UNIQUE; money bigint; `facilitator_response` jsonb (settlement-attempt metadata for recovery).
- `creator_ledger_entries` — `call_receipt_id` UNIQUE (one EARNING per SETTLED receipt).
- `payouts` — `ledger_entry_id` UNIQUE (one payout per earning); `tx_hash` partial UNIQUE.

Payment status model: `VERIFIED` → `UPSTREAM_FAILED` | `SETTLEMENT_PENDING` (ambiguous outcome, fail-closed) | `SETTLEMENT_FAILED` | `SETTLED`.
Payout status model: `PENDING` (reserved) → `SUBMITTED` (hash persisted) → `CONFIRMED`; `FAILED` (no-hash = released reservation; with-hash = reserved pending onchain reconciliation).

Accounting: `paid = CONFIRMED payouts only`; `reserved = PENDING + SUBMITTED + FAILED-with-hash`; `available = earned − paid − reserved`.

Migration: single canonical `drizzle/0000_loving_thundra.sql` (log already applied on the real DB). Apply via `npm run db:migrate`; NEVER `drizzle push`.

## Major security properties (implemented)

- SIWE auth: server-owned nonces (Redis, atomic GETDEL), domain/URI/chain/expiry validation, viem signature verification (EOA + smart wallets), HttpOnly session cookie, session derived from cookie only.
- Creator ownership: every route/receipt/payout scoped to the authenticated session developer; foreign reads → 404.
- SSRF: publication-time URL validation (localhost/private/link-local/metadata/IPv4-mapped IPv6 blocklists) AND runtime DNS-pinned connections (connect to validated public IP with `servername`+`Host`), redirects never followed.
- Upstream credentials: AES-256-GCM encrypted at rest (Base64 32-byte key), decrypted server-side only after verification, never returned/logged.
- Boundaries: caller body ≤ 1 MiB, upstream response ≤ 5 MiB, upstream timeout 30 s, header allowlist + deny list, creator auth injected after filtering.
- Replay: Postgres `payment_identifier` precheck (any prior state → 409 before /verify) + Redis SET NX + Postgres UNIQUE.
- Settlement: durable PENDING before /settle; ambiguous outcomes stay SETTLED_PENDING; recovery requires strongly-bound onchain evidence (EIP-3009 AuthorizationUsed + same-tx canonical-USDC Transfer + calldata match), fail-closed.
- Payouts: transactional reservation (FOR UPDATE SKIP LOCKED + UNIQUE), pre-broadcast hash checkpoint (never blind-resend), recovery repairs FAILED-with-hash against onchain truth.
- Financial confirmation is separate from attribution verification (a proven transfer is CONFIRMED even if attribution decode fails; attribution reported as verified/unverified).

## Completed milestones

- **M0** — Mainnet foundation: typed env validation, canonical Celo/USDC/payTo config, drizzle schema + migration, Upstash client + probe, x402 facilitator client, lazy payout signer, attribution helper, `verify:foundation`.
- **M1** — Real creator identity: RainbowKit + wagmi (Celo only), server SIWE challenge/verify, Redis nonces, opaque sessions, `/api/me`, dashboard server gate, wallet-switch guard, sign-out UX.
- **M1.5** — Migration baseline reconciled (0000 already recorded; no-op migrate proven).
- **M1.6** — Fixed RainbowKit auth stall (truthy getNonce gate), auth-query invalidation; regression tests + browser E2E harness.
- **M2** — Endpoint publishing: create/list/detail/update/retire, slug generation, strict pricing, SSRF module, AES-256-GCM secrets, real dashboard wiring, ownership isolation.
- **M3** — Gateway: `/p/{slug}` returns genuine 402 + PAYMENT-REQUIRED from real routes; old preview page moved to `/demo`.
- **M4** — Verification: official V2 decode, policy validation, real `/verify`, deterministic payment identifier, Redis+Postgres replay, VERIFIED receipt.
- **M5** — Upstream execution: safe composition, pinned-IP transport, header policy, auth injection, limits, UPSTREAM_FAILED states.
- **M6** — Settlement: `/settle` (X-API-Key), SETTLED + tx hash, PAYMENT-RESPONSE, protected delivery, SETTLEMENT_DISABLED switch.
- **M6.1** — Post-settlement replay precheck (durable Postgres lookup before /verify).
- **M7** — Creator ledger: one EARNING per SETTLED receipt (UNIQUE), reconciliation of pre-ledger settlements, `/api/earnings`, dashboard totals.
- **M7.1** — Settlement persistence recovery: durable PENDING before /settle; onchain evidence-based pending resolution.
- **M7.2** — Authoritative recovery proof: AuthorizationUsed + same-tx canonical USDC transfer + calldata binding; conflict → stays pending.
- **M8** — Creator payouts: reservation, crash-safe attributed broadcast, confirmation evidence, payout recovery, `/api/payouts`, Withdraw UI, PAYOUTS_ENABLED switch.
- **M8.1** — False-FAILED repair: financial confirmation now keyed to the canonical-USDC Transfer log (txTo null bug fixed); recovery scans FAILED-with-hash; real payout reconciled to CONFIRMED.

## Real Mainnet evidence (public)

- First real x402 settlement tx: `0x8acaddf3c939eea0d104bb4ad3ab1ea2debc7698924dc77a540951d0cbb51b88`
- First real creator payout tx: `0xdddacd2f2cdb50f56d1e1308e51607a3e52dc785d38a3295b70e3105256579e7`
- Buyer wallet: `0xEb2712aCB5650bbc6fFa4acd73BD85779796BCDC`
- Creator wallet: `0xC44685b7c78cC9C9b7f6623d7697Ac30ab0D6Dc9`
- Metron treasury/payTo: `0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa`

Financial proof (verified from Celo Mainnet evidence):
- x402 call: 1000 micro-USDC (0.001 USDC) settled to the treasury.
- Creator earning: 1000 micro-USDC.
- Creator payout: 1000 micro-USDC (CONFIRMED, attribution verified).
- Current creator accounting: earned 0.001 / paid 0.001 / outstanding 0 / available 0.

## Current quality state (verified in the latest run)

- Tests: **396 passing** (40 files)
- Typecheck: **pass**
- Lint: **pass** (0 errors, 0 warnings)
- Build: **pass** (16 routes)
- `npm run verify:foundation`: **pass** (exit 0)
- `git diff --check`: **clean** (no whitespace issues remaining)

Switches: `X402_SETTLEMENT_ENABLED=false`, `PAYOUTS_ENABLED=false` (expected state).
