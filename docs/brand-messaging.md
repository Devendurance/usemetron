# Metron Brand Messaging

> **Status:** Canonical messaging for the target Celo Mainnet product. The repository currently contains a UI shell and presentation previews only. Copy below must not imply that production payment, wallet, API, settlement, or analytics behavior already exists.

## Brand core

**Metron** comes from Greek *metron*: a measure, standard, or measured unit.

Metron is the clear payment route for callable APIs. It is intended to make the price, authorization, work, settlement state, and response legible in one request path.

### Fixed brand lines

> **Turn API calls into paid work.**

> **One call. One price. One settlement.**

These are positioning lines, not evidence that the current UI has processed a payment.

### Brand idea

> **Every useful call deserves a clear price.**

### Product principle

> **Show the transaction. Then execute the work.**

## Claim discipline

Use these distinctions in every surface:

- Say **target**, **planned**, or **when implemented** for production capabilities that are not in the repository.
- Say **presentation preview** for the existing UI states.
- Say **verified** only when a real facilitator response or other auditable evidence supports it.
- Say **settled** only when a real Celo Mainnet settlement response and transaction evidence support it.
- Say **creator payout** only after the actual `payTo` routing and settlement path has been implemented and evidenced.
- Do not claim creator-direct settlement, instant earnings, automatic refunds, automatic reversals, global access, or live analytics before they are implemented and tested.
- Never use local preview states, placeholder receipts, or empty dashboard components as transaction evidence.

The current app does not have production API routes, database/schema/migrations, Redis, wallet authentication, x402 integration, a Mainnet provider, USDC integration, `payTo` routing, attribution runtime, or transaction persistence. It does not create fake transactions or fake earnings.

## Strategic diagnosis

Metron is intended to be **pay-per-request API infrastructure**. It is not primarily an API marketplace, a Stripe clone, a crypto wallet, or an AI-agent framework.

### Strategic enemy

For creators:

> Billing infrastructure that is heavier than the API business itself.

For callers and agents:

> Human checkout imposed on machine-to-machine work.

## Target audience

### Primary launch wedge

AI-agent developers and indie API creators who need to publish and consume paid APIs without building billing infrastructure.

### Secondary audiences

- Data providers selling query-level access.
- Developers in markets with limited card-processor access.
- Human developers consuming paid APIs.
- AI agents that need machine-readable payment requirements.

## Target positioning

> For developers who have useful APIs but do not want to build billing infrastructure, Metron is intended to turn an existing endpoint into a pay-per-request route on Celo Mainnet. Callers and agents should be able to inspect the request price, authorize one payment, and receive the response through x402 V2.

### Target product promise

> Publish an endpoint, set a price, and let a caller authorize one exact payment for one useful request.

This promise becomes a product claim only after the full flow has been implemented and proven with a real Celo Mainnet settlement.

### Target differentiators

- Zero-code endpoint publishing as a product goal.
- Stablecoin pricing in integer USDC base units.
- Celo Mainnet x402 V2 integration.
- Agent-compatible HTTP payment requirements.
- Inspectable request, verification, upstream, settlement, and response evidence.
- A clear separation between payment authorization and upstream execution.

Creator wallet settlement is a target capability, not a current claim. The `payTo` routing architecture is not implemented and remains an implementation decision.

## Canonical payment language

The target payment configuration is:

| Field | Canonical value |
|---|---|
| Network | Celo Mainnet |
| Chain ID | `42220` |
| CAIP-2 network | `eip155:42220` |
| Primary asset | USDC |
| USDC decimals | `6` |
| Mainnet USDC | `0xcEBA9300f2b948710d2653dD7B07f33A8B32118C` |
| Scheme | `exact` |
| x402 version | V2 |

The canonical x402 V2 request sequence is:

```text
REQUEST
  -> HTTP 402 + PAYMENT-REQUIRED
  -> caller signs the authorization
  -> retry with PAYMENT-SIGNATURE
  -> Metron verifies
  -> upstream work executes
  -> settlement is attempted according to policy
  -> resource + PAYMENT-RESPONSE
```

Keep authorization, verification, settlement, execution, and delivery distinct in product language.

Canonical headers:

- `PAYMENT-REQUIRED`: server to caller with the payment requirements on the `402` response.
- `PAYMENT-SIGNATURE`: caller to server on the retry containing the signed payment payload.
- `PAYMENT-RESPONSE`: server to caller with the settlement response.

`X-PAYMENT`, `X-Payment`, and `X-PAYMENT-RECEIPT` are legacy compatibility names only when a migration or compatibility boundary must be documented. They are not canonical Metron or x402 V2 copy.

V2 header values are Base64-encoded JSON; product copy should expose the semantic header names above rather than treating encoded values as user-facing text.

### Facilitator language

- Dashboard: `https://x402.celo.org`
- Production facilitator API: `https://api.x402.celo.org`
- The dashboard is not a backend API host.
- `/verify`, `/supported`, and `/health` are open endpoints.
- `/settle` requires a server-side `X402_API_KEY` sent as the facilitator's `X-API-Key` header.
- `X402_API_KEY` must never be exposed to a browser, client bundle, caller, or dashboard form.
- A successful `/verify` response does not prove that settlement is configured. `/settle` must be tested separately.

### Failure language

If upstream work fails before settlement:

> **Upstream work failed before settlement. This call is aborted and non-settled.**

Do not call this an automatic refund or reversal. Do not promise a refund unless a real implemented mechanism exists and the evidence supports that wording.

## Messaging hierarchy

| Layer | Canonical message | Claim boundary |
|---|---|---|
| Hero | **Turn API calls into paid work.** | Positioning line only until a real call is demonstrated. |
| Descriptor | Target pay-per-request infrastructure for APIs and AI agents on Celo Mainnet. | The integration is planned, not present in the current app. |
| Creator benefit | Publish an endpoint and define a per-request payment policy. | Do not say the route is live until persistence and gateway work exist. |
| Caller benefit | Inspect the price and authorize the exact request you need. | Do not claim a completed response without a real call. |
| Proof | Payment terms, verification state, upstream result, settlement response, and transaction evidence. | Evidence must come from production records. |
| Primary CTA | **Publish an API** | Starts a target workflow; current form is not a production publisher. |
| Secondary CTA | **See a paid call** | A demo must be labeled preview until it uses Mainnet evidence. |

## Messaging house

### Roof

> **Metron turns API calls into paid work.**

### Pillar 1: Monetize without rebuilding

**Message:** You built the capability. Metron is intended to handle the payment route around it.

**Target proof points:**

- Connect a real wallet identity.
- Persist an upstream endpoint.
- Set an integer USDC base-unit price.
- Generate a route only after the endpoint is stored.

### Pillar 2: Let callers and agents authorize one request

**Message:** A caller can inspect the payment requirement, sign one authorization, retry the request, and receive the result when the target flow is implemented.

**Target proof points:**

- HTTP `402 Payment Required`.
- `PAYMENT-REQUIRED` and `PAYMENT-SIGNATURE` headers.
- x402 V2 `exact` scheme on `eip155:42220`.
- USDC amount in base units.

### Pillar 3: Make each transaction inspectable

**Message:** Metron should show the route, price, network, verification state, upstream result, settlement state, and response instead of asking users to trust an invisible system.

**Target proof points:**

- Call Line.
- Metron Receipt.
- `PAYMENT-RESPONSE`.
- Persisted transaction record and Celo Mainnet transaction hash when available.

### Pillar 4: Make small work economically legible

**Message:** When a capability is useful for one request, the payment policy should work for one request.

**Target proof points:**

- Per-request USDC pricing.
- Celo Mainnet settlement.
- No forced subscription in the MVP.
- A settlement record, without claiming creator-direct payout before routing is implemented.

## Key messages by audience

### API creators

**Headline:** You built the API. Metron is the payment route around it.

**Body:** Define an upstream endpoint and a per-request USDC policy. The target product will handle the x402 request path and preserve evidence for each real call.

**CTA:** Publish an API

### AI-agent developers

**Headline:** Give your agents APIs they can authorize one call at a time.

**Body:** Metron is designed to return machine-readable x402 V2 requirements so an agent can inspect the price, sign a payment authorization, retry, and continue after a real response.

**CTA:** Run a paid call

### API callers

**Headline:** Pay for the call you need, not a plan you do not.

**Body:** See the price, asset, network, destination, and execution policy before authorizing a request.

**CTA:** View payment terms

### Celo ecosystem

**Headline:** Real API work, paid for onchain.

**Body:** The target Metron flow uses Celo Mainnet x402 infrastructure for genuine pay-per-request activity. Only real settlement evidence should be presented as proof.

**CTA:** View the transaction

## Feature-to-value translations

| Target capability | Functional result | Practical outcome | Safe emotional value |
|---|---|---|---|
| Persisted route | An upstream API has a stored payment policy | A creator can prepare a payable route | "I can define the work clearly." |
| x402 payment requirement | Caller receives machine-readable terms | An agent can decide whether to authorize | "The machine can see the price." |
| Verification | Payment authorization is checked before execution | Unverified requests do not reach upstream | "The route has a gate." |
| Upstream execution | Work runs after the required checks | The paid request maps to useful output | "The call does real work." |
| Settlement response | Facilitator reports settlement result | The transaction has an auditable outcome | "I can inspect what happened." |
| Metron Receipt | Request fields and evidence are recorded | Caller and operator can review a real call | "The route is understandable." |

## Essential product copy

| Moment | Canonical copy |
|---|---|
| Hero | **Turn API calls into paid work.** |
| Supporting line | Publish an endpoint, set a price, and let callers authorize one request on Celo Mainnet when the integration is connected. |
| Creator CTA | Publish an API |
| Agent CTA | Run a paid call |
| Setup step | Paste your endpoint |
| Pricing step | Set the price in USDC base units |
| Publish state | Route configuration saved when the endpoint persistence is connected. |
| Payment requirement | This call requires an exact USDC payment on Celo Mainnet. |
| Verification pending | Payment authorization is being verified. |
| Upstream state | Payment is verified. Executing the upstream request. |
| Settlement state | Settlement is being attempted after upstream work. |
| Response success | Response returned. Settlement evidence is available when the facilitator confirms it. |
| Upstream failure | Upstream work failed before settlement. This call is aborted and non-settled. |
| Settlement failure | Settlement did not complete. Inspect the payment response and transaction evidence. |
| Demo proof | One call. One price. One settlement. |

Avoid `Payment settled. Forwarding the request.` as an unconditional sequence: the target policy must define whether settlement occurs before or after delivery, and the implementation must report the actual order. The canonical plan here is upstream execution before settlement.

## Metron Receipt language

The repeated explanation sequence is:

```text
CALLER -> ROUTE -> PRICE -> VERIFIED -> UPSTREAM -> SETTLEMENT -> RESPONSE
```

Receipt fields should be populated only from real records:

```text
METRON CALL / <call id>
ROUTE       / <route>
PRICE       / <integer amount> USDC
NETWORK     / Celo Mainnet / eip155:42220
STATUS      / <lifecycle status>
RESPONSE    / <upstream response status>
PAY TO      / <configured destination when implemented>
TX          / <real transaction hash when available>
```

The receipt is a proof format, not permission to invent activity. Empty or unavailable fields should remain explicitly unavailable.

## Hackathon narrative

### Primary track: Most x402 Payments

Optimize for the count of successful Celo Mainnet x402 settlements. The count is the primary metric, not the dollar amount. Activity is wallet-attributed through the registered agent/payTo wallet: settlements to or from that wallet are attributable only when the registered wallet actually participates in the settlement path. Arbitrary creator wallets do not automatically count for Track 2.

The hackathon FAQ says facilitator relayer settlements cannot carry Metron's attribution tag. Therefore:

- Do not require the tag for Track 2.
- Do not claim every facilitator settlement carries `celo_91fed90b97fc`.
- Do not send tagged mirror transactions.
- Keep the real settlement transaction hashes and wallet evidence.

### Secondary track: Most Revenue Generated

Optimize only for eligible onchain volume from genuine Metron-originated direct transactions carrying the exact assigned tag `celo_91fed90b97fc`. Preserve any existing builder codes with the supported multi-code form. Keep hashes and evidence. Never use invented volume, self-transfers, wash activity, or sybil traffic.

Do not assert that the Celo hosted facilitator supports Metron's Builder Code/ERC-8021 path for Track 1. Mark that capability **REQUIRES OFFICIAL CONFIRMATION** if it becomes relevant.

## Voice rules

| Principle | Sounds like | Not like |
|---|---|---|
| Name the transaction | "This call requires USDC on Celo Mainnet." | "Unlock next-generation value." |
| Show the working | "Authorization verified. Upstream failed before settlement." | "The protocol handled everything magically." |
| Respect the creator | "Define the payment route around the capability you already built." | "Turn your side project into passive income." |
| Respect the agent | "The endpoint returned a payment requirement." | "Your AI has financial freedom." |
| Be clear about conditions | "No settlement is attempted before upstream failure is recorded." | "Automatic refunds, guaranteed." |

Use: **call, route, request, response, price, verify, settle, creator, caller, endpoint, receipt, Celo Mainnet, USDC, policy, evidence.**

Avoid: **instant, automatic refund, automatic reversal, passive income, seamless, frictionless, guaranteed payout, magic, global access, revolution, crypto-neon hype.**

## References

- [Celo x402](https://docs.celo.org/build-on-celo/build-with-ai/x402)
- [Celo network overview](https://docs.celo.org/build-on-celo/network-overview)
- [Celo stablecoin contracts](https://docs.celo.org/tooling/contracts/stablecoin-contracts)
- [x402 HTTP 402 and V2 headers](https://docs.x402.org/core-concepts/http-402)
- [x402 Builder Code extension](https://docs.x402.org/extensions/builder-code)
- [Celo Builders FAQ](https://celobuilders.xyz/hackathons/agentic-payments-defai/faqs)
- [Celo Builders tracks](https://celobuilders.xyz/hackathons/agentic-payments-defai/tracks)

## Final recommendation

Metron should be remembered as:

> **The clear payment layer for API calls.**

The product should always return to:

> **One call. One price. One settlement.**
