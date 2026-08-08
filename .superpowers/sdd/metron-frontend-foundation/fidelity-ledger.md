# Metron visual fidelity ledger

Compared on 2026-08-08 against the approved landing and dashboard concepts using final production screenshots at 1440px and 390px.

| Comparison point | Accepted concept | Final implementation | Assessment |
| --- | --- | --- | --- |
| Public navigation | Full-width segmented cream bar with black pill CTA | Same segmented structure, labels, hard borders, and black CTA; accessible Sheet below the mobile breakpoint | Matched |
| Hero composition | Large left headline, Paid Route diorama, receipt-like artifact | Left code-native headline and CTA group paired with the text-free Paid Route art; receipt anatomy moves to its own dark section | Matched intent; receipt moved deliberately to avoid live-looking hero evidence |
| Palette and depth | Cream canvas, lime/coral/blue blocks, hard outlines, little elevation | Same governed palette, flat desktop cards, hard mobile shadows, no gradients or glows | Matched |
| Call Line | Caller → Route → Price → Settled → Response | Same ordered stages and icon language; horizontal from exactly 600px and vertically connected below | Matched |
| Receipt treatment | Prominent receipt/evidence anatomy | Code-native `MetronReceipt` with em-dash placeholders, Celo context, and explicit illustrative/unavailable language | Matched, with stronger no-mock-data guardrail |
| Dashboard shell | Left navigation, empty overview hero, Call Line, receipt/status anatomy | Left navigation and empty-first overview with stat placeholders, Call Line, receipt anatomy, and status legend | Matched; final surface is more information-dense below the fold |
| Mobile Console | Separate yellow/magenta/purple collection-card system | Separate below-600px Console with yellow field, magenta/purple tabs, hard black outlines/shadows, stacked Call Line, and fixed Publish action | Matched |
| Responsive behavior | Simplified one-column mobile layout | One-column landing and dashboard, 44px controls, closed-on-navigation Sheets, safe-area CTA clearance, and no horizontal overflow | Matched |

## Above-the-fold copy diff

- Concept headline: `Turn API calls into paid work.`
- Final headline: `Turn API calls into paid work.`
- Concept support line: `Zero-code pay-per-request infrastructure for APIs and AI agents.`
- Final support line: `Publish an endpoint, set a price, and let callers or agents pay per request on Celo.`
- The support-line change is deliberate: `docs/brand-messaging.md` is the canonical copy source named by the approved plan.
- Primary CTA remains `Publish an API`. The secondary hero CTA follows the accepted concept (`See a paid call`), while canonical `Run a paid call` appears in the agent section.

## Final screenshots

- `screenshots/landing-desktop.png`
- `screenshots/landing-mobile.png`
- `screenshots/dashboard-desktop.png`
- `screenshots/dashboard-mobile.png`

