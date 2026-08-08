# Task 3 — Dashboard shell and creator routes

## Goal

Implement the dashboard shell and all creator-facing dashboard routes with empty-state-first, locally interactive UI and zero mock data.

## Ownership

- Create/edit files under `app/dashboard/` and `components/dashboard/` only.
- Import shared components from `components/ui/` and `components/metron/` without editing them.
- Do not edit the landing page, root layout/styles, or proxy route.

## Routes

- `/dashboard`
- `/dashboard/endpoints`
- `/dashboard/endpoints/new`
- `/dashboard/endpoints/[id]`
- `/dashboard/transactions`
- `/dashboard/settings`

## Requirements

- Read `AGENTS.md`, `DESIGN.md`, `docs/brand-messaging.md`, and the dashboard concept `C:\Users\USER\.codex\generated_images\019fe1ba-a60d-7931-b27e-d000e2be45cb\exec-b186c672-361b-4f75-8e5e-4bdfc5439d1d.png`.
- Build a desktop sidebar and responsive mobile Sheet navigation with `METRON`, `OVERVIEW`, `ENDPOINTS`, `TRANSACTIONS`, `SETTINGS`, wallet connection presentation, and active-route state.
- Dashboard `/dashboard`: heading, structural stat fields using em-dashes, `Your payment route starts here.`, supporting empty-state copy, `Publish an API`, shared Call Line anatomy, receipt anatomy, and status legend.
- Endpoints list: table/list headers and filters, empty/loading/error presentation controls, create CTA, no seeded endpoint rows.
- New endpoint: client-side form for endpoint name, upstream URL, and flat per-request price. Use FieldGroup/Field, real labels, accessible validation, local submit state, and an explicit unavailable integration message. Never fabricate a powered URL or success record.
- Endpoint detail dynamic route: Next.js 16 async params. Render the route detail anatomy and SDK tabs (cURL, TypeScript, Python) with no endpoint-specific data. Show `No endpoint is connected to this route yet.` and em-dashes; copy controls must be disabled when no value exists. Do not display the URL param as account data.
- Transactions: table headers and local filters/status controls with a meaningful empty state; no fake rows, amounts, dates, hashes, or wallets.
- Settings: account/wallet and Celo attribution sections, local presentation states for disconnected/connecting/connected preview/error, no provider integration and no fabricated address. Clearly state integration is not connected.
- Use local state for tabs, filters, menu, validation, toggles, and status previews. No persistence, API fetches, time-based fake progress, or backend calls.
- Web dashboard stays in cream/white/lime/coral/blue; green/bronze/red only convey verified/review/failed states. Mobile uses the separate Console yellow/magenta/purple treatment from `DESIGN.md` without leaking it to desktop.
- Ensure keyboard access, focus visibility, semantic headings, labels, empty states, and 44px touch targets.

## Verification

- Run `npm run lint`, `npx tsc --noEmit --incremental false`, and verify every dashboard route renders.

## Report

Write `.superpowers/sdd/metron-frontend-foundation/task-3-report.md` with status, files changed, commands and exit codes, self-review, and concerns.

