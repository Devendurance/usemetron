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
→ runtime SSRF (DNS pinning) + real upstream execution (1 MiB in / 5 MiB out / 30s;
  compression never negotiated — `accept-encoding: identity` pinned; any compressed
  2xx body is decoded server-side with a bounded, fail-closed step)
→ upstream 2xx → durable SETTLEMENT_PENDING (before /settle) → /settle exactly once
→ SETTLED (+ tx hash) + exactly one creator EARNING (atomic transaction)
→ M10 payout handoff (best effort, gated by PAYOUTS_ENABLED): reserve the EXACT
  earning for this receipt (FOR UPDATE, one payout per earning — any existing row
  blocks re-reserve) → crash-safe attributed USDC broadcast → CONFIRMED payout
  (outcome NEVER affects caller delivery)
→ PAYMENT-RESPONSE + protected upstream body delivered (X-METRON-RECEIPT-ID header)
```

Safety switches (server-side env gates — semantics below; CURRENT `.env` STATE is
`X402_SETTLEMENT_ENABLED=true`, `PAYOUTS_ENABLED=true` — a USER-MANAGED DEVIATION from the
required production state of `false`/`false`, recorded in `left-off.md`; do NOT touch .env):
- `X402_SETTLEMENT_ENABLED` — without `true`/`1`, settlement returns `501 SETTLEMENT_DISABLED` before any /settle call.
- `PAYOUTS_ENABLED` — without `true`/`1`, the gateway's automatic exact-earning payout handoff short-circuits (`skipped/disabled`) before any reserve/signer/transaction work. There is no manual payout endpoint (POST /api/payouts was removed in M10).

V1.5A additions — OpenAPI import + Creator Test Console (no payment architecture changes):
- `POST /api/openapi/parse` (session auth; 1 MiB bound checked before parsing; OpenAPI 3.0.x/3.1.x only; external `$ref`s rejected; `@readme/openapi-parser` validation with external resolution disabled; IP-scoped rate limit 10/60). The spec is never persisted and never echoed — only the normalized operation model returns. Pure, injectable core in `lib/openapi/*` (no network, no code execution).
- `POST /api/openapi/publish` (session auth; ≤ 50 ops/batch; sequential creates through the EXISTING `endpointService.create` — ownership, slug generation, AES-256-GCM secret encryption, SSRF checks, powered URL all inherited; partial-failure semantics: always HTTP 200 + `{results}`, per-operation machine codes; IP-scoped rate limit 10/60). NO server idempotency key in V1.5A — two identical publishes create two routes (documented limitation; the client uses an in-flight guard and retry-failed-only).
- Split-route model — NO schema change, no migration: each imported operation publishes a normal route whose `upstreamUrl` = effective server base (OpenAPI precedence: operation `servers` → path `servers` → root `servers`) + the operation path. Operations with path params carry a `callerPathTemplate` shown as the documented caller path appended to the powered URL; callers substitute values there and the gateway forwards the segments.
- Creator Test Console — `POST /api/endpoints/test` (session auth; IP-scoped rate limit 20/60), shared `components/dashboard/upstream-test-console.tsx` embedded in the publish form (draft mode), the import configure step (draft mode), and the endpoint detail (existing mode). It executes ONE live request through the SAME hardened upstream path the paid gateway uses (runtime SSRF revalidation + DNS pin, decrypt, header filtering + creator-auth injection after filtering, compression normalization, 1 MiB in / 5 MiB out / 30 s, redirects never followed) — it is never a weaker parallel client. **Money safety: plain HTTPS GET/POST to the creator-configured public upstream ONLY — no x402 challenge, no /verify, no /settle, no payout, no ledger, no blockchain activity, zero financial side effects.** Transient draft secrets are encrypted → decrypted server-side → auto-registered with the log redactor, never persisted; response previews redact any value containing the active secret (echo upstreams included); stored credentials are decrypted server-side only and never disclosed to the caller.

## Database (Supabase Postgres, drizzle)

- `developers` — `wallet_address` UNIQUE (SIWE identity; payout destination is this wallet).
- `proxy_routes` — slug UNIQUE; `price_micro_usdc` bigint CHECK > 0; `encrypted_upstream_auth`; `is_active`.
- `call_receipts` — `payment_identifier` UNIQUE; `x402_tx_hash` partial UNIQUE; money bigint; `facilitator_response` jsonb (settlement-attempt metadata for recovery).
- `creator_ledger_entries` — `call_receipt_id` UNIQUE (one EARNING per SETTLED receipt).
- `payouts` — `ledger_entry_id` UNIQUE (one payout per earning); `tx_hash` partial UNIQUE. Any existing payout row (any status) blocks re-reserving the earning — the gateway never re-broadcasts.

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
- Response integrity: `accept-encoding: identity` pinned upstream (caller `accept-encoding` removed from the forward allowlist); a compressed upstream reply (gzip/x-gzip/deflate/br) is decoded server-side with the same 5 MiB cap applied to the DECODED size (compression-bomb safe); undecodable bodies fail closed (`UPSTREAM_RESPONSE_DECODE_FAILED`) and are never delivered. The delivered header set is exactly `DELIVERABLE_HEADERS` + `PAYMENT-RESPONSE` + `X-METRON-RECEIPT-ID`; hop-by-hop and cookie headers never reach callers.
- Replay: Postgres `payment_identifier` precheck (any prior state → 409 before /verify) + Redis SET NX + Postgres UNIQUE.
- Rate limiting (M11 + V1.5A): six surfaces — auth-challenge 20/60s, gateway-anonymous 60/60s (both per client IP), gateway-signed 30/60s (per payment identifier, IP fallback), and three session-authenticated V1.5A surfaces per client IP — openapi-parse 10/60s, openapi-publish 10/60s, endpoint-test 20/60s. 429 = JSON `{"error":"RATE_LIMITED","retryAfterSeconds":N}` + `retry-after`. Redis counters with bounded TTL; fail-open (`degraded`) on Redis errors — a paid flow is never strangled by a limiter outage. `X-Forwarded-For` is trusted ONLY when `RATE_LIMIT_TRUST_PROXY_HEADER=true` (opt-in; default untrusted).
- Safe logging (M11): all PRD §23 stages through `lib/observability/logger.ts` — JSON lines, injected secret env values never serialized, values under sensitive keys redacted, URL credentials scrubbed.
- Env fail-fast (M11): `lib/env.ts` presence+format validation and `lib/env/canonical.ts` canonical Celo Mainnet constant checks — production refuses to boot on missing/invalid/canonical-mismatched config (names only, never values).
- Settlement: durable PENDING before /settle; ambiguous outcomes stay SETTLED_PENDING; recovery requires strongly-bound onchain evidence (EIP-3009 AuthorizationUsed + same-tx canonical-USDC Transfer + calldata match), fail-closed.
- Payouts: automatic exact-earning handoff in the gateway settled branch (gated by `PAYOUTS_ENABLED`; at most one payout per earning via FOR UPDATE + UNIQUE reserve; any existing row → skipped, never re-broadcast); pre-broadcast hash checkpoint (never blind-resend); recovery repairs FAILED-with-hash against onchain truth. FAILED-without-hash releases its reservation but is never auto-rebroadcast — recovery is operational.
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
- **M8** — Creator payouts: reservation, crash-safe attributed broadcast, confirmation evidence, payout recovery, `PAYOUTS_ENABLED` switch (manual POST /api/payouts + Withdraw UI added here; both removed in M10).
- **M8.1** — False-FAILED repair: financial confirmation now keyed to the canonical-USDC Transfer log (txTo null bug fixed); recovery scans FAILED-with-hash; real payout reconciled to CONFIRMED.
- **M9** — Real dashboard + transaction evidence: receipts/payouts/transactions pages show real DB data with onchain evidence; `verify:m9` gate.
- **M10** — Automatic exact-earning payout handoff in the gateway settled branch (gated by `PAYOUTS_ENABLED`; payout outcome never affects caller delivery; `X-METRON-RECEIPT-ID` on settled responses); manual withdraw removed (no POST /api/payouts, no Withdraw UI); standalone external client `tools/m10-external-client.mjs` (`npm run m10:client`); switches false, manual mainnet E2E evidence recorded below.
- **M10.1** — Response integrity + evidence: compression never negotiated upstream (`accept-encoding: identity` pinned; caller header removed from the allowlist), bounded gzip/x-gzip/deflate/br decode with fail-safe (`UPSTREAM_RESPONSE_DECODE_FAILED`, 5 MiB decoded cap), receipt "Caller" label fix (static guard tests), external client decodes binary bodies charset-aware, delivery regression tests (`lib/gateway/delivery.test.ts`).
- **M11** — Production hardening: rate limiting on all three surfaces (20/60 auth-challenge, 60/60 gateway-anonymous, 30/60 gateway-signed; 429 + `retry-after`; bounded TTL; fail-open degraded; opt-in XFF trust via `RATE_LIMIT_TRUST_PROXY_HEADER`), safe logger with secret redaction (all PRD §23 stages), env fail-fast + canonical constants check, SSRF blocklist extensions (CGNAT/benchmarking/multicast/reserved/IPv6 doc ranges + DNS tests), payout wallet lock (Redis, fail-open), and the full acceptance matrix + operator recovery + rate-limit config documented in `docs/production-readiness.md`.
- **V1.5A** — OpenAPI import + Creator Test Console: pure parse core `lib/openapi/*` (1 MiB bound, 3.0.x/3.1.x gate, external `$ref` rejection, injectable validation, operation discovery with server precedence + SSRF publishability checks, security hints); `POST /api/openapi/parse` (spec never persisted/echoed, machine errors, 10/60 IP limit); `POST /api/openapi/publish` (batch ≤ 50, sequential creates via the existing service, partial-failure results, 10/60 IP limit, no server idempotency key — documented limitation); split-route model with NO schema change (server base + operation path as `upstreamUrl`; operation path as documented caller path for path-param ops); import flow UI at `/dashboard/endpoints/import` (paste → review → configure → results) with per-row test consoles; Creator Test Console `lib/testconsole/*` + `POST /api/endpoints/test` (20/60 IP limit) executing through the SAME hardened upstream path with zero payment side effects — transient draft secrets never persisted + preview redaction, stored credentials never disclosed; three new rate-limit surfaces (openapi-parse 10/60, openapi-publish 10/60, endpoint-test 20/60).

## Real Mainnet evidence (public)

- First real x402 settlement tx: `0x8acaddf3c939eea0d104bb4ad3ab1ea2debc7698924dc77a540951d0cbb51b88`
- First real creator payout tx: `0xdddacd2f2cdb50f56d1e1308e51607a3e52dc785d38a3295b70e3105256579e7`
- M10 manual-E2E x402 settlement tx: `0x821dd6c12157f03aae18948c89a4c7046cd609eb136d52ddad64c57195b54a3a` (receipt SETTLED, upstream 200)
- M10 manual-E2E creator payout tx: `0xa89d119600bfe366aeff364926546c626d6d04cbf08f347f4c13a4290b00a269` (payout CONFIRMED, attribution verified)
- Buyer wallet: `0xEb2712aCB5650bbc6fFa4acd73BD85779796BCDC`
- Creator wallet: `0xC44685b7c78cC9C9b7f6623d7697Ac30ab0D6Dc9`
- Metron treasury/payTo: `0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa`

Financial proof (verified from Celo Mainnet evidence):
- M9 x402 call: 1000 micro-USDC (0.001 USDC) settled to the treasury; creator earning 1000 micro-USDC; creator payout 1000 micro-USDC (CONFIRMED, attribution verified).
- M10 manual-E2E x402 call: 1000 micro-USDC (0.001 USDC) settled to the treasury; creator earning 1000 micro-USDC; creator payout 1000 micro-USDC (CONFIRMED, attribution verified).
- Current creator accounting: earned 0.002 / paid 0.002 / outstanding 0 / available 0.

## Current quality state (verified in the latest V1.5A run)

- Tests: **778 passing** (68 files)
- Typecheck: **pass**
- Lint: **pass** (0 errors; 1 pre-existing warning in `lib/payouts/broadcast.test.ts`, untouched by V1.5A)
- Build: **pass** (26 routes)
- `npm run verify:foundation`: **pass** (exit 0; external `api.x402.celo.org/health` returned HTTP 200 in this run; Postgres/Redis probes OK; payout signer matches the registered wallet)
- `git diff --check`: **clean** (no whitespace issues)
- Money-safety re-check (V1.5A Task 7): the test console issues plain HTTPS GET/POST through the SSRF-safe upstream service only — `lib/testconsole/core.ts` and `POST /api/endpoints/test` contain no x402 //verify//settle/payout/ledger/blockchain path; no money moved; earned = paid = 0.002 USDC, outstanding 0.

Switches: `.env` currently has `X402_SETTLEMENT_ENABLED=true`, `PAYOUTS_ENABLED=true`, `RATE_LIMIT_TRUST_PROXY_HEADER=true` — a USER-MANAGED deviation from the required production state (false/false/off). Left exactly as the user set them; the required state before any funded deployment is false/false/off.
