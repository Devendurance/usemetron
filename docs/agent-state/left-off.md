# Metron — Left Off (Fresh-Session Handoff)

## Current position

- **M0–M9 COMPLETE on `main`** (`4e7bdf9 "Complete real dashboard and transaction evidence"`).
- **M10 + M10.1 COMPLETE in the working tree — UNCOMMITTED. Human commits manually; do not commit.**
- M10 (automatic exact-earning payout handoff + external client) and M10.1 (response integrity: identity pin + bounded decode + fail-safe; caller label fix; client content handling; delivery regression tests) are implemented and gated. The M10 manual-E2E evidence pair is recorded below.
- Next step: **M11** (milestone prompt to be supplied by the coordinator).

## Current financial state (real Celo Mainnet) — unchanged by M10.1

```
earned      = 0.002 USDC (2000 micro)
paid        = 0.002 USDC (2000 micro)
outstanding = 0
available   = 0
```

- No money moved during the M10.1 implementation run (both switches false; evidence verified read-only).
- M9 settlement tx: `0x8acaddf3c939eea0d104bb4ad3ab1ea2debc7698924dc77a540951d0cbb51b88` — receipt `SETTLED`, upstream 200.
- M9 payout tx: `0xdddacd2f2cdb50f56d1e1308e51607a3e52dc785d38a3295b70e3105256579e7` — payout `CONFIRMED`, attribution `celo_91fed90b97fc` verified.
- M10 manual-E2E settlement tx: `0x821dd6c12157f03aae18948c89a4c7046cd609eb136d52ddad64c57195b54a3a` — receipt `SETTLED`, upstream 200, 1000 micro-USDC.
- M10 manual-E2E payout tx: `0xa89d119600bfe366aeff364926546c626d6d04cbf08f347f4c13a4290b00a269` — payout `CONFIRMED`, 1000 micro-USDC, attribution verified.
- Buyer: `0xEb2712aCB5650bbc6fFa4acd73BD85779796BCDC`; Creator: `0xC44685b7c78cC9C9b7f6623d7697Ac30ab0D6Dc9`; Treasury/payTo: `0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa`.
- Switches: `X402_SETTLEMENT_ENABLED` = false, `PAYOUTS_ENABLED` = false.

## Next: M11 (coordinator supplies the milestone prompt)

M10.1 is complete: gates green, delivery regression tests in place, real M10.1 evidence verified read-only (records above; no replay, no money movement). M11 scope is not yet defined in this repository — rewrite this section when the M11 prompt arrives.

## Current repository state

M10 + M10.1 worktree (uncommitted, human commits): M10 — `lib/payouts/handoff.ts` (+ test), `lib/payouts/instance.ts` (payoutHandoff wiring), `lib/gateway/delivery.ts` (X-METRON-RECEIPT-ID), `app/p/[...proxy]/route.ts` (handoff in settled branch), `app/api/payouts/route.ts` (POST removed; GET-only history), `components/dashboard/earnings-overview.tsx` (Withdraw UI removed), `lib/db/ledger.ts` + `lib/db/payouts.ts` (getEarningByReceipt, reserveEarningForPayout), `tools/m10-external-client.mjs` (+ test), `package.json` (`m10:client` script), plus tests `lib/gateway/settlement-service.test.ts` and `lib/x402/requirements.test.ts`. M10.1 — `lib/gateway/content-encoding.ts` (+ test), `lib/gateway/delivery.test.ts`, `lib/gateway/upstream-service.ts` (identity pin + bounded decode), `lib/gateway/headers.ts` (accept-encoding removed from allowlist), `lib/gateway/limits.ts` (`UPSTREAM_RESPONSE_DECODE_FAILED`), `components/dashboard/caller-label.test.ts` + receipt surfaces (Caller label), external client binary-body decode.

- `git diff --check` is clean.
- Do NOT commit or push without being asked.

## Commands

```bash
npm test                 # vitest (494 tests / 48 files)
npm run typecheck        # tsc --noEmit
npm run lint             # eslint (0 errors; 1 pre-existing warning in broadcast.test.ts)
npm run build            # next build (22 routes)
npm run verify:m9        # real-dashboard evidence verification (read-only)
npm run verify:foundation
npm run reconcile:ledger # ledger backfill + pending settlement resolution + payout recovery
npm run m10:client       # external client (needs M10_BUYER_PRIVATE_KEY + M10_METRON_URL)
npm run db:generate      # drizzle migration generation (only if schema changes)
npm run db:migrate       # apply migrations (never drizzle push)
```

Manual test harness: `scripts/m4-buyer-test.mjs` (x402 buyer flow used for funded-buyer manual tests).

## Warning

Never enable `X402_SETTLEMENT_ENABLED` or `PAYOUTS_ENABLED` casually. They exist only for deliberate manual mainnet tests and must be returned to `false` immediately afterward. Never run `drizzle push`. Never use `METRON_SETTLEMENT_PRIVATE_KEY` for anything other than the server-only payout signer.
