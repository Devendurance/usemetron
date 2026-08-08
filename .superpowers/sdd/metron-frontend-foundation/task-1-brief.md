# Task 1 — Shared frontend foundation

## Goal

Establish the reusable Metron frontend foundation for all later route tasks. Do not implement route-specific landing or dashboard page content.

## Requirements

- Work in `C:\Users\USER\Documents\ideas\celo-agentic-hack`.
- Read `AGENTS.md`, `DESIGN.md`, and the relevant copy constraints in `docs/brand-messaging.md` before editing.
- Initialize shadcn/ui for this existing Next.js 16 + Tailwind 4 project using npm and the official shadcn registry. Use a Base UI setup compatible with the project and enable pointer cursors. Do not use an unrelated preset or overwrite user work.
- Add only the accessible primitives needed by the plan: button, input, tabs, table, sheet, switch, alert, badge, skeleton, separator, field, empty, and spinner if needed by generated components.
- Preserve and then intentionally restyle `app/globals.css` to implement the exact Metron tokens from `DESIGN.md`: cream `#FAF7EA`, ink `#141414`, lime `#DCE22B`, lime hover `#E5EB55`, coral `#F4CBB9`, white, muted ink `#5C584D`, blueprint blue `#2F80ED`, route sky `#5CACE0`, transaction gold `#E3A83A`, settlement green `#3B6B55`, review bronze `#A46E2A`, failure red `#B64A42`, web radii and spacing. No dark-mode palette, gradients, or glows.
- Update `app/layout.tsx` with Metron metadata and optimized fonts. Use `next/font/google` for Poppins display and Inter as the Satoshi-compatible body fallback. Keep metadata in a Server Component.
- Provide reusable code-native shared components under `components/metron/` for: brand mark, status badge, Call Line, Metron Receipt anatomy, empty-state wrapper, copy button with local feedback, and page/container primitives needed by the later agents.
- Use Lucide icons consistently. Interactive components must use `"use client"`; keep server/client boundaries focused.
- Copy asset already exists at `public/metron/paid-route-hero.png`; do not modify it.
- Do not add backend calls, API routes, wallet libraries, x402 libraries, mock data, fixture arrays, fake metrics, addresses, hashes, or timestamps.
- Do not edit `app/page.tsx` or create any route pages/layouts beyond the root layout.
- Follow shadcn composition rules: FieldGroup/Field forms, TabsList wrapping triggers, semantic tokens, `cn()`, icon `data-icon`, no `space-*`, no raw status colors in components.

## Verification

- Run `npm run lint` and `npx tsc --noEmit --incremental false`.
- Read every generated shadcn component you add and correct any project-specific issues.

## Report

Write `.superpowers/sdd/metron-frontend-foundation/task-1-report.md` with: status, files changed, dependencies added, exact commands and exit codes, self-review, and concerns. Return only a short status summary to the coordinator.
