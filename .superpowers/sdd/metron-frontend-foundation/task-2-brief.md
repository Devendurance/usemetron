# Task 2 — Public landing page

## Goal

Implement the complete `/` landing page from the approved Metron concept and `DESIGN.md`, using the shared foundation from Task 1.

## Ownership

- You may edit `app/page.tsx` and create files under `components/marketing/` only.
- You may import from `components/ui/`, `components/metron/`, and `public/metron/` but do not edit those shared files.
- Do not edit dashboard or proxy routes.

## Requirements

- Read `AGENTS.md`, `DESIGN.md`, and `docs/brand-messaging.md` before editing.
- Match the approved concept at `C:\Users\USER\.codex\generated_images\019fe1ba-a60d-7931-b27e-d000e2be45cb\exec-95b856ac-cc1e-4482-911f-ef3bb4a9c7ba.png`, while `DESIGN.md`, brand messaging, and the no-mock-data rule govern any conflict.
- Use `public/metron/paid-route-hero.png` via `next/image` as the main hero illustration. Do not rasterize UI text or controls.
- Header: segmented desktop header with exact labels `METRON`, `FOR CREATORS`, `FOR AGENTS`, `HOW IT WORKS`, `VIEW DEMO`, `PUBLISH AN API`; responsive accessible mobile Sheet navigation.
- Homepage order: hero; Call Line; creator explanation; agent explanation; large Metron Receipt anatomy; Celo/x402 proof; three-step endpoint publishing flow; final CTA.
- Exact hero H1: `Turn API calls into paid work.`
- Exact supporting copy: `Publish an endpoint, set a price, and let callers or agents pay per request on Celo.`
- Primary CTA: `Publish an API` linking to `/dashboard/endpoints/new`.
- Secondary CTA: `See a paid call` linking/scrolling to the demo section.
- Audience copy must come from `docs/brand-messaging.md`; avoid invented product claims.
- Use the shared Call Line and Receipt anatomy. The landing receipt may explain field structure but must not pretend to be live data; show em-dashes for route-specific values and only fixed product facts such as Celo.
- Use flat coral/lime cards, cream field, shadowless web core, Blueprint Blue route evidence, and one restrained soft shadow only for the illustrated hero receipt/media frame.
- Add purposeful CSS/local-state micro-interactions only: anchor navigation, mobile menu, copy feedback or receipt reveal if supported by shared primitives. Respect reduced motion.
- No fake logos, testimonials, stats, transaction hashes, wallet addresses, endpoints, charts, pricing plans, gradients, glows, crypto coins, robots, or generic card grids.
- Responsive at 375, 768, 1024, and 1440 widths; no overflow; 44px touch targets.

## Verification

- Run `npm run lint` and `npx tsc --noEmit --incremental false`.
- Start the app if practical and verify `/` renders without console/runtime errors.

## Report

Write `.superpowers/sdd/metron-frontend-foundation/task-2-report.md` with status, files changed, commands and exit codes, self-review, and concerns.

