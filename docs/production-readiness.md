# Metron — Production Readiness

PRD §27 acceptance matrix with truthful evidence, deployment prerequisites,
operator recovery, and rate-limit configuration. Evidence is exactly what was
observed — nothing re-run for effect, nothing replayed.

## 1. PRD §27 acceptance matrix

| # | Acceptance | Status | Evidence |
|---|---|---|---|
| A | End-to-end success on Celo Mainnet | **PASS** | Real M10 Mainnet txs (see below) — NOT re-executed in M11; verified read-only (SETTLED / upstream 200 / payout CONFIRMED / earned = paid = 0.002 USDC / outstanding 0 / dashboard persistence / M10.1 response integrity). |
| B | Upstream failure | **PASS** | Test evidence (mocked upstream): `lib/gateway/upstream-service.test.ts` — "non-2xx is a failure with status", "transport timeout maps to UPSTREAM_TIMEOUT", "oversized transport response maps to UPSTREAM_RESPONSE_TOO_LARGE", "never auto-retries on failure". Gateway wiring (no /settle on failure, receipt `UPSTREAM_FAILED`, no earning/payout): `lib/gateway/settlement-flow.test.ts` ("the durable PENDING mark always happens before /settle classification"), gateway route tests `lib/endpoints/gateway-service.test.ts` ("a valid response means VERIFIED, not settled (no settle anywhere)"). Mock-based, not Mainnet-proven. |
| C | Settlement failure | **PASS** | Test evidence (mocked facilitator): `lib/gateway/settlement-service.test.ts` — "rejects when the facilitator reports explicit failure", "rejects a 4xx facilitator response carrying success:false", "refuses to fabricate a transaction hash"; `lib/gateway/settlement-flow.test.ts` — "B: PENDING → explicit failure → SETTLEMENT_FAILED, no earning", "C: PENDING → transport/timeout ambiguity → stays PENDING, no earning". Mock-based (facilitator mocked), not Mainnet-proven. |
| D | Payout failure | **PASS** | Test evidence (mocked chain): `lib/payouts/handoff.test.ts` — "never throws for any broadcast outcome", "maps a failed broadcast to FAILED with the reason", "reports already_handled when the earning is already reserved (broadcast NOT called)"; `lib/payouts/broadcast.test.ts` — "persists SUBMITTED + tx hash BEFORE broadcast (crash-safe ordering)", "treats a broadcast failure as ambiguous (never blind-resend)"; `lib/payouts/accounting.test.ts` — "counts only CONFIRMED payouts as paid", "a FAILED row WITHOUT a tx hash releases its reservation". Caller delivery is unaffected by payout outcome by construction (handoff never throws). Mock-based, not Mainnet-proven. |
| E | Replay | **PASS** | Test evidence: `lib/endpoints/gateway-service.test.ts` — "rejects the same authorization a second time", "creates exactly one receipt under concurrent identical requests", "treats a Postgres unique violation as a replay and releases the lock", "rejects a known %s identifier with 409 BEFORE /verify" (durable precheck). Durable enforcement: Postgres `payment_identifier` UNIQUE + Redis SET NX lock (`lib/redis/locks.ts`). Test-based; the enforcement is structural (DB UNIQUE), not Mainnet-replayed. |

### A — evidence (M10 Mainnet, NOT repeated in M11)

- x402 settlement: `0x821dd6c12157f03aae18948c89a4c7046cd609eb136d52ddad64c57195b54a3a` — receipt `SETTLED`, 1000 micro-USDC (0.001 USDC), upstream 200, `settled_at` persisted (re-verified read-only in M11 Task 5).
- Creator payout: `0xa89d119600bfe366aeff364926546c626d6d04cbf08f347f4c13a4290b00a269` — payout `CONFIRMED`, 1000 micro-USDC, attribution `celo_91fed90b97fc` verified, `confirmed_at` persisted.
- Accounting: earned = paid = 0.002 USDC; outstanding = 0; reserved = 0 (no non-final payout rows).
- Dashboard persistence (M9) and M10.1 response integrity (identity pin, bounded decode) are covered by their own gates (`npm run verify:m9`, delivery tests).
- The M10 paid call itself was deliberately NOT repeated during M11. Both switches were false throughout.

### Evidence truthfulness notes

- B/C/D/E are all test-based with mocked external dependencies (upstream, facilitator, chain). They prove the state machines, exactly-once behavior, and fail-closed classification; they do not prove Mainnet facilitator/chain behavior under failure.
- A is the only Mainnet-proven leg, and only the happy path. Mainnet failure-path behavior is covered only by the state machine tests above.

## 2. Deployment prerequisites (genuine remaining items)

1. **`RATE_LIMIT_TRUST_PROXY_HEADER=true` only behind a trusted proxy.** Without a proxy that strips client-supplied `X-Forwarded-For`, the header is spoofable and must stay off (default = untrusted bucket). Set it only where the platform (e.g. Vercel/Cloudflare) overwrites the header with the real client IP.
2. **Production HTTPS + cookie `Secure`.** The session cookie must be `Secure` in production; the deployment must terminate HTTPS. The env fail-fast already rejects non-HTTPS RPC/facilitator URLs.
3. **Upstash rate-limit keys are bounded.** The limiter applies a TTL equal to the window exactly when a counter starts (`INCR` returns 1) and never re-applies it (`lib/ratelimit/limiter.ts` tests "sets the bounded TTL window exactly when the counter starts", "never re-applies the TTL on subsequent increments"). If `EXPIRE` fails at counter start the limiter retries once; if it fails again the key is DELeted (window reset) and the request is allowed with `degraded: true` — a counter can never accumulate without a TTL.
4. **Facilitator credits.** Settlement runs through the facilitator API key (`X402_API_KEY`); ensure the account has credits for paid tests.
5. **Settlement-wallet gas.** The payout signer needs CELO for gas; the settlement wallet receives USDC.
6. **Operator recovery** — see §3 (`npm run reconcile:ledger`).
7. **Switches.** `X402_SETTLEMENT_ENABLED` and `PAYOUTS_ENABLED` are flipped to `true` only during deliberate, funded paid tests and returned to `false` immediately after.
8. **Signed-attempt 429 trade-off.** Signed gateway attempts are rate-limited by payment identifier (or IP fallback) at 30/60. A genuine payer who exceeds this gets a `429 RATE_LIMITED` with `retry-after` — by design, a 429 (retryable) rather than a 502. Tune the limit up if legitimate batch callers hit it.
9. **`NEXT_PUBLIC_APP_URL=https://usemetron.vercel.app`** in Vercel — set it in the **Production** scope; do not use the preview hostname as the canonical base (powered URLs are built from this value).

## 3. Operator payout recovery

Mechanism: `npm run reconcile:ledger` (CLI-only, `scripts/reconcile-ledger.ts`). It runs three safe, idempotent passes:

1. **Ledger backfill** — creates exactly one EARNING for every SETTLED receipt that lacks one (UNIQUE `call_receipt_id`; reruns never duplicate).
2. **Pending settlement resolution** — resolves `SETTLEMENT_PENDING` receipts using strongly bound onchain evidence (EIP-3009 `AuthorizationUsed` + same-tx canonical-USDC transfer + calldata match); conflicts or missing evidence stay pending.
3. **Payout recovery** — for payouts that are `SUBMITTED`/`FAILED`-with-hash (reserved, possibly in flight), inspects the persisted tx hash onchain:
   - confirmed transfer → finalize to `CONFIRMED` exactly once (idempotent; each payout finalized with its own id);
   - reverted → mark `FAILED`, release the reservation;
   - unknown (RPC down, receipt not final) → kept reserved, never guessed.

Hard rules:

- **CLI-only.** Recovery is a local script; it is not network-exposed and never accepts a client wallet address or amount. Payout destination is always the creator wallet bound to the earning.
- **Onchain hash inspection before any action.** A payout is only finalized/marked-failed after the persisted hash's receipt is read onchain. No blind actions.
- **Never blind-resends.** Recovery never re-broadcasts anything; a FAILED-without-hash payout releases its reservation but is not auto-rebroadcast (the exact-earning reserve blocks re-insertion — gateway and recovery both respect that).
- **Wallet lock.** Concurrent payout broadcast is serialized per-wallet via a Redis lock (`lib/payouts/wallet-lock.ts`, key `payout-wallet-lock:{wallet}`) so nonce ordering is safe; the lock is fail-open (an outage never strands a payout) — see §5.

## 4. Rate-limit configuration

Protected surfaces and default policies (source of truth: `lib/ratelimit/policy.ts`):

| Surface | Scope | Limit | Window | Auth |
|---|---|---|---|---|
| Auth challenge (per client IP) | `auth-challenge` | 20 | 60 s | anonymous |
| Anonymous gateway — unpaid 402 traffic (per client IP) | `gateway-anonymous` | 60 | 60 s | anonymous |
| Signed gateway attempts (per payment identifier, IP fallback) | `gateway-signed` | 30 | 60 s | signed |
| OpenAPI spec parsing (per client IP) | `openapi-parse` | 10 | 60 s | session |
| OpenAPI import publishing (per client IP) | `openapi-publish` | 10 | 60 s | session |
| Test-console upstream executions (per client IP) | `endpoint-test` | 20 | 60 s | session |

- **429 shape** (all surfaces): HTTP 429 with JSON `{"error":"RATE_LIMITED","retryAfterSeconds":<window>}` and a `retry-after` header. Machine-readable and consistent with the rest of the gateway.
- **Trust flag:** `RATE_LIMIT_TRUST_PROXY_HEADER=true` (only `"true"`/`"1"`, case-insensitive) enables trusting `X-Forwarded-For` (first entry). Default off — with the flag off every request shares a single `"untrusted"` bucket per scope (a global shared bucket; the header is never consulted, so there is no per-IP limiting at all); per-IP limiting requires `RATE_LIMIT_TRUST_PROXY_HEADER=true` behind a proxy that strips client-supplied values (tests: `lib/ratelimit/client-ip.test.ts`).
- **Fail-open (degraded) behavior:** when Redis `INCR`/`EXPIRE` throws or returns a failure, the limiter allows the request with `degraded: true` (logged as `rate_limit_degraded`). Rationale: a paid (signed) flow must never be strangled by a limiter outage; the cost is a temporary loss of abuse protection. The challenge endpoint and the three V1.5A surfaces have the same fail-open behavior.
- **Bounded keys:** counters carry a TTL equal to the window set exactly at counter start; `EXPIRE` failure there is retried once and falls back to DEL (window reset) with a degraded verdict (see §2 item 3).
- **Signed-bucket coverage:** a payer who re-signs fresh authorizations mints a new payment identifier per attempt, so the 30/60 signed bucket bounds replay-of-the-same-signature (the actual DoS) but not keyed adversaries.

## 5. M11 hardening summary (what changed)

- Rate limiting on the three M11 surfaces (extended to six in V1.5A — see §4), fail-open degraded mode, opt-in XFF trust.
- Safe logger (`lib/observability/logger.ts`) covering all PRD §23 stages with secret redaction (env values never serialized, values under sensitive keys redacted, URL credentials scrubbed).
- Env fail-fast (`lib/env.ts` + `lib/env/canonical.ts`): required-variable presence and format checks; canonical Celo Mainnet constants mismatch detection; secrets by name only.
- SSRF validation extended (CGNAT 100.64/10, benchmarking 198.18/15, multicast, reserved, IPv6 multicast/doc ranges) + DNS-resolution tests.
- Payout wallet lock (Redis, fail-open) for nonce-safe serialized broadcasts.
- Re-verified read-only: M10 settlement/payout records and accounting (earned = paid = 0.002 USDC, outstanding 0, switches false).
- Upstream auth E2E-verified against the live CoinMarketCap upstream (`CMC_API_KEY=<...> npm run verify:upstream:live`; operator-env-only — the key is never committed or printed).

## 6. V1.5A notes (OpenAPI import + Creator Test Console)

**Money-safety statement:** the Creator Test Console (`POST /api/endpoints/test`) issues plain HTTPS GET/POST requests to creator-configured public upstreams through the SSRF-safe upstream service (`upstreamService.executeUpstream` — runtime SSRF revalidation + DNS pin, header filtering + creator-auth injection, compression normalization, 1 MiB in / 5 MiB out / 30 s, redirects never followed). It contains NO payment path: no x402 challenge, no /verify, no /settle, no payout, no ledger entry, no signer, no blockchain activity — zero financial side effects by construction. It never bypasses the SSRF/bounds of the paid path because it IS the same hardened execution path, with a fixed informational route identity.

Other deployment-relevant V1.5A facts:

- **Both new APIs are session-authenticated** (SIWE dashboard session required); anonymous traffic cannot reach them.
- **Spec handling:** `POST /api/openapi/parse` accepts a single self-contained OpenAPI 3.0.x/3.1.x document up to 1 MiB; external `$ref`s are rejected; the spec is never persisted, logged, or echoed — only the normalized operation model returns. Raw parser internals never reach clients (machine error codes only).
- **Import publish reuses the existing create path** (ownership, slug generation, AES-256-GCM encryption, SSRF validation, powered URL) — no duplicated logic, no schema change. Batch limit 50 operations/request; per-operation failures are isolated (HTTP 200 + `{results}` with machine codes).
- **Known limitation (documented): no server idempotency key on publish.** Two identical publishes create two routes; the client mitigates with an in-flight guard and retry-failed-only. A server-side key is deferred.
- **Test-secret hygiene:** draft test secrets are encrypted in transit to the API, decrypted server-side, auto-registered with the log redactor (M11.1 `onDecrypt` wiring), and never persisted; response previews are redacted server-side (any value containing the active secret becomes `[REDACTED]` — echo upstreams included) and capped at 64 KiB. Stored credentials are decrypted server-side only and never disclosed.
- **HTTP upstreams:** the test console inherits the production restriction — plain `http://` upstreams are rejected in production (`NODE_ENV === "production"`), matching the publish path.
