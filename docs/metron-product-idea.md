# Metron - Product Idea

> **Status:** Current product direction and target scope. The repository is a presentation UI shell; the payment gateway, wallet identity, persistence, and settlement flow are future implementation work.

## One line

> **Metron turns API calls into paid work: one call, one price, one settlement.**

Metron is intended to make a callable API payable per request through x402 V2 on Celo Mainnet. It should let a creator define an endpoint and let a caller or AI agent authorize one exact USDC payment before receiving useful work.

This is not a claim that the current app has live routes, wallet auth, payment processing, creator payouts, or transaction history.

## Why the name fits

*Metron* comes from Greek *metron*: a measure, standard, or measured unit. The name fits the intended product because every request has a clear route, price, execution result, settlement state, and evidence record.

## Current repository state

The current app contains:

- Landing and dashboard presentation surfaces.
- A Call Line and Metron Receipt visual language.
- Proxy and dashboard state previews that explicitly avoid making live payment claims.

It does not contain:

- Production API routes or a gateway handler.
- PostgreSQL/Supabase schema, migrations, or transaction persistence.
- Redis/Upstash, wallet authentication, x402 integration, or a Mainnet provider.
- USDC integration, `payTo` routing, attribution runtime, or real analytics.

No fake transactions, mock earnings, fake API data, or runtime fallback verifier should be added to make the idea look implemented.

## The problem

### API creators

An indie developer can build a useful data, translation, inference, or automation endpoint without wanting to build:

- Payment collection and settlement.
- API keys, quotas, and usage metering.
- Billing dashboards, invoices, and webhooks.
- Per-request pricing and failure handling.
- Wallet identity and evidence for each paid call.

Small APIs are often given away or delayed because billing infrastructure becomes a second product.

### Callers and agents

A caller that needs one request often faces account creation, card checkout, subscriptions, and API-key setup. An AI agent needs a machine-readable payment requirement and a bounded authorization path instead.

### Global access

Stablecoin settlement may widen the set of creators and callers who can participate, but wallet, regulatory, liquidity, and access conditions vary by jurisdiction. Metron must not claim universal availability.

## Intended solution

Metron is a payment route around a callable API, not a marketplace in the first release. The intended flow is:

```text
request resource
  -> HTTP 402 + PAYMENT-REQUIRED
  -> caller signs authorization
  -> retry with PAYMENT-SIGNATURE
  -> Metron verifies
  -> upstream work executes
  -> settlement is attempted according to policy
  -> resource + PAYMENT-RESPONSE
```

The target protocol configuration is:

| Field | Value |
|---|---|
| Network | Celo Mainnet |
| Chain ID | `42220` |
| CAIP-2 | `eip155:42220` |
| Token | USDC |
| Decimals | `6` |
| Address | `0xcEBA9300f2b948710d2653dD7B07f33A8B32118C` |
| x402 version | V2 |
| Scheme | `exact` |

Use integer USDC base units, not floating point. The canonical headers are `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE`. `X-PAYMENT`, `X-Payment`, and `X-PAYMENT-RECEIPT` are legacy compatibility names only when explicitly scoped.

The V2 header values are Base64-encoded JSON objects (`PaymentRequired`, `PaymentPayload`, and `SettlementResponse`). The target Celo Mainnet USDC price object uses an integer string amount, the registered USDC address, and `extra: { name: "USDC", version: "2" }`.

Use `https://x402.celo.org` as the human-facing dashboard and `https://api.x402.celo.org` as the production facilitator API. The dashboard is never a backend API host. `/verify`, `/supported`, and `/health` are open; `/settle` requires a server-side `X402_API_KEY` sent as the facilitator's `X-API-Key` header, and `/verify` alone does not prove settlement configuration.

Authorization, verification, settlement, execution, and delivery are distinct. If upstream work fails before settlement, do not settle. Record the attempt as aborted and non-settled. Do not claim an automatic refund or reversal.

## Current Mainnet MVP

This section defines the smallest useful target for the current build. None of these production capabilities should be described as complete until evidenced.

### Creator path

1. Authenticate a real Celo Mainnet wallet with a nonce-bound signature.
2. Persist an upstream URL with SSRF protection.
3. Define an integer USDC base-unit amount.
4. Select a `payTo` destination through an explicit implementation decision.
5. Receive a persisted route identifier and powered URL.
6. Inspect real call and settlement evidence after traffic occurs.

### Caller path

1. Request a powered URL.
2. Read `PAYMENT-REQUIRED` from the `402` response.
3. Verify that the requirement is `exact`, `eip155:42220`, USDC, and the expected amount/destination.
4. Sign a payment authorization and retry with `PAYMENT-SIGNATURE`.
5. Receive a response only after the gateway's verification, upstream, and settlement policy completes.
6. Read `PAYMENT-RESPONSE` and the useful upstream response.

### Persistence path

PostgreSQL/Supabase stores creators, routes, call attempts, lifecycle states, facilitator results, and transaction hashes when available. Redis/Upstash is limited to ephemeral nonce/replay locks, rate limits, route caching, and auth/session nonces.

Target lifecycle states are `PAYMENT_REQUIRED`, `VERIFIED`, `UPSTREAM_FAILED`, `SETTLEMENT_FAILED`, and `SETTLED` or documented equivalents.

### Definition of MVP proof

- One real endpoint is persisted.
- One real x402 V2 challenge is returned.
- One real signed retry is verified.
- One real upstream response is produced.
- One real Celo Mainnet settlement is completed.
- The transaction hash and lifecycle evidence are persisted.
- The existing dashboard displays real evidence and remains honest when data is absent.

Testnet activity may be a development preflight, but it is not the definition of done.

## Future vision

### Near term

Prove a reliable Celo-native paid API route with an external agent, clear failure states, persistent receipts, and independently verifiable settlement evidence.

### Medium term

Add endpoint discovery, agent framework integrations, SDKs, custom domains, usage policies, analytics derived from real records, reputation, and operational tooling.

### Long term

Become a payment layer for machine-to-machine work: developers publish callable capabilities, and agents discover, authorize, pay for, and use them without human checkout.

Future vision does not authorize current copy to claim a marketplace, global payout network, automatic refunds, or creator-direct settlement.

## Hackathon optimization

### Primary: Track 2 Most x402 Payments

Optimize for successful Celo Mainnet x402 settlement **count**, not amount. Track 2 activity is wallet-attributed through the submitted agent/payTo wallet: settlements to or from that registered wallet are attributable only when the wallet actually participates in the settlement path. Arbitrary creator wallets do not automatically count.

The hackathon FAQ says facilitator relayer settlements cannot carry Metron's tag. Therefore:

- Do not require `celo_91fed90b97fc` for Track 2.
- Do not claim that every facilitator settlement carries it.
- Do not send tagged mirror transactions.
- Retain real settlement hashes and wallet evidence.

### Secondary: Track 1 Most Revenue Generated

Pursue only eligible onchain volume from genuine Metron-originated direct transactions carrying the exact assigned tag `celo_91fed90b97fc`.

Preserve existing attribution codes with the supported multi-code form:

```ts
const suffix = toDataSuffix([
  "your_existing_code",
  "celo_91fed90b97fc",
])
```

Keep hashes and verify evidence. Do not invent volume, self-transfer funds, wash activity, or sybil traffic. Do not assert that the Celo hosted facilitator supports Metron's Builder Code/ERC-8021 path for Track 1; mark it **REQUIRES OFFICIAL CONFIRMATION** if needed.

### Registered identity

| Field | Value |
|---|---|
| Project | Metron |
| Repository | [Devendurance/usemetron](https://github.com/Devendurance/usemetron) |
| Builder | Endurance Udoh |
| X | `@devendyyy` |
| Telegram | `@devendurance` |
| Assigned tag | `celo_91fed90b97fc` |
| Registered agent/payTo wallet | `0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa` |

## Business model hypothesis

The product may eventually support:

- A small transaction fee, subject to validating economics at micropayment sizes.
- Paid analytics, custom domains, policies, higher-volume support, and SLAs.
- Discovery, reputation, managed routing, and usage intelligence.

These are hypotheses, not current revenue claims. The first proof is a real, repeatable settlement path and honest evidence.

## Competitive context

| Alternative | Intended Metron response |
|---|---|
| Stripe plus custom billing | Reduce card, account, and billing-infrastructure work for per-request use. |
| API marketplaces | Start with a route and payment layer instead of marketplace discovery overhead. |
| x402 libraries | Productize route configuration, persistence, and evidence around the protocol. |
| API gateways | Add payment requirements and settlement policy to routing. |
| Usage-billing platforms | Support an exact per-request flow rather than requiring subscriptions first. |

Do not call Metron the only product with these capabilities without current competitive research.

## What Metron should and should not claim

Use:

- **Turn API calls into paid work.**
- **One call. One price. One settlement.**
- Pay-per-request API infrastructure.
- Inspectable payment terms and settlement evidence.
- Target Celo Mainnet x402 V2 support.

Do not use as current fact:

- Creator-direct payout.
- Instant earnings.
- Automatic refund or reversal.
- Live transaction history or analytics.
- Global availability.
- A completed x402 integration.

## References

- [Celo x402](https://docs.celo.org/build-on-celo/build-with-ai/x402)
- [Celo network overview](https://docs.celo.org/build-on-celo/network-overview)
- [Celo stablecoin contracts](https://docs.celo.org/tooling/contracts/stablecoin-contracts)
- [x402 HTTP 402 and V2 headers](https://docs.x402.org/core-concepts/http-402)
- [x402 Builder Code extension](https://docs.x402.org/extensions/builder-code)
- [Celo Builders FAQ](https://celobuilders.xyz/hackathons/agentic-payments-defai/faqs)
- [Celo Builders tracks](https://celobuilders.xyz/hackathons/agentic-payments-defai/tracks)
