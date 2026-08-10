# Metron Celo Registration

> **Status:** Registration and attribution reference. This document records submitted identity and evidence rules; it does not claim that the runtime integration or any transaction has been completed.

## Registered project

| Field | Value |
|---|---|
| Product name | Metron |
| Public GitHub repository | [Devendurance/usemetron](https://github.com/Devendurance/usemetron) |
| Registration status | Draft; not published |
| Builder | Endurance Udoh |
| X | `@devendyyy` |
| Telegram | `@devendurance` |
| Assigned attribution tag | `celo_91fed90b97fc` |
| Registered agent/payTo wallet | `0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa` |

The registered wallet is evidence for wallet-attributed Track 2 activity only when it actually participates in the settlement path as the payer or payTo destination. Settlements to or from that wallet are attributable only when the wallet is part of the path. The current application does not implement `payTo` routing, so no creator wallet or registered wallet is silently treated as the destination.

## Canonical payment target

Metron's production target is Celo Mainnet:

| Field | Value |
|---|---|
| Chain ID | `42220` |
| CAIP-2 network | `eip155:42220` |
| Primary asset | USDC |
| Decimals | `6` |
| Mainnet USDC address | `0xcEBA9300f2b948710d2653dD7B07f33A8B32118C` |
| x402 version | V2 |
| Scheme | `exact` |

The Celo x402 dashboard is `https://x402.celo.org`. The production facilitator API is `https://api.x402.celo.org`. The dashboard is not a backend API host.

For the facilitator:

- `GET /supported`, `GET /health`, and `POST /verify` are open.
- `POST /settle` requires a server-side `X402_API_KEY` sent as the facilitator's `X-API-Key` header.
- The key must never reach browser code, client bundles, callers, or logs.
- A passing `/verify` call does not prove settlement configuration. `/settle` must be tested separately.

## x402 V2 header contract

Use the exact V2 names as canonical:

- `PAYMENT-REQUIRED`: the server's payment requirements on the `402` response.
- `PAYMENT-SIGNATURE`: the caller's signed payment payload on the retry.
- `PAYMENT-RESPONSE`: the server's settlement response.

`X-PAYMENT`, `X-Payment`, and `X-PAYMENT-RECEIPT` are legacy compatibility names only if a compatibility boundary is explicitly documented. They are not the target Metron contract.

V2 header values are Base64-encoded JSON objects: `PaymentRequired`, `PaymentPayload`, and `SettlementResponse`. The Celo Mainnet USDC price object must use an integer string amount, the registered USDC address, and `extra: { name: "USDC", version: "2" }`.

The intended request path is:

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

Authorization, verification, settlement, execution, and delivery must remain separate states. If upstream work fails before settlement, do not settle. Record the attempt as aborted and non-settled; do not call it an automatic refund or reversal.

## Track separation

### Primary: Track 2 Most x402 Payments

The primary metric is the **count of successful Celo Mainnet x402 settlements**, not settlement amount.

Counted activity must be wallet-attributed through the submitted registered agent/payTo wallet. Settlements to or from that wallet count only when the wallet actually participates in the settlement path; arbitrary creator wallets do not automatically count for Track 2.

The hackathon FAQ states that the Celo facilitator relayer submits its own settlement transactions and cannot carry Metron's attribution tag. Therefore:

- Do not require `celo_91fed90b97fc` on Track 2 facilitator settlements.
- Do not claim that every facilitator settlement carries the tag.
- Do not send tagged mirror transactions to imitate x402 activity.
- Retain the real settlement transaction hash, payer, destination, and wallet evidence.

### Secondary: Track 1 Most Revenue Generated

Track 1 uses eligible onchain volume from genuine Metron-originated **direct transactions** carrying the exact assigned tag `celo_91fed90b97fc`.

For direct transactions, preserve any existing attribution code and add the assigned code with the supported multi-code form:

```ts
const suffix = toDataSuffix([
  "your_existing_code",
  "celo_91fed90b97fc",
])
```

If no existing code is present, use the assigned code alone. Keep the transaction hash and verify the onchain suffix after the transaction is mined, using the supported attribution-tag tooling.

Do not use invented volume, self-transfers, wash activity, or sybil traffic. The Celo hosted facilitator's support for carrying Metron's Builder Code/ERC-8021 attribution on its relayer settlement path is **REQUIRES OFFICIAL CONFIRMATION**. Do not assert that it supports Track 1 attribution.

## Evidence checklist

For every claimed result, retain:

- Request and response correlation identifier.
- Route identifier and payment policy.
- x402 V2 version, `exact` scheme, network, asset, amount, and destination.
- Lifecycle states, including verification and settlement outcome.
- Facilitator response and HTTP status.
- Celo Mainnet transaction hash when settlement is submitted.
- Independent onchain transaction link and wallet attribution evidence.
- Direct-transaction attribution suffix when Track 1 is claimed.

Evidence must come from real production activity. UI placeholders, local state selectors, fake earnings, test fixtures, and fabricated transaction hashes are not submission evidence.

## Implementation boundary

The repository currently contains a presentation UI only. It does not yet contain production API routes, PostgreSQL/Supabase persistence, Redis, wallet authentication, a Celo Mainnet provider, x402 integration, USDC integration, `payTo` routing, attribution runtime, or transaction persistence.

The following choices remain open:

- **`payTo` routing:** creator-direct, registered agent wallet, or another configured route. **REQUIRES IMPLEMENTATION DECISION.**
- **Track 1 hosted-facilitator attribution:** **REQUIRES OFFICIAL CONFIRMATION.**
- **Settlement reconciliation and failure handling:** **REQUIRES IMPLEMENTATION DECISION.**

## References

- [Celo x402](https://docs.celo.org/build-on-celo/build-with-ai/x402)
- [Celo network overview](https://docs.celo.org/build-on-celo/network-overview)
- [Celo stablecoin contracts](https://docs.celo.org/tooling/contracts/stablecoin-contracts)
- [x402 HTTP 402 and V2 headers](https://docs.x402.org/core-concepts/http-402)
- [x402 Builder Code extension](https://docs.x402.org/extensions/builder-code)
- [Celo Builders FAQ](https://celobuilders.xyz/hackathons/agentic-payments-defai/faqs)
- [Celo Builders tracks](https://celobuilders.xyz/hackathons/agentic-payments-defai/tracks)
