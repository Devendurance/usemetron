# Metron — Left Off (Fresh-Session Handoff)

## Current position

- **M0–M8.1 COMPLETE** (all committed; `main` = `518bf6b "Creator payouts done"`, ahead of `origin/main` by 1).
- **M9 NOT STARTED.**
- Next milestone: **M9 — Real Dashboard + Transaction Evidence** (replace remaining previews with real receipts/payouts evidence; no money movement).

## Current financial state (real Celo Mainnet)

```
earned      = 0.001 USDC (1000 micro)
paid        = 0.001 USDC (1000 micro)
outstanding = 0
available   = 0
```

- Settlement switch `X402_SETTLEMENT_ENABLED` = false
- Payout switch `PAYOUTS_ENABLED` = false
- No manual financial action pending.

## Known real evidence M9 must display

- x402 settlement: `0x8acaddf3c939eea0d104bb4ad3ab1ea2debc7698924dc77a540951d0cbb51b88` — receipt `SETTLED`, tx hash persisted, `settled_at` populated, upstream 200.
- Creator payout: `0xdddacd2f2cdb50f56d1e1308e51607a3e52dc785d38a3295b70e3105256579e7` — payout `CONFIRMED`, `confirmed_at` populated, attribution verified.
- Buyer: `0xEb2712aCB5650bbc6fFa4acd73BD85779796BCDC`; Creator: `0xC44685b7c78cC9C9b7f6623d7697Ac30ab0D6Dc9`; Treasury/payTo: `0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa`.

## What M9 should accomplish (scope only — DO NOT implement in this session)

- Remove remaining dashboard mocks/previews (transactions page still uses presentation states).
- Real overview metrics from `call_receipts` / `creator_ledger_entries` / `payouts`.
- Real creator-owned receipts/transactions (list + detail) with M6 settlement evidence and M8 payout evidence.
- Refresh-persistent dashboard (server-derived data only).
- No money movement, no /verify, no /settle, no payouts.

## Next-session startup checklist

1. Read `docs/metron-PRD.md` (implementation authority).
2. Read `docs/agent-state/project-state.md`, `docs/agent-state/memory.md`, `docs/agent-state/left-off.md`.
3. Run `git status --short` and `git log --oneline -5`; note the branch is ahead of origin by 1 commit (nothing to push unless asked).
4. Inspect the relevant implementation under `lib/` (`env`, `celo`, `auth`, `db`, `endpoints`, `gateway`, `ledger`, `payouts`, `recovery`, `x402`) and `app/` before editing.
5. Confirm baseline quality if unsure: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify:foundation`, `git diff --check`.
6. Only then start the supplied M9 milestone prompt.

## Current repository state

`git status --short` → only `?? docs/agent-state/` (these three files). Everything else is committed on `main`.

- Tracked modifications: none.
- Untracked files: `docs/agent-state/` (this handoff).
- Pre-existing whitespace issue: none — `git diff --check` is clean.
- Do not silently clean or commit anything without being asked.

## Commands

```bash
npm test                 # vitest (396 tests)
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run build            # next build (16 routes)
npm run verify:foundation
npm run reconcile:ledger # ledger backfill + pending settlement resolution + payout recovery
npm run db:generate      # drizzle migration generation (only if schema changes)
npm run db:migrate       # apply migrations (never drizzle push)
```

Manual test harness: `scripts/m4-buyer-test.mjs` (x402 buyer flow used for funded-buyer manual tests).

## Warning

Never enable `X402_SETTLEMENT_ENABLED` or `PAYOUTS_ENABLED` casually. They exist only for deliberate manual mainnet tests and must be returned to `false` immediately afterward. Never run `drizzle push`. Never use `METRON_SETTLEMENT_PRIVATE_KEY` for anything other than the server-only payout signer.
