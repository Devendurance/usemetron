# Metron — Left Off (Fresh-Session Handoff)

## Current position

- **M0–M11.1 COMPLETE on `main`** (last commit `41a46fd "update readme"`).
- **V1.5A COMPLETE in the working tree — UNCOMMITTED. Human commits manually; do not commit.**
- V1.5A (OpenAPI import + Creator Test Console) is implemented and gated: parse core `lib/openapi/*`, `POST /api/openapi/parse` + `POST /api/openapi/publish`, import flow UI at `/dashboard/endpoints/import`, test console `lib/testconsole/*` + `POST /api/endpoints/test` (embedded in the publish form, import configure, and endpoint detail), three new rate-limit surfaces, and this refreshed docs set. All gates green (see quality state in `project-state.md`).
- Next step: **V1.5B** (coordinator to supply the milestone prompt). Nothing is defined in-repo yet.

## ⚠️ .env switches — CURRENT STATE IS A USER-MANAGED DEVIATION (do NOT touch .env)

- `.env` currently has `X402_SETTLEMENT_ENABLED=true`, `PAYOUTS_ENABLED=true`, `RATE_LIMIT_TRUST_PROXY_HEADER=true`.
- The REQUIRED production state is `false` / `false` / off (trusted-proxy flag on only behind a proxy that strips spoofable `X-Forwarded-For`). The TRUE state is a user-managed deviation — REMINDER to flip them back to false/off before any funded deployment or paid test. No money has moved in this state (V1.5A made no payment-path calls).

## Current financial state (real Celo Mainnet) — unchanged by V1.5A (no money moved)

```
earned      = 0.002 USDC (2000 micro)
paid        = 0.002 USDC (2000 micro)
outstanding = 0
available   = 0
reserved    = 0 (no PENDING/SUBMITTED/FAILED-with-hash payout rows)
```

- No money moved during the V1.5A run: the test console issues plain HTTPS GET/POST through the SSRF-safe upstream service only — no x402 //verify//settle/payout/ledger/blockchain activity anywhere in `lib/testconsole` or `POST /api/endpoints/test`.
- M10 manual-E2E settlement tx: `0x821dd6c12157f03aae18948c89a4c7046cd609eb136d52ddad64c57195b54a3a` — receipt `SETTLED`, upstream 200, 1000 micro-USDC.
- M10 manual-E2E payout tx: `0xa89d119600bfe366aeff364926546c626d6d04cbf08f347f4c13a4290b00a269` — payout `CONFIRMED`, 1000 micro-USDC, attribution `celo_91fed90b97fc` verified.
- M9 settlement tx: `0x8acaddf3c939eea0d104bb4ad3ab1ea2debc7698924dc77a540951d0cbb51b88` — receipt `SETTLED`, upstream 200.
- M9 payout tx: `0xdddacd2f2cdb50f56d1e1308e51607a3e52dc785d38a3295b70e3105256579e7` — payout `CONFIRMED`, attribution verified.
- Buyer: `0xEb2712aCB5650bbc6fFa4acd73BD85779796BCDC`; Creator: `0xC44685b7c78cC9C9b7f6623d7697Ac30ab0D6Dc9`; Treasury/payTo: `0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa`.

## Next: V1.5B (coordinator supplies the milestone prompt)

V1.5A is complete: docs truthful, all gates green (778 tests / 68 files, typecheck, lint, build 26 routes, verify:foundation with `/health` HTTP 200, `git diff --check` clean). Rewrite this section when the next milestone prompt arrives.

## Current repository state

V1.5A worktree (uncommitted, human commits): OpenAPI import — `lib/openapi/{parse,operations,index,client}.ts` (+ tests), `app/api/openapi/{parse,publish}/route.ts` (+ tests), import UI `app/dashboard/endpoints/import/page.tsx` + `components/dashboard/openapi/*`; test console — `lib/testconsole/{core,client,index}.ts` (+ tests), `app/api/endpoints/test/route.ts` (+ tests), shared `components/dashboard/upstream-test-console.tsx` (+ test) embedded in `components/dashboard/publish-form.tsx` (draft), `components/dashboard/openapi/import-configure.tsx` (draft), `components/dashboard/endpoint-detail.tsx` (existing); rate limits — `lib/ratelimit/policy.ts` (+ test) now six surfaces (added `openapiParse` 10/60, `openapiPublish` 10/60, `endpointTest` 20/60); docs — `docs/production-readiness.md` (rate-limit table + V1.5A notes), `docs/agent-state/{project-state,memory,left-off}.md` (updated). No schema changes, no migration, no payment-architecture changes.

- `git diff --check` is clean.
- Do NOT commit or push without being asked.

## Commands

```bash
npm test                 # vitest (778 tests / 68 files)
npm run typecheck        # tsc --noEmit
npm run lint             # eslint (0 errors; 1 pre-existing warning in broadcast.test.ts)
npm run build            # next build (26 routes)
npm run verify:m9        # real-dashboard evidence verification (read-only)
npm run verify:foundation
npm run reconcile:ledger # ledger backfill + pending settlement resolution + payout recovery (CLI-only)
npm run m10:client       # external client (needs M10_BUYER_PRIVATE_KEY + M10_METRON_URL)
npm run db:generate      # drizzle migration generation (only if schema changes)
npm run db:migrate       # apply migrations (never drizzle push)
```

Manual test harness: `scripts/m4-buyer-test.mjs` (x402 buyer flow used for funded-buyer manual tests).

## Warning

Never enable `X402_SETTLEMENT_ENABLED` or `PAYOUTS_ENABLED` casually. They exist only for deliberate manual mainnet tests and must be returned to `false` immediately afterward — **and note the .env is CURRENTLY TRUE (user-managed deviation); flip back to false/off before any funded deployment**. Set `RATE_LIMIT_TRUST_PROXY_HEADER=true` only when a trusted proxy strips spoofable `X-Forwarded-For` values. Never run `drizzle push`. Never use `METRON_SETTLEMENT_PRIVATE_KEY` for anything other than the server-only payout signer.
