# Task 4 — Frontend-only proxy/call state route

## Goal

Implement the UI-only catch-all `/p/[...proxy]` route and reusable local payment-state surface. No gateway handler or backend behavior.

## Ownership

- Create/edit files under `app/p/` and `components/proxy/` only.
- Import shared components without editing them.

## Requirements

- Read `AGENTS.md`, `DESIGN.md`, and the essential product copy in `docs/brand-messaging.md`.
- Use a Next.js 16 catch-all page with async `params`; do not create `route.ts` because it conflicts with `page.tsx` and the backend is deferred.
- Render a clear Metron call-state surface with the shared Call Line and Receipt anatomy.
- Provide local accessible state controls for: payment required, verifying, settled/forwarding, response returned, upstream failure, facilitator unavailable, invalid signature, and replayed nonce.
- Use exact approved copy where provided: `This call costs 0.005 USDC on Celo.`, `Payment is being verified.`, `Payment settled. Forwarding the request.`, `200 OK — response returned.`, `Creator paid — receipt available.`, `The upstream API did not respond. No successful response was recorded.`, and `Settlement review in progress.`
- The documented `0.005 USDC` copy is an explicitly labeled product demonstration, not account or dashboard data. Do not invent route names, wallets, transaction hashes, timestamps, or response payloads.
- Make the frontend-only boundary explicit: no wallet prompt, payment request, API fetch, persistence, or route handler. A local state selector is allowed.
- Status must be communicated by text and icon, not color alone. Use Blueprint Blue, settlement green, review bronze, and failure red semantic variants.
- Responsive and keyboard accessible; no gradients, glows, mock tables, or fake transaction evidence.

## Verification

- Run `npm run lint`, `npx tsc --noEmit --incremental false`, and verify a nested route such as `/p/demo/translate` renders.

## Report

Write `.superpowers/sdd/metron-frontend-foundation/task-4-report.md` with status, files changed, commands and exit codes, self-review, and concerns.
