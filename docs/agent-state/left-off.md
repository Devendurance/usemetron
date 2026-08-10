# Metron — Left Off (Fresh-Session Handoff)

## Current position

- **M0–M10.1 COMPLETE on `main`** (last commit `e95e6d0 "Complete external x402 economic loop and response integrity"`).
- **M11 COMPLETE in the working tree — UNCOMMITTED. Human commits manually; do not commit.**
- M11 (production hardening) is implemented and gated: rate limiting, safe logger, env fail-fast, SSRF/pin test extensions, payout wallet lock, plus `docs/production-readiness.md` (PRD §27 acceptance matrix + operator recovery + rate-limit config) and the refreshed agent-state docs.
- Next step: **post-MVP decision** (coordinator to supply — e.g. deployment to a real host, facilitator credits/paid tests, or new feature milestones). Nothing is defined in-repo yet.

## Current financial state (real Celo Mainnet) — unchanged by M11 (no money moved)

```
earned      = 0.002 USDC (2000 micro)
paid        = 0.002 USDC (2000 micro)
outstanding = 0
available   = 0
reserved    = 0 (no PENDING/SUBMITTED/FAILED-with-hash payout rows)
```

- No money moved during the M11 run (both switches false; M10 evidence re-verified read-only via a scratch script, deleted after).
- M10 manual-E2E settlement tx: `0x821dd6c12157f03aae18948c89a4c7046cd609eb136d52ddad64c57195b54a3a` — receipt `SETTLED`, upstream 200, 1000 micro-USDC.
- M10 manual-E2E payout tx: `0xa89d119600bfe366aeff364926546c626d6d04cbf08f347f4c13a4290b00a269` — payout `CONFIRMED`, 1000 micro-USDC, attribution `celo_91fed90b97fc` verified.
- M9 settlement tx: `0x8acaddf3c939eea0d104bb4ad3ab1ea2debc7698924dc77a540951d0cbb51b88` — receipt `SETTLED`, upstream 200.
- M9 payout tx: `0xdddacd2f2cdb50f56d1e1308e51607a3e52dc785d38a3295b70e3105256579e7` — payout `CONFIRMED`, attribution verified.
- Buyer: `0xEb2712aCB5650bbc6fFa4acd73BD85779796BCDC`; Creator: `0xC44685b7c78cC9C9b7f6623d7697Ac30ab0D6Dc9`; Treasury/payTo: `0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa`.
- Switches: `X402_SETTLEMENT_ENABLED` = false, `PAYOUTS_ENABLED` = false. `RATE_LIMIT_TRUST_PROXY_HEADER` unset/off (set true only behind a trusted proxy).

## Next: post-MVP decision (coordinator supplies direction)

M11 is complete: acceptance matrix documented, all gates green (see quality state), real M10 evidence re-confirmed read-only (no replay, no money movement). Remaining genuine deployment items are documented in `docs/production-readiness.md` §2 (trusted-proxy flag, HTTPS/Secure cookies, Upstash TTL note, facilitator credits, settlement-wallet gas, deliberate switch flips). Rewrite this section when the next milestone prompt arrives.

## Current repository state

M11 worktree (uncommitted, human commits): rate limiting — `lib/ratelimit/{policy,limiter,client-ip,redis-limiter}.ts` (+ tests), wired into `app/api/auth/challenge/route.ts` and `app/p/[...proxy]/route.ts` (429 + `retry-after`, fail-open degraded); safe logger — `lib/observability/{logger,redact}.ts` (+ tests); env fail-fast — `lib/env.ts` (presence/format), `lib/env/canonical.ts` (+ tests); SSRF extensions — `lib/ssrf/validate.test.ts` (CGNAT/benchmarking/multicast/reserved/IPv6 ranges + DNS tests); wallet lock — `lib/payouts/wallet-lock.ts` (+ test), `lib/redis/locks.ts`; docs — `docs/production-readiness.md` (new), `docs/agent-state/{project-state,memory,left-off}.md` (updated).

- `git diff --check` is clean.
- Do NOT commit or push without being asked.

## Commands

```bash
npm test                 # vitest (576 tests / 55 files)
npm run typecheck        # tsc --noEmit
npm run lint             # eslint (0 errors; 1 pre-existing warning in broadcast.test.ts)
npm run build            # next build (22 routes)
npm run verify:m9        # real-dashboard evidence verification (read-only)
npm run verify:foundation
npm run reconcile:ledger # ledger backfill + pending settlement resolution + payout recovery (CLI-only)
npm run m10:client       # external client (needs M10_BUYER_PRIVATE_KEY + M10_METRON_URL)
npm run db:generate      # drizzle migration generation (only if schema changes)
npm run db:migrate       # apply migrations (never drizzle push)
```

Manual test harness: `scripts/m4-buyer-test.mjs` (x402 buyer flow used for funded-buyer manual tests).

## Warning

Never enable `X402_SETTLEMENT_ENABLED` or `PAYOUTS_ENABLED` casually. They exist only for deliberate manual mainnet tests and must be returned to `false` immediately afterward. Set `RATE_LIMIT_TRUST_PROXY_HEADER=true` only when a trusted proxy strips spoofable `X-Forwarded-For` values. Never run `drizzle push`. Never use `METRON_SETTLEMENT_PRIVATE_KEY` for anything other than the server-only payout signer.
