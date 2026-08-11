# Metron — Durable Decisions & Gotchas

Durable engineering decisions and discovered lessons. Not task status.

## Architecture decisions

- `docs/metron-PRD.md` is the single implementation authority; subordinate docs defer to it.
- Production is Celo Mainnet only (`42220`, `eip155:42220`). Never Alfajores/Sepolia in active code.
- x402 V2, scheme `exact`; canonical headers `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`; legacy `X-PAYMENT` is not the contract.
- All x402 payments use the registered Metron `payTo` wallet (`0x21E5…bcDa`) for the hackathon scope.
- The creator payout is a separate, attributed transaction (Track 1) from the x402 settlement (Track 2); they must never be conflated.
- Protocol fee is 0% for the MVP; gross = net.
- Financial values are integer micro-USDC (`bigint`/strings) everywhere; floats are forbidden for money.
- Creator identity is derived exclusively from the authenticated server session — never from client input.
- Upstream credentials are encrypted with AES-256-GCM (Base64 32-byte `UPSTREAM_SECRET_ENCRYPTION_KEY`); plaintext exists only transiently server-side after verification.
- Anonymous 402 challenges create no durable receipts; a `call_receipt` begins only after valid verification.
- Postgres is the durable replay/accounting authority; Redis is fast concurrency (nonces, locks, precheck acceleration).
- Verification does not mean settlement; `/verify` success alone never persists SETTLED or pays creators.
- Upstream must succeed (2xx) before `/settle`; upstream failure → `UPSTREAM_FAILED`, never settle.
- The protected upstream body is delivered only after confirmed settlement (`PAYMENT-RESPONSE` included).
- `SETTLEMENT_PENDING` is intentionally fail-closed: unknown outcomes stay pending for operator reconciliation, never guessed settled and never auto-retried.
- Settlement recovery requires strongly bound onchain evidence (EIP-3009 `AuthorizationUsed` payer+nonce AND same-tx canonical-USDC `Transfer` to the registered wallet for the exact amount AND calldata match where decodable).
- Only SETTLED receipts create an EARNING (UNIQUE `call_receipt_id`).
- Payout destination is always the authenticated creator wallet (SIWE-bound); no arbitrary withdrawal addresses.
- Payout gas (CELO) is not deducted from creator earnings; the promised payout amount is exact.
- Payout transactions carry `celo_91fed90b97fc` via `@celo/attribution-tags` (`toDataSuffix` appended to the ERC-20 transfer calldata; EVM ignores trailing bytes).
- Financial payout confirmation is separate from attribution verification: a proven transfer is CONFIRMED even if attribution decode fails; attribution is reported verified/unverified.
- A non-final payout with a persisted tx hash is never blindly resent; recovery inspects the hash onchain.
- Settlement/payout safety switches (`X402_SETTLEMENT_ENABLED`, `PAYOUTS_ENABLED`) stay false except during intentional manual tests, then return to false.
- `METRON_SETTLEMENT_PRIVATE_KEY` is server-only, never in bundles/logs; the facilitator handles x402 settlement (the key is only for creator payouts).

## M11 decisions (production hardening)

- **Rate limiter fails OPEN (degraded), never closed.** Redis INCR/EXPIRE errors → request allowed with `degraded: true` logged. Rationale: the signed flow is a paid flow — a limiter outage must never strangle or 429 a paying caller; the cost (temporary loss of abuse protection) is accepted and logged. Same behavior on the auth-challenge surface.
- **X-Forwarded-For is trusted ONLY via an opt-in switch** (`RATE_LIMIT_TRUST_PROXY_HEADER=true`). With the flag off, ALL traffic shares a single `"untrusted"` bucket per scope — a global shared bucket: `resolveClientIdentifier` never reads the socket or the header, so there is no per-IP limiting at all. Per-IP limiting requires the flag behind a proxy (e.g. Vercel/Cloudflare) that strips and overwrites client-supplied values.
- **Rate-limit keys are bounded at counter start**: TTL = window is applied exactly when `INCR` returns 1 and never re-applied. If `EXPIRE` fails at counter start the limiter retries once, then falls back to DEL (window reset) with `degraded: true` — a counter can never accumulate without a TTL (`lib/ratelimit/limiter.test.ts`).
- **Payout wallet lock is fail-open.** A contended or failing Redis lock (`payout-wallet-lock:{wallet}`) never strands a payout: the broadcast runs anyway with `locked:false`. When the lock works it serializes broadcasts so nonce ordering is safe; on lock failure, exactly-once is still preserved by the earning reserve + onchain-truth recovery (idempotent).
- **Logger redaction by construction.** Secret env values are never serialized; values under sensitive keys (signature, secret, token, authorization, private_key, api_key, cookie, session, password, credential, passphrase — case/punctuation-insensitive) are always `[REDACTED]`; URL userinfo passwords are scrubbed while scheme/user/host stay readable for diagnosis.
- **Env fail-fast is canonical.** Production refuses to boot on missing required vars, malformed formats (chain id, CAIP-2, addresses, URLs, secret lengths, key shapes), or canonical Celo Mainnet constant mismatches (`lib/env/canonical.ts`) — errors report names only, never values.
- **Ambiguous payout broadcast maps to SUBMITTED, never blind-resend.** A transport error/timeout during broadcast leaves the payout SUBMITTED (reserved, with reason) — the persisted hash stays, recovery inspects it onchain (confirmed → finalize; reverted → FAILED; unknown → kept reserved).
- **Logger stages cover the full PRD §23 list** (payment_verified → response_delivered, plus extras: settlement_pending/persist_failed, payout_skipped, settlement_disabled, upstream_skipped_body_too_large, rate_limit_degraded).
- **Replay/429 shape.** Signed-attempt replay remains 409 `PAYMENT_REPLAY` (durable precheck before /verify); rate limiting returns 429 `RATE_LIMITED` + `retry-after` — a 429 is a deliberate, retryable signal for over-limit signed attempts, not an outage (documented trade-off vs a 502).

## M11.1 decisions (upstream auth)

- **Upstream auth is configurable per route**: `BEARER` or `API_KEY` with any header name (e.g. `CMC_API_KEY` or `x-api-key`). The route auth edit UI has explicit Preserve / Replace / Clear semantics — editing a route never silently mutates or drops the encrypted credential.
- **Live upstream verification is operator-env-only.** `CMC_API_KEY=<key> npm run verify:upstream:live` drives the REAL production chain (runtime SSRF pin → decrypt → creator-header injection → pinned transport) against the real CoinMarketCap upstream. The key is read from the environment only and must never be committed, logged, or written to any file; the script prints only the header name and a sha256 fingerprint/length.
- **CoinMarketCap gotcha (M11.1 live run):** CMC's official credential header is `X-CMC_PRO_API_KEY`, not `CMC_API_KEY` — the key returned 401 under the wrong header name and 200 under the official one (Metron's injection was correct in both cases; the header name is a creator-side configuration choice). The live script defaults to the official header and accepts a `CMC_AUTH_HEADER` override.

## M10 decisions (automatic exact-earning payout handoff)

- The payout handoff is exact-earning: `reserveEarningForPayout` locks the SINGLE EARNING row of the receipt (FOR UPDATE, type=EARNING, developer-scoped) and inserts the payout. Any existing payout row for that earning — ANY status — makes the reserve return null and the handoff reports `already_handled`; at most one payout per earning, ever, no re-broadcast.
- A FAILED payout WITHOUT a tx hash releases its reservation (accounting shows the amount available again), but the gateway will NOT auto-rebroadcast — the existing payout row blocks re-reserve. Recovery of such earnings is OPERATIONAL (reconcile/repair tooling), never automatic.
- The payout outcome NEVER affects caller delivery: the settled branch absorbs every outcome (skipped, attempted, or a thrown handoff) and delivers the identical `PAYMENT-RESPONSE` + protected body. Only safe fields are logged; tx hashes are logged as a presence boolean, never in full.
- The handoff gate is checked at the call site (route.ts, `isPayoutsEnabled()`); when disabled it short-circuits with zero dependency calls (`skipped/disabled`).
- Settled responses carry the `X-METRON-RECEIPT-ID` header so callers can correlate a receipt without a dashboard session.
- Manual withdraw is gone: POST /api/payouts was removed (GET remains as read-only payout history); the earnings overview has no Withdraw UI. Payouts happen only via the gateway handoff or operational recovery.
- `tools/m10-external-client.mjs` (`npm run m10:client`) is isolated from Metron internals — no lib/, app/, DB, or Redis imports; only public @x402 packages + viem. Configured via `M10_BUYER_PRIVATE_KEY` (never printed) and `M10_METRON_URL`.

## M10.1 decisions (response integrity)

- Caller `accept-encoding` is removed from the forwarded-header allowlist and the gateway pins `accept-encoding: identity` upstream, so upstream compression is never negotiated for callers. Compressed replies are the gateway's problem, not the caller's.
- A compressed upstream 2xx body (gzip/x-gzip/deflate/br) is decoded server-side with `maxOutputLength` capping the DECODED size at the same 5 MiB limit as the raw capture, plus a defensive post-check — compression bombs are bounded. Decode failure (unsupported/malformed/too large) → `UPSTREAM_RESPONSE_DECODE_FAILED`, body never delivered (fail closed).
- An upstream that sends compressed bytes WITHOUT a `content-encoding` header is undetectable at the HTTP layer — the gateway has no way to know the bytes are compressed (trust boundary; out of scope by design).
- After decode, `content-encoding` is removed and `content-length` is replaced with the decoded length so the caller sees an encoding-free, truthful body.
- The delivered header set is exactly `DELIVERABLE_HEADERS` + `PAYMENT-RESPONSE` + `X-METRON-RECEIPT-ID`; hop-by-hop (content-encoding, content-length, transfer-encoding, connection) and cookie (set-cookie) headers never reach callers (regression-tested in `lib/gateway/delivery.test.ts`).
- The receipt wallet row is labeled "Caller" (the buyer), never "Creator" — enforced by static guard tests over the receipt surfaces (metron-receipt, transaction detail/recent lists, proxy state view, dashboard anatomy copy).

## Discovered bugs & lessons

1. **RainbowKit v2.2.11 "Preparing message..." stall** — the SIWE adapter's `getNonce` returned `""`; RainbowKit requires a TRUTHY nonce before it will call `createMessage` (its SignIn gate is `if (!address || !chainId || !nonce) return`). Fix: `getNonce` returns a constant `"metron"` gate value; the real server-owned nonce lives inside the challenge message. Also invalidate the auth query on verify success.

2. **Auth Sign Out vs wallet Disconnect** — originally separate actions. Primary Sign Out now destroys the server session, disconnects the wagmi/RainbowKit wallet, and redirects to `/`; the low-level Disconnect control is secondary.

3. **Settled-payment replay reached /verify** — after a payment settled, its consumed EIP-3009 authorization failed facilitator verification with a confusing 502. Fix: the deterministic `paymentIdentifier` is derived BEFORE /verify and checked against durable Postgres; any existing receipt (any state) → `409 PAYMENT_REPLAY` without a facilitator call.

4. **Settlement persistence crash gap** — `/settle` succeeded onchain but a crash before DB persistence left a VERIFIED receipt with no way to discover the settlement. Fix: receipts are durably marked `SETTLEMENT_PENDING` (with non-secret attempt metadata incl. payer/nonce/validBefore) BEFORE the `/settle` call; recovery reconciles.

5. **Recovery over-trusted AuthorizationUsed alone** — payer+nonce consumption doesn't prove Metron received USDC. Fix: same-transaction binding to the canonical-USDC Transfer (to = registered wallet, exact amount) plus calldata match; conflicts stay pending.

6. **First payout falsely marked FAILED** — the live receipt poller (`waitForReceipt`) returned `txTo: null`, so the evidence validator rejected every success as `wrong_token`. Fix: financial confirmation is keyed to the canonical-USDC Transfer event (self-authoritative); `txTo` is corroboration only; recovery also reconciles FAILED rows that carry a tx hash. The real payout was repaired to CONFIRMED without resending.

7. **Upstash Redis auto-parses JSON** — `redis.get` returns already-parsed objects for JSON values; session records must accept both string and object forms (session.ts regression test covers this).

8. **viem strict address checks** — the PRD's USDC literal `0xcEBA…` is not EIP-55-checksummed; viem's `isAddress` rejects it and `getAddress` normalizes it to `0xcebA9300…`. Always normalize with `getAddress`; tests use the checksummed form.

9. **Next.js env inlining** — client code must use static `process.env.NEXT_PUBLIC_*` access; dynamic access is not inlined and silently evaluates to `""` in the browser (WalletConnect project id fix).

10. **Celo USDC uses the split-signature EIP-3009 selector** — `transferWithAuthorization(…,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)` = `0xe3ee160e` (not the single-signature `0xeb46e437`); recovery decodes via the official `@x402/evm` `eip3009ABI`.

11. **BigInt literals** — `tsconfig` targets ES2017; `0n`/`10n` literals fail typecheck. Use `BigInt(0)` etc.

12. **Payout failure ≠ retryable by the gateway** — the exact-earning reserve blocks a second payout row for an already-attempted earning, so a FAILED payout (even one without a tx hash, where accounting releases the reservation) is never auto-rebroadcast by the gateway. Recover operationally — do not replay the caller's payment to force a retry.

13. **Compressed upstream bodies silently corrupt delivered responses** — a caller forced to `identity` who receives raw gzip bytes with `content-encoding` stripped would get a body that lies (bytes ≠ resource, with no header left to decode them). Fix: the gateway never negotiates compression (`accept-encoding: identity` pinned; caller header removed from the allowlist), decodes any compressed 2xx reply server-side with a hard cap on the DECODED size (5 MiB), and fail-closes with `UPSTREAM_RESPONSE_DECODE_FAILED` when it cannot decode truthfully — undecodable/corrupt bytes are never delivered.
