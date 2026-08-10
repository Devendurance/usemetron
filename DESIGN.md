---
version: alpha
name: Metron
description: "The Paid Route — a warm, illustrated payment route that makes every API transaction clear and inspectable."
colors:
  primary: "#141414"
  background: "#FAF7EA"
  surface: "#FFFFFF"
  lime: "#DCE22B"
  lime-hover: "#E5EB55"
  coral: "#F4CBB9"
  muted-ink: "#5C584D"
  sky-blue: "#5CACE0"
  cloud-white: "#FFFFFF"
  checkerboard-gold: "#E3A83A"
  blueprint-blue: "#2F80ED"
  hero-chartreuse: "#D6F24A"
  mobile-yellow: "#FFC629"
  mobile-magenta: "#F2367E"
  mobile-purple: "#7C5CFA"
  mobile-surface: "#FAF6EF"
  folder-gray: "#B7B7B0"
  folder-green: "#4FBF5E"
  folder-tan: "#E3A83A"
  folder-lime: "#B6D94C"
  settlement-green: "#3B6B55"
  review-bronze: "#A46E2A"
  failure-red: "#B64A42"
  border: "rgba(20,20,20,0.15)"
typography:
  display:
    fontFamily: "Poppins, General Sans, Satoshi, sans-serif"
    fontSize: 3rem
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  heading:
    fontFamily: "Poppins, General Sans, Satoshi, sans-serif"
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Satoshi, Inter, Arial, sans-serif"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  nav:
    fontFamily: "Satoshi, Inter, Arial, sans-serif"
    fontSize: 0.875rem
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.04em"
  metadata:
    fontFamily: "Satoshi, Inter, Arial, sans-serif"
    fontSize: 0.8125rem
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0.04em"
rounded:
  pill: 9999px
  card: 28px
  control: 14px
  mobile-card: 18px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  hero: 96px
components:
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: 14px
    height: 48px
  button-primary-hover:
    backgroundColor: "{colors.lime-hover}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: 14px
    height: 48px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: 14px
    height: 48px
  card-coral:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.card}"
    padding: 32px
  card-lime:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.primary}"
    rounded: "{rounded.card}"
    padding: 32px
  receipt-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.card}"
    padding: 32px
---

## Overview

> **Implementation boundary:** This is a visual specification. Amounts, statuses, calls, wallets, transaction hashes, and receipts shown below are illustrative composition copy only. Runtime UI must display persisted real records or explicit unavailable states; this document does not authorize mock activity.

Metron is intended to be a payment layer for callable APIs. A developer publishes an endpoint, a caller or AI agent authorises one request, the API executes, and the creator can inspect a settlement record on Celo after the real integration is implemented.

The visual territory is **The Paid Route**:

> **A machine request travels through a clear, playful payment route and becomes a useful response.**

This system preserves the supplied composite reference’s strongest foundations:

- warm cream background;
- Poppins display typography;
- Satoshi interface and body typography;
- pill-shaped web controls;
- flat coral/lime cards;
- generous whitespace;
- segmented navigation;
- 4px spacing rhythm;
- 1280px web container;
- shadowless web core;
- surreal illustrated hero register;
- separate, bolder mobile register.

The reference’s objects are not copied literally. They are re-authored around Metron’s product truth:

```text
CALLER → ROUTE → PRICE → SETTLED → RESPONSE
```

The Aikido-style diorama becomes a transaction scene. The Connect Teams-style flat cards become creator, agent and settlement explanations. The Link Saver-style mobile world becomes a compact Metron Console for routes, calls and receipts.

## Colors

### Web-wide palette

| Role | Name | HEX | Use |
|---|---|---:|---|
| Main background | **Receipt Field** | `#FAF7EA` | Global web background |
| Primary ink | **Receipt Ink** | `#141414` | Text, line art, labels and navigation |
| Primary action | **Metron Lime** | `#DCE22B` | Publish, continue and confirm actions |
| Secondary card | **Receipt Coral** | `#F4CBB9` | Human explanation and creator education |
| Clean surface | **Clear Paper** | `#FFFFFF` | Inputs, secondary buttons and receipt panels |
| Supporting copy | **Muted Ink** | `#5C584D` | Body descriptions and helper text |

### Hero palette

| Role | Name | HEX | Use |
|---|---|---:|---|
| Hero atmosphere | **Route Sky** | `#5CACE0` | Hero backdrop only |
| Illustrated cloud | **Cloud White** | `#FFFFFF` | Black-outlined cloud shapes |
| Route floor | **Transaction Gold** | `#E3A83A` | Checkerboard floor beneath the hero route |
| Payment evidence | **Blueprint Blue** | `#2F80ED` | Call Line and outline treatment on the second headline line |
| Hero action | **Route Chartreuse** | `#D6F24A` | Hero CTA only |

### Mobile palette

The mobile register remains intentionally separate from the web palette:

| Role | Name | HEX | Use |
|---|---|---:|---|
| Mobile field | **Console Yellow** | `#FFC629` | Mobile application backdrop and add action |
| Mobile accent | **Console Magenta** | `#F2367E` | Pending/call accent and folder tabs |
| Mobile route | **Console Purple** | `#7C5CFA` | Route/category accent |
| Mobile surface | **Console Paper** | `#FAF6EF` | Phone screen and receipt cards |
| Folder neutral | **Folder Gray** | `#B7B7B0` | Route folder tab |
| Folder verified | **Folder Green** | `#4FBF5E` | Settled/verified folder tab |
| Folder archive | **Folder Tan** | `#E3A83A` | Receipt archive tab |
| Folder action | **Folder Lime** | `#B6D94C` | Active collection tab |

### State colours

- **Settlement Green `#3B6B55`** means the payment or response has been verified.
- **Review Bronze `#A46E2A`** means a condition requires inspection; it does not mean success.
- **Failure Red `#B64A42`** means the payment, upstream request or response failed.

### Colour governance

- Lime means **take the next action**.
- Blueprint Blue means **payment route or on-chain evidence**.
- Coral means **understand the product**.
- Green means **verified**, never generic positivity.
- The Hero and Mobile palettes never leak into ordinary web cards.
- Mobile Yellow, Magenta and Purple never appear on the web core.
- No gradients, glows, crypto-neon surfaces, floating coins or multicolour provider-logo walls.

## Typography

Retain the supplied type direction as the identity bridge across all contexts:

| Role | Typeface | Use |
|---|---|---|
| Display | **Poppins** | Hero, product statements, large amount and major status |
| Interface/body | **Satoshi** | Navigation, forms, route details, buttons and explanations |
| Metadata | **Satoshi** with tabular numerals | Price, route ID, timestamps, status and transaction fragments |

### Hierarchy

| Role | Font | Desktop | Mobile | Notes |
|---|---|---:|---:|---|
| Hero display | Poppins | 40px | 32px | Maximum 2–3 lines |
| Web display | Poppins | 48px | 32px | Section headlines |
| Result/status | Poppins | 40px | 30px | `0.005 USDC`, `200 OK`, `SETTLED` |
| Heading 3 | Poppins | 20px | 18px | Card titles and route names |
| Body | Satoshi | 16px | 16px | Minimum readable body size |
| Nav/button | Satoshi | 14px | 14px | 700; uppercase/tracked in header only |
| Caption | Satoshi | 13px | 12px | Helper copy and request metadata |

The typography must remain friendly enough for indie developers while keeping prices, statuses and transaction evidence unambiguous.

## Visual direction

### The Paid Route

Metron turns an invisible machine transaction into a visual route that anyone can understand:

```text
CALLER → ROUTE → PRICE → SETTLED → RESPONSE
```

The playful illustration is not decoration added after the product is designed. It is a way of making a machine-to-machine payment legible.

### Core visual asset: The Call Line

The Call Line appears as:

- a drawn route through the hero;
- a horizontal line inside web cards;
- a vertical sequence on mobile;
- a divider inside the Metron Receipt;
- the explanation structure in the hackathon demo.

It is a transaction explanation device—not a generic network diagram.

### Core artefact: The Metron Receipt

```text
METRON CALL / 004821

ROUTE       / translate.v1
PRICE       / 0.005 USDC
NETWORK     / CELO
STATUS      / SETTLED
RESPONSE    / 200 OK
CREATOR     / 0x7A…91C
TX          / 0x84…E10
```

The receipt must appear in different registers:

- as a large illustrated card in the hero;
- as a flat white technical card in the web UI;
- as a hard-bordered collection card in the mobile Console;
- as a compact proof panel in the demo deck.

### Hero: The Call in Motion

Retain the source’s surreal hero composition, but replace its generic props with a Metron transaction scene:

- Route Sky backdrop;
- Cloud White outlined cloud forms;
- Transaction Gold checkerboard floor;
- one large white receipt panel;
- a Blueprint Blue Call Line connecting the stages;
- small Ink labels for caller, route, price, settlement and response;
- one hero-only pointer flourish anchored to `Publish an API`.

Possible object translations:

| Composite object role | Metron interpretation |
|---|---|
| Floating cube | API route block: `/translate.v1` |
| Branching organic prop | One endpoint serving multiple callers |
| Carton/package | A Metron Receipt being delivered |
| Browser card | Payment-required response panel |
| Cursor graphic | Pointer for `Publish an API` |

Every illustrated object must support the paid-call story. No random props merely because they look charming.

### Web core: flat transaction cards

Retain the reference’s two-tone flat card system:

#### Creator card

```text
PUBLISH YOUR API

Paste an endpoint.
Set a price.
Get a powered route.

[ PUBLISH AN API ]
```

#### Agent card

```text
PAY FOR THE CALL YOU NEED

No card checkout.
No subscription.
One authorised request.

[ VIEW PAYMENT TERMS ]
```

#### Settlement card

```text
CALL SETTLED

0.005 USDC
CELO
200 OK
```

#### Receipt card

```text
YOUR API EARNED

42 calls
0.21 USDC settled
View receipt history →
```

### Mobile: Metron Console

The mobile system keeps its own candy-coloured, hard-shadowed register. It is not a responsive miniature of the web hero.

The content changes from saved links to:

- `ROUTES`;
- `RECEIPTS`;
- `PENDING`;
- `FAILED`;
- `EARNINGS`.

Example mobile home:

```text
METRON

TODAY’S CALLS
42 SETTLED
3 PENDING
1 FAILED

[ + PUBLISH ]
```

The mobile register is denser and more operational, but it must use the same Metron nouns and Call Receipt asset.

## Layout

Retain the composite system’s structural mechanics:

- web max width: `1280px`;
- desktop side margins: `32px–48px`;
- 4px base unit;
- 96px hero breathing room;
- 48px–64px section separation;
- two-column hero split;
- two-column web card row;
- one-column mobile stack;
- 44px minimum touch targets;
- 8px minimum spacing between targets.

### Navigation

Keep the segmented cell-divided header, but use Metron content:

```text
METRON | FOR CREATORS | FOR AGENTS | HOW IT WORKS | VIEW DEMO | PUBLISH AN API
```

The primary CTA is the right-most cell. Vertical rules appear in the header only.

### Homepage sequence

1. Hero: **Turn API calls into paid work.**
2. Call Line: caller → route → price → settled → response.
3. Creator explanation card.
4. Agent explanation card.
5. Large Metron Receipt.
6. Celo/x402 proof.
7. Three-step endpoint publishing flow.
8. Final CTA: **Publish your first API.**

## Elevation & Depth

### Web core

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow | Web buttons, cards, Call Line and navigation |
| Illustrated depth | One soft restrained shadow | Floating hero receipt only |
| Focus ring | `0 0 0 3px rgba(47,128,237,.22)` | Keyboard focus and payment-required state |

### Mobile

| Level | Treatment | Use |
|---|---|---|
| Hard base | `4px 4px 0 #141414` | Icon buttons, inputs and add button |
| Hard elevated | `6px 6px 0 #141414` | Mobile receipt/collection cards |
| Hard signature | `10px–14px` offset | Phone frame or device mockup only |

The web core never receives mobile hard shadows. The mobile system never receives web flat-card treatment by accident.

## Shapes and components

### Web primary button

Retain the source’s full pill:

- background: Metron Lime `#DCE22B`;
- text: Receipt Ink `#141414`;
- padding: `14px 28px`;
- border radius: `9999px`;
- border: `2px solid #141414`;
- height: `48px`;
- no shadow;
- hover: lightens to `#E5EB55`.

Labels: `Publish an API`, `View payment terms`, `See the receipt`.

### Web secondary button

- background: White;
- text: Ink;
- 2px Ink border;
- full pill;
- no shadow;
- hover shifts toward Cream.

### Flat web content card

- Coral or Lime fill;
- 28px radius;
- 32px padding;
- no border;
- no shadow;
- Poppins title;
- Satoshi body;
- one black line-art transaction icon;
- one underlined action link.

### Payment requirement panel

```text
THIS CALL COSTS 0.005 USDC
NETWORK: CELO
UPSTREAM: translate.v1
FAILURE RULE: NO SETTLEMENT IF UPSTREAM WORK FAILS BEFORE SETTLEMENT
```

Use Blueprint Blue for the route indicator, not as a full-screen background.

### Receipt card

Use a White or Cream card with a 28px radius. Required fields:

- route;
- amount and asset;
- network;
- payment status;
- response status;
- creator/transaction evidence.

### Mobile collection card

Retain the source mobile mechanics:

- `#FAF6EF` surface;
- 2.5px Ink border;
- 18px radius;
- 20px padding;
- 6px hard offset shadow;
- folder tab peeking above the card;
- coloured icon badge;
- optional `NEW` pill.

Metron collections use `ROUTES`, `RECEIPTS`, `PENDING`, `FAILED` and `EARNINGS`.

## Do's and Don'ts

### Do

- Keep the reference’s cream, Poppins/Satoshi, pill buttons, flat Coral/Lime cards, segmented header, hero diorama and separate mobile register.
- Re-author every visual object around the paid-call sequence.
- Use the Call Line as the recognisable recurring asset.
- Use the Metron Receipt to make payment evidence visible.
- Let the hero be playful while keeping the product states precise.
- Show price, asset, network, settlement state and response status at the relevant moment.
- Use Celo as evidenced infrastructure, not decorative blockchain wallpaper.

### Don't

- Do not copy the source’s clouds, checkerboard, floating props or folder motifs without giving them Metron meaning.
- Do not use generic network meshes, robots, coin piles, exchange charts or glowing AI effects.
- Do not hide price, asset or network behind a wallet prompt.
- Do not import the mobile palette into the web core.
- Do not import hard mobile shadows into web cards.
- Do not make the hero a disconnected illustration that the actual product cannot reproduce.
- Do not use “instant,” “automatic refund,” or “global access” as unconditional claims until implemented and verified.

## Responsive behaviour

| Breakpoint | Behaviour |
|---|---|
| 375–599px | Web hero simplifies; Call Line stacks; cards become one column; nav collapses |
| 600–1023px | Hero scales and may narrow to 60/40; cards remain two columns when readable |
| 1024–1439px | Full two-column hero and flat-card rows |
| 1440px+ | 1280px max-width with generous Cream Field margins |

Mobile Metron Console is a separate native context, not merely a web breakpoint.

### Mobile Call Line

```text
CALLER
  ↓
PRICE
  ↓
SETTLED
  ↓
RESPONSE
```

The primary action, payment amount and transaction state must remain visible without horizontal scrolling.

## Agent prompt guide

1. Keep `#FAF7EA`, Poppins, Satoshi, pill web controls and flat Coral/Lime web cards.
2. Keep the Aikido-inspired hero register, but replace its subject with **The Call in Motion**.
3. Use `CALLER → ROUTE → PRICE → SETTLED → RESPONSE` whenever a transaction needs explanation.
4. Use the Metron Receipt across hero, web, mobile and presentation contexts.
5. Keep web cards shadowless; reserve hard black shadows for the mobile register.
6. Keep Hero and Mobile palettes separate from the Web palette.
7. Use Blueprint Blue for payment evidence, Lime for action, Coral for explanation and Green only for verified settlement.
8. Never use decorative crypto objects where a real route, price, response or transaction record can be shown instead.
