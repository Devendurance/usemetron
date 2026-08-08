# Task 1B — Metron design system and shared components

## Goal

Apply the Metron visual system and create shared code-native primitives on top of the existing shadcn Base UI setup.

## Ownership

- Edit `app/globals.css`, `app/layout.tsx`, `components/ui/*` only when needed to define semantic variants or correct the known EmptyDescription semantic type issue, `components/metron/*`, and `lib/*` shared design helpers.
- Do not edit `app/page.tsx` or create route-specific landing/dashboard/proxy files.

## Requirements

- Read `AGENTS.md`, `DESIGN.md`, and `docs/brand-messaging.md`.
- Preserve shadcn Base UI structure and APIs. Correct `components/ui/empty.tsx` so `EmptyDescription` prop typing matches its rendered element or the rendered element matches the existing paragraph prop API.
- Replace generated neutral/dark theme values in `app/globals.css` with the exact Metron light-only token system from `DESIGN.md`: cream #FAF7EA, ink #141414, lime #DCE22B, lime-hover #E5EB55, coral #F4CBB9, white #FFFFFF, muted ink #5C584D, blueprint #2F80ED, route sky #5CACE0, transaction gold #E3A83A, hero chartreuse #D6F24A, settlement green #3B6B55, review bronze #A46E2A, failure red #B64A42, border rgba(20,20,20,.15), plus mobile yellow/magenta/purple/surface tokens. Remove the generated `.dark` palette and do not add gradients or glows.
- Keep shadcn semantic variables meaningful and expose Tailwind theme tokens for Metron colors, radius values (pill 9999px, card 28px, control 14px, mobile-card 18px), display/body/metadata fonts, focus ring, and spacing helpers.
- Update root metadata to title `Metron — Turn API calls into paid work` and description `Publish an endpoint, set a price, and let callers or agents pay per request on Celo.` Use Poppins via `next/font/google` for display and Inter via `next/font/google` as the Satoshi-compatible interface/body fallback. Use font CSS variables.
- Create focused shared components under `components/metron/`: BrandMark, StatusBadge with verified/review/failed/neutral variants using text+icon, CallLine with horizontal and stacked responsive modes, MetronReceipt anatomy with all values optional and em-dash defaults, EmptyState wrapper composed from shadcn Empty, CopyButton with local clipboard feedback and disabled state, and a shared max-width page container/section heading only if actually needed by all route surfaces.
- All visible UI text in shared components must come from props except stable Metron nouns/receipt field labels. No seeded metrics, addresses, hashes, endpoints, timestamps, or receipt values.
- Use Lucide icons, semantic tokens, `cn()`, keyboard focus, 44px interactive targets, and reduced motion. No `space-*` utilities. Icons inside shadcn buttons use `data-icon` and no manual size class.
- The asset at `public/metron/paid-route-hero.png` remains unchanged.

## Verification

- Run `npm run lint` and `npx tsc --noEmit --incremental false`.

## Report

Write `.superpowers/sdd/metron-frontend-foundation/task-1b-report.md` with status, files changed, commands/exit codes, self-review, and concerns. Return only the short status contract.
