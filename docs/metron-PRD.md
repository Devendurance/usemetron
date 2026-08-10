# Metron Product Requirements Document

**Version:** 1.1 — Canonical Mainnet / Hackathon Scope  
**Status:** Authoritative implementation specification  
**Network:** Celo Mainnet  
**Primary payment asset:** USDC  
**Payment protocol:** x402 V2  
**Last updated:** 2026-08-08

> **Authority:** This document is the single implementation source of truth for the current Metron build. Older PRDs, build plans, architecture notes, UI previews, and archived documents are subordinate to this PRD wherever they conflict with it.
>
> **Current state:** The Metron UI shell already exists. The work now is to connect that shell to real authentication, real persistence, real APIs, real x402 payments, real creator payouts, and real Celo Mainnet evidence. Runtime mocks, fake transaction history, fake earnings, and silent fallback data are prohibited.

---

## 1. Product definition

### 1.1 Product

**Metron** is pay-per-request infrastructure for callable APIs.

A developer publishes an existing HTTP endpoint, sets a USDC price per successful request, and receives a Metron-powered URL. A human caller, script, application, or AI agent can call that URL, receive an x402 payment requirement, authorize the exact payment, and receive the real upstream response after Metron's payment and execution policy completes.

### 1.2 Positioning

> **Turn API calls into paid work.**

> **One call. One price. One settlement.**

### 1.3 Core product promise

Metron removes the need for an API creator to build a complete billing product before charging for individual API requests.

The current scope proves this sequence with real infrastructure:

```text
creator publishes endpoint
→ caller requests powered URL
→ Metron returns HTTP 402
→ caller authorizes USDC payment
→ Metron verifies authorization
→ real upstream API executes
→ x402 payment settles on Celo
→ creator earnings are recorded
→ creator payout is sent
→ caller receives the real response
→ both payment and payout evidence are inspectable
```

---

## 2. Current strategic scope

Metron is optimized for two hackathon tracks without creating artificial activity.

### Primary: Most x402 Payments

The primary metric is the count of successful Celo x402 settlements.

For the current hackathon scope, **every Metron-paid route uses the registered Metron settlement wallet as the x402 `payTo` address**:

```text
0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa
```

This is an intentional product decision for the current scope.

It ensures successful x402 settlements routed through Metron involve the registered wallet and can be counted using the hackathon's wallet-based Track 2 tracking mechanism.

### Secondary: Most Revenue Generated

Metron's assigned Celo attribution tag is:

```text
celo_91fed90b97fc
```

Successful creator payouts sent by Metron are genuine product transactions. These payout transactions must carry the assigned attribution tag and form Metron's legitimate Track 1 volume path.

Metron must never create:

- self-transfers for leaderboard purposes;
- circular transfers;
- mirror transactions;
- wash volume;
- synthetic/sybil payment traffic;
- meaningless tagged transactions.

### Important distinction

```text
TRACK 2
x402 payment settlement
caller → registered Metron settlement wallet
tracked by registered wallet participation
attribution tag not required for the x402 settlement

TRACK 1
creator payout
registered Metron settlement wallet → creator wallet
genuine payout transaction
tagged with celo_91fed90b97fc
```

The two mechanisms must remain separate in code, database records, analytics, documentation, and submission evidence.

---

## 3. Canonical production configuration

| Field | Canonical value |
|---|---|
| Network | Celo Mainnet |
| Chain ID | `42220` |
| CAIP-2 network | `eip155:42220` |
| x402 version | V2 |
| x402 scheme | `exact` |
| Payment token | USDC |
| USDC decimals | `6` |
| USDC contract | `0xcEBA9300f2b948710d2653dD7B07f33A8B32118C` |
| x402 dashboard | `https://x402.celo.org` |
| x402 facilitator API | `https://api.x402.celo.org` |
| Registered x402/payTo wallet | `0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa` |
| Attribution tag | `celo_91fed90b97fc` |

The dashboard and facilitator hosts are not interchangeable.

Production facilitator calls use:

```text
POST https://api.x402.celo.org/verify
POST https://api.x402.celo.org/settle
GET  https://api.x402.celo.org/supported
GET  https://api.x402.celo.org/health
```

`/settle` requires a server-side facilitator API key.

---

## 4. x402 V2 contract

The canonical payment headers are:

```text
PAYMENT-REQUIRED
PAYMENT-SIGNATURE
PAYMENT-RESPONSE
```

Legacy `X-PAYMENT`, `X-Payment`, or `X-PAYMENT-RECEIPT` names are not the current Metron contract.

The accepted Celo payment configuration is equivalent to:

```text
scheme: exact
network: eip155:42220
payTo: 0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa

price:
  amount: "<USDC base units as string>"
  asset: 0xcEBA9300f2b948710d2653dD7B07f33A8B32118C
  extra:
    name: USDC
    version: "2"
```

Amounts must never use JavaScript floating point as the authoritative representation.

Examples:

```text
0.001 USDC = "1000"
0.005 USDC = "5000"
0.01  USDC = "10000"
```

---

## 5. The resolved money architecture

This section is binding for the current build.

### 5.1 x402 settlement wallet

All x402 route requirements use:

```text
payTo = 0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa
```

The Celo facilitator performs the x402 settlement from the caller to this registered Metron wallet.

### 5.2 Creator payout wallet

For the MVP, the authenticated creator wallet is also the creator's payout wallet.

A creator cannot configure an unrelated payout address in the initial version.

This keeps payout ownership tied to a wallet identity Metron has actually verified.

### 5.3 Creator earnings

When a route's x402 settlement succeeds, the full settled amount becomes money owed to that route's creator.

For the current MVP:

```text
Metron protocol fee = 0%
creator gross earning = x402 settled amount
creator payout amount = creator gross earning
```

Metron bears facilitator-credit and payout-gas costs during the MVP.

A future protocol fee is out of scope and must not be introduced silently.

### 5.4 Payout

After a successful x402 settlement, Metron creates a creator payable and attempts a USDC transfer from the registered Metron settlement wallet to the creator's verified payout wallet.

The payout is a real economic transaction and must include:

```text
celo_91fed90b97fc
```

using the official Celo attribution-tag mechanism.

The first real tagged payout must be decoded/verified before the system treats attribution as production-ready.

### 5.5 Custody implication

This architecture means Metron temporarily controls creator funds between x402 settlement and payout confirmation.

The product and UI must not pretend this is caller-to-creator direct settlement.

Metron must therefore keep an exact creator ledger and distinguish:

```text
earned
paid out
outstanding
```

No creator balance may be inferred from the settlement wallet's total token balance.

---

## 6. Product actors

### API creator

A developer who owns an HTTP API and wants to charge per request.

They can:

- authenticate with a Celo-compatible EVM wallet;
- publish a real upstream endpoint;
- configure a flat USDC price;
- optionally configure private upstream authentication;
- receive a powered URL;
- view real paid calls;
- view real earned, paid, and outstanding amounts;
- receive creator payouts to their verified wallet.

### Caller / AI agent

A caller does not require a Metron account.

The caller needs:

- a compatible x402 client;
- a wallet capable of signing the required USDC authorization;
- enough USDC;
- permission to authorize the advertised amount.

### Metron operator

Metron owns:

- route configuration;
- creator authentication;
- x402 verification orchestration;
- upstream execution;
- x402 settlement orchestration;
- creator ledger;
- creator payouts;
- payout retry/reconciliation;
- persistence and evidence.

### Celo facilitator

The facilitator verifies and settles x402 authorizations.

It does not perform Metron's separate creator payout.

---

## 7. Goals

The current MVP must prove that:

1. A real creator can authenticate.
2. A real API can be persisted.
3. A real price can be attached to it.
4. An unpaid call produces a valid x402 V2 challenge.
5. A real external caller can authorize the payment.
6. Metron can verify the authorization.
7. The real upstream API can execute.
8. The x402 payment can settle to the registered Metron wallet.
9. The creator earning can be recorded exactly once.
10. Metron can send the real creator payout with the attribution tag.
11. The caller can receive the real upstream response.
12. The creator dashboard can show real settlement and payout evidence after refresh.

---

## 8. Non-goals

The current MVP does not include:

- API marketplace/discovery;
- subscriptions;
- monthly billing;
- multi-chain settlement;
- dynamic token/LLM pricing;
- custom domains;
- teams or organizations;
- reviews/reputation;
- creator-selected payout wallets unrelated to authentication;
- protocol fees;
- fiat withdrawals;
- manual creator withdrawal UX;
- multi-token settlement;
- batch x402 settlement;
- `upto` pricing;
- advanced revenue sharing;
- public analytics leaderboards.

---

## 9. Creator authentication

Wallet connection alone is not authentication.

### Flow

```text
connect wallet
→ request auth challenge
→ server creates short-lived nonce
→ creator signs challenge
→ server verifies signature
→ creator record resolved/created
→ secure session issued
```

Requirements:

- signature verification is server-side;
- nonce expires;
- nonce is single-use;
- session is bound to creator wallet;
- session cookie is `HttpOnly`;
- production cookie is `Secure`;
- protected APIs derive creator identity from the session, never from a wallet address supplied in the request body.

---

## 10. Endpoint publishing

### Creator inputs

```text
name
description (optional)
upstream base URL
price per successful request
optional upstream authentication
```

### Generated fields

```text
route ID
public slug
powered URL
creator ID
creator payout wallet
fixed Metron x402 payTo wallet
created timestamp
```

### Current supported HTTP methods

V1 supports:

```text
GET
POST
```

`PUT`, `PATCH`, and `DELETE` are deferred until stronger side-effect idempotency controls exist.

### Example routing

```text
Upstream:
https://example.dev/v1

Powered route:
https://<metron-domain>/p/abc123

Caller:
POST https://<metron-domain>/p/abc123/translate

Upstream:
POST https://example.dev/v1/translate
```

Path and query parameters are preserved.

---

## 11. Upstream credentials

Metron must support private APIs.

A creator may configure one protected upstream auth policy, initially supporting common forms such as:

```text
Authorization: Bearer <secret>
X-API-Key: <secret>
```

Requirements:

- secrets are encrypted before persistence;
- encryption key remains server-side;
- secret values never return from normal read APIs;
- secrets never enter client JavaScript;
- secrets are never written to ordinary logs;
- x402 payment headers are never forwarded upstream;
- decrypted credentials exist only for the duration needed to build the outbound request.

---

## 12. Canonical gateway flow

This is the central Metron contract.

### Step 1 — Route resolution

Caller requests:

```text
GET|POST /p/{slug}/{optional-path}
```

Metron loads the active route.

If not found:

```text
404 ROUTE_NOT_FOUND
```

If disabled:

```text
404 ROUTE_NOT_FOUND
```

No payment challenge is generated for unavailable routes.

### Step 2 — Unpaid request

If no valid `PAYMENT-SIGNATURE` is attached, Metron returns:

```text
HTTP 402 Payment Required
PAYMENT-REQUIRED: <x402 V2 payload>
```

The requirement includes the route price, USDC, Celo Mainnet, and the registered Metron `payTo` wallet.

**Do not create a durable financial receipt for this anonymous 402 challenge.**

Challenge traffic may be counted through ephemeral telemetry/rate-limit infrastructure.

### Step 3 — Signed retry

Caller retries the same resource request with:

```text
PAYMENT-SIGNATURE
```

Metron parses the payload and reconstructs the exact payment requirements for the current route.

### Step 4 — Verification

Metron calls:

```text
POST https://api.x402.celo.org/verify
```

Verification success means only:

```text
VERIFIED
```

It does not mean settled.

If verification fails, upstream work must not run.

### Step 5 — Replay lock

Metron derives a stable authorization/payment identifier and acquires an atomic replay lock.

The payment identifier must also be unique in persistent storage once a verified attempt becomes durable.

A replayed authorization returns:

```text
409 PAYMENT_REPLAY
```

### Step 6 — Durable receipt creation

**The durable call receipt is created only after successful payment verification.**

This prevents anonymous 402 scans from creating unbounded financial rows.

Initial durable payment state:

```text
VERIFIED
```

### Step 7 — Upstream execution

Metron forwards the request to the real upstream API.

Forward:

- allowed HTTP method;
- resolved path;
- query parameters;
- body;
- safe caller headers;
- configured creator upstream credentials.

Strip:

- x402 headers;
- `Host`;
- hop-by-hop transport headers;
- Metron cookies;
- Metron auth headers;
- internal tracing secrets.

### Step 8 — Upstream result

Only upstream HTTP `2xx` is successful paid work in V1.

If the upstream times out or returns non-2xx:

```text
payment state = UPSTREAM_FAILED
x402 /settle is NOT called
creator earning = 0
creator payout = none
```

This is non-settlement, not a refund.

### Step 9 — x402 settlement

After upstream success, Metron calls:

```text
POST https://api.x402.celo.org/settle
```

using the server-side facilitator API key.

On failure:

```text
payment state = SETTLEMENT_FAILED
```

The successful upstream resource is not returned as a successful paid response.

On success:

```text
payment state = SETTLED
```

Persist:

- facilitator response;
- x402 transaction hash;
- settled amount;
- payer when available;
- `payTo`;
- settled timestamp.

### Step 10 — Creator ledger entry

Immediately after durable settlement persistence, create exactly one creator payable linked to the settled receipt.

The payable amount equals the settled route price in USDC base units.

A database uniqueness constraint prevents duplicate earnings for the same call.

### Step 11 — Creator payout attempt

Metron synchronously attempts the creator payout before completing the caller response.

The payout:

```text
registered Metron wallet
→ creator verified wallet
```

uses USDC and carries the assigned Celo attribution tag.

If payout succeeds:

```text
payout state = CONFIRMED
```

Persist the payout transaction hash.

If payout submission/confirmation fails:

```text
payout state = FAILED or PENDING_RETRY
creator outstanding balance remains owed
```

**A payout failure does not invalidate the caller's successful x402 payment.**

Metron must not charge the caller twice and must not re-run the upstream API simply because the creator payout needs retrying.

### Step 12 — Resource delivery

After successful x402 settlement and after the initial creator-payout attempt has completed, return the real upstream response to the caller.

Include:

```text
PAYMENT-RESPONSE
X-METRON-RECEIPT-ID
```

If the creator payout is pending, the caller still receives the resource because their payment successfully settled and the work succeeded.

---

## 13. Settlement and payout state models

Do not overload one status field for two different financial legs.

### x402 payment status

```text
VERIFIED
UPSTREAM_FAILED
SETTLEMENT_FAILED
SETTLED
```

### Creator payout status

```text
NOT_REQUIRED
PENDING
SUBMITTED
CONFIRMED
FAILED
PENDING_RETRY
```

`NOT_REQUIRED` is used only where no external creator payout is legitimate, such as a Metron-owned first-party route whose creator wallet equals the settlement wallet.

Never generate a self-transfer merely to create tagged volume.

---

## 14. Payout retry and reconciliation

Creator payouts are financial liabilities and require explicit recovery behavior.

Requirements:

- payout record is created before sending the transaction;
- one payout record per settled creator payable;
- retries operate on the existing payout record;
- a retry never creates a second creator earning;
- before retrying a submitted transaction, check whether its transaction hash already confirmed;
- use a distributed lock around settlement-wallet transaction submission to avoid nonce collisions;
- payout failures remain visible in operator logs and creator dashboard;
- an operator-only retry mechanism is required before mainnet launch.

The caller request must never be replayed as the payout retry mechanism.

---

## 15. Database model

PostgreSQL/Supabase is authoritative persistent state.

### `developers`

```text
id
wallet_address
created_at
updated_at
```

Constraints:

```text
wallet_address UNIQUE
```

### `proxy_routes`

```text
id
developer_id
slug
name
description
upstream_url
encrypted_upstream_auth
price_micro_usdc
is_active
created_at
updated_at
```

Constraints:

```text
slug UNIQUE
price_micro_usdc > 0
```

The x402 `payTo`, network, asset, and scheme are current product constants and do not need to be creator-editable fields.

### `call_receipts`

```text
id
route_id
developer_id
caller_wallet
payment_identifier
amount_micro_usdc
asset
network
scheme
pay_to
payment_status
upstream_status_code
upstream_latency_ms
x402_tx_hash
facilitator_response
error_code
verified_at
settled_at
created_at
updated_at
```

Constraints:

```text
payment_identifier UNIQUE
x402_tx_hash UNIQUE WHERE NOT NULL
```

Do not store complete upstream response bodies by default.

### `creator_ledger_entries`

```text
id
developer_id
route_id
call_receipt_id
amount_micro_usdc
type
created_at
```

Current `type`:

```text
EARNING
```

Constraints:

```text
call_receipt_id UNIQUE
```

### `payouts`

```text
id
developer_id
call_receipt_id
ledger_entry_id
from_wallet
to_wallet
amount_micro_usdc
status
attribution_tag
tx_hash
attempt_count
last_error
created_at
submitted_at
confirmed_at
updated_at
```

Constraints:

```text
ledger_entry_id UNIQUE
tx_hash UNIQUE WHERE NOT NULL
```

---

## 16. Redis / ephemeral state

Redis/Upstash is not the financial source of truth.

Use it for:

```text
authentication nonces
payment replay locks
settlement-wallet payout mutex
route configuration cache
rate limits
short-lived gateway telemetry
```

Suggested keys:

```text
auth:{nonce}
route:{slug}
payment-lock:{paymentIdentifier}
payout-wallet-lock:{wallet}
ratelimit:{scope}:{identifier}
```

Do not store creator earnings only in Redis.

---

## 17. API surface

### Authentication

```text
POST /api/auth/challenge
POST /api/auth/verify
POST /api/auth/logout
GET  /api/me
```

### Creator routes

```text
POST   /api/endpoints
GET    /api/endpoints
GET    /api/endpoints/:id
PATCH  /api/endpoints/:id
DELETE /api/endpoints/:id
```

### Receipts and payouts

```text
GET /api/transactions
GET /api/transactions/:id
GET /api/payouts
```

### Dashboard stats

```text
GET /api/stats
```

Example response semantics:

```json
{
  "settledCalls": 42,
  "grossEarnedMicroUsdc": "210000",
  "paidOutMicroUsdc": "205000",
  "outstandingMicroUsdc": "5000",
  "activeEndpoints": 3
}
```

### Gateway

```text
GET  /p/:slug/*
POST /p/:slug/*
```

### Operator recovery

An operator-only payout retry endpoint/action is allowed, but it must require a server-side/operator secret or authenticated operator capability and must never be exposed as a public caller endpoint.

---

## 18. Creator dashboard semantics

The existing UI shell must display authoritative state.

### Overview

Show:

```text
settled paid calls
gross earned
paid out
outstanding payout
active endpoints
recent settlements
```

### Endpoint list

Each endpoint displays:

```text
name
powered URL
price
status
settled calls
gross earned
paid out
last paid call
```

### Transaction / receipt detail

Show both financial legs when applicable:

```text
METRON CALL
route
price
network
caller
x402 payTo
x402 status
x402 tx hash
upstream status
creator payout status
creator payout wallet
payout tx hash
attribution tag
```

An x402 settlement and a creator payout are never presented as the same transaction.

### Empty state

If no real activity exists:

```text
0 calls
$0.00 earned
$0.00 paid out
No settlements yet
```

Never seed example transactions into production UI.

---

## 19. SDK / caller integration

Every published route should provide:

- curl example for observing the initial 402 challenge;
- TypeScript x402 V2 example;
- Python x402 V2 example.

Generated snippets must use the route's actual powered URL.

The paid examples should use maintained x402-compatible libraries where practical rather than teaching callers to manually reproduce the complete signature protocol.

---

## 20. Security requirements

### SSRF

Creator-supplied upstream URLs must reject:

- non-HTTPS production URLs;
- localhost;
- loopback IPs;
- private IPv4/IPv6 ranges;
- link-local addresses;
- cloud metadata endpoints;
- URLs with embedded credentials;
- unsupported schemes.

Resolve DNS and reject private/internal destinations before connection.

Do not follow redirects automatically in V1.

### Request boundaries

Initial production defaults:

```text
max caller request body: 1 MiB
max upstream response body: 5 MiB
upstream timeout: 30 seconds
```

Make these configuration constants rather than scattered literals.

### Secrets

Never expose or log:

```text
X402_API_KEY
METRON_SETTLEMENT_PRIVATE_KEY
UPSTREAM_SECRET_ENCRYPTION_KEY
creator upstream secrets
session secrets
full payment signatures unless strictly necessary for secure debugging
```

### Settlement wallet

The registered Metron settlement wallet becomes a hot operational wallet for creator payouts.

Requirements:

- private key only in server-side secret storage;
- never place it in `NEXT_PUBLIC_*`;
- do not commit it;
- restrict operational access;
- maintain only the funds required for the current product;
- maintain enough gas funding to execute creator payouts;
- implement payout idempotency and nonce locking before mainnet traffic.

---

## 21. Attribution requirements

Track 1 attribution applies to genuine creator payout transactions.

Every creator payout must carry:

```text
celo_91fed90b97fc
```

through the official Celo attribution-tag library/mechanism.

If the application has another legitimate attribution code, preserve both using the supported multi-code form.

After the first tagged payout:

1. retain the payout transaction hash;
2. decode/verify attribution using the official tooling;
3. confirm the assigned Metron tag is present;
4. only then mark attribution integration as production-verified.

Do not add a second "mirror" transaction merely because an x402 settlement itself does not carry the hackathon tag.

---

## 22. No-fake-data policy

Production code must not contain runtime behavior that invents:

- earnings;
- route traffic;
- wallet balances;
- x402 payment success;
- transaction hashes;
- payout hashes;
- creator balances;
- API responses;
- analytics history.

If a dependency fails, show a truthful failure state.

If a creator has no activity, show zero.

Unit tests may use fixtures and mocks in isolated test code. Test fixtures must never become production fallback behavior.

---

## 23. Observability

Every verified paid attempt receives:

```text
requestId
receiptId
paymentIdentifier
routeId
developerId
```

Structured logs should capture stage transitions such as:

```text
payment_verified
upstream_started
upstream_succeeded
upstream_failed
settlement_started
settlement_succeeded
settlement_failed
ledger_created
payout_started
payout_submitted
payout_confirmed
payout_failed
response_delivered
```

Record:

- latency;
- status/error code;
- x402 transaction hash when present;
- payout transaction hash when present.

Never log secrets.

A single receipt ID must let an operator reconstruct both financial legs.

---

## 24. Production environment contract

Minimum environment configuration:

```env
DATABASE_URL=

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

SESSION_SECRET=
UPSTREAM_SECRET_ENCRYPTION_KEY=

NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

CELO_CHAIN_ID=42220
CELO_NETWORK=eip155:42220
CELO_USDC_ADDRESS=0xcEBA9300f2b948710d2653dD7B07f33A8B32118C
CELO_RPC_URL=

X402_FACILITATOR_URL=https://api.x402.celo.org
X402_API_KEY=

METRON_SETTLEMENT_WALLET=0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa
METRON_SETTLEMENT_PRIVATE_KEY=
CELO_ATTRIBUTION_TAG=celo_91fed90b97fc
```

`METRON_SETTLEMENT_PRIVATE_KEY` is required only because the current architecture sends creator payout transactions from the registered settlement wallet.

---

## 25. Operational prerequisites

Before the first production paid call:

- production Supabase/Postgres exists;
- migrations have been applied;
- production Redis exists;
- production HTTPS deployment exists;
- Celo RPC works;
- `api.x402.celo.org/health` succeeds;
- `api.x402.celo.org/supported` confirms the expected network/scheme;
- valid `X402_API_KEY` exists;
- facilitator settlement credits are available;
- registered Metron wallet is confirmed as the route `payTo`;
- settlement wallet private key is securely configured for payouts;
- settlement wallet has enough gas funding for payout transactions;
- creator payout attribution implementation is ready;
- one deliberately tiny mainnet payout has verified attribution evidence before general use.

---

## 26. Implementation sequence

Build vertically. Do not rebuild the finished UI shell.

### M0 — Mainnet foundation

Implement/configure:

```text
environment validation
Supabase/Postgres
Redis
Celo Mainnet constants
USDC constants
x402 facilitator client
settlement wallet client
attribution utility
```

Exit evidence:

```text
DB connected
Redis connected
/health works
/supported works
settlement wallet address matches registered wallet
```

### M1 — Real creator identity

Implement:

```text
wallet connection
Celo network gating
auth challenge
signature verification
session
logout
creator persistence
```

Exit evidence:

A real wallet signs in, refreshes, and remains an authenticated creator through the real session.

### M2 — Real endpoint persistence

Implement:

```text
create route
list routes
route detail
update price
enable/disable
delete/retire
encrypted upstream credential support
SSRF validation
```

Exit evidence:

Create a route, refresh the app, and observe the same persisted route.

### M3 — Real x402 challenge

Implement:

```text
gateway route
route lookup
PAYMENT-REQUIRED
correct Celo/USDC/amount
fixed registered Metron payTo
```

Exit evidence:

An unpaid real request returns a valid x402 V2 402 challenge generated from the persisted route.

### M4 — Verification + replay safety

Implement:

```text
PAYMENT-SIGNATURE parsing
/verify
payment identifier
Redis replay lock
durable receipt after successful verify
```

Exit evidence:

A valid signature reaches `VERIFIED`; invalid/replayed payment does not reach the upstream.

### M5 — Real upstream execution

Implement:

```text
GET/POST forwarding
path/query/body preservation
safe headers
secret injection
timeouts
response limits
```

Exit evidence:

A verified call reaches the actual upstream and a forced upstream failure results in no settlement.

### M6 — First real x402 Mainnet settlement

Implement:

```text
/settle
X402_API_KEY
settlement persistence
PAYMENT-RESPONSE
```

Exit evidence:

A deliberately tiny real USDC payment settles to:

```text
0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa
```

and produces real Celo Mainnet evidence.

### M7 — Creator ledger

Implement:

```text
one earning per settled creator call
gross earned
outstanding
idempotent constraints
```

Exit evidence:

The M6 settlement produces exactly one creator earning after refresh.

### M8 — Real tagged creator payout

Implement:

```text
USDC payout
attribution suffix
payout persistence
settlement-wallet nonce lock
confirmation
failure state
retry mechanism
```

Exit evidence:

The creator receives real USDC and the real payout transaction decodes to include:

```text
celo_91fed90b97fc
```

### M9 — Real dashboard

Replace every remaining preview value with:

```text
routes
receipts
gross earned
paid out
outstanding
x402 tx evidence
payout tx evidence
```

Exit evidence:

The M6/M8 transactions appear correctly after a full refresh.

### M10 — External agent/client

Run a real x402-compatible external client against Metron.

Exit evidence:

```text
request
→ 402
→ sign
→ retry
→ verify
→ upstream
→ x402 settle
→ creator payout
→ real response
```

### M11 — Hardening

Complete:

```text
SSRF tests
replay tests
concurrent payout tests
settlement failure tests
payout failure/retry tests
secret redaction
rate limits
observability
production build/typecheck/lint
```

---

## 27. Required acceptance tests

### A. End-to-end success

Metron is not complete until this exact sequence succeeds on Celo Mainnet:

1. Creator connects a real wallet.
2. Creator proves wallet ownership.
3. Creator publishes a real HTTPS API endpoint.
4. Creator sets a real USDC price.
5. Route persists in PostgreSQL.
6. Metron returns a powered URL.
7. External caller requests it without payment.
8. Metron returns HTTP 402 + `PAYMENT-REQUIRED`.
9. Caller authorizes the exact real USDC amount.
10. Caller retries with `PAYMENT-SIGNATURE`.
11. Metron verifies through `api.x402.celo.org/verify`.
12. Metron creates exactly one durable verified receipt.
13. Metron executes the actual upstream.
14. Upstream returns 2xx.
15. Metron settles through `api.x402.celo.org/settle`.
16. Real USDC reaches the registered Metron settlement wallet.
17. A real x402 transaction hash is persisted.
18. Exactly one creator earning is created.
19. Metron sends the creator's USDC payout.
20. The payout contains `celo_91fed90b97fc`.
21. Creator receives the payout.
22. Real payout transaction hash is persisted.
23. Caller receives the real upstream response and `PAYMENT-RESPONSE`.
24. Dashboard shows the same settlement and payout after refresh.
25. Both explorer links resolve to the real Mainnet transactions.

### B. Upstream failure

```text
valid authorization
→ /verify succeeds
→ upstream fails
→ /settle is never called
→ no creator earning
→ no creator payout
→ receipt = UPSTREAM_FAILED
```

### C. Settlement failure

```text
verify succeeds
→ upstream succeeds
→ /settle fails
→ no creator earning
→ no creator payout
→ paid resource is not reported as successful
→ receipt = SETTLEMENT_FAILED
```

### D. Payout failure

```text
x402 settlement succeeds
→ creator earning exists
→ payout fails
→ caller is not charged again
→ upstream is not re-executed
→ outstanding creator amount remains owed
→ payout becomes retryable
```

### E. Replay

The same payment authorization cannot produce:

- a second upstream execution;
- a second x402 settlement;
- a second creator earning;
- a second payout.

---

## 28. Product and hackathon metrics

### Product metrics

Track from real records:

```text
published endpoints
active endpoints
verified paid attempts
successful settled calls
upstream failure rate
settlement failure rate
gross creator earnings
confirmed creator payouts
outstanding creator balance
payout failure rate
```

### Track 2 metric

```text
count(call_receipts where payment_status = SETTLED
      and pay_to = registered Metron wallet)
```

This is the primary optimization metric.

### Track 1 evidence

Track confirmed tagged creator payout volume:

```text
sum(payouts.amount_micro_usdc
    where status = CONFIRMED
    and attribution_tag = celo_91fed90b97fc)
```

This is evidence of genuine product-generated tagged payout volume.

Do not call this "Metron protocol revenue" while Metron charges a 0% fee.

---

## 29. Claim boundaries

Until behavior is proven, do not claim:

- automatic refunds;
- direct caller-to-creator settlement;
- instant creator payout;
- guaranteed payout;
- zero failures;
- every x402 settlement carries Metron's attribution tag;
- creator funds are non-custodial;
- arbitrary creator wallets count toward Metron's Track 2 wallet.

Correct current language:

```text
The caller's x402 payment settles to Metron's registered settlement wallet.

Metron records the creator earning and routes the corresponding USDC payout to the creator.

Successful Metron creator payout transactions carry the assigned Celo attribution tag.

If upstream work fails before settlement, the x402 payment is not settled.
```

---

## 30. Definition of done

The current Metron scope is complete only when all of the following are true:

- creator authentication is real;
- route persistence is real;
- upstream credentials are encrypted;
- no runtime mock/fallback path remains;
- x402 V2 challenge is real;
- x402 verification is real;
- replay protection works;
- upstream API execution is real;
- x402 Celo Mainnet settlement is real;
- `payTo` is the registered Metron wallet;
- creator ledger is exact and idempotent;
- creator payout is real;
- payout carries and verifies the assigned attribution tag;
- payout failure can be recovered safely;
- dashboard uses only persisted real data;
- external client/agent completes the full flow;
- forced upstream failure creates no settlement;
- forced settlement failure creates no earning/payout;
- repeated authorization cannot double-charge or double-pay;
- real explorer evidence exists for both the x402 settlement and a tagged creator payout.

The final demo should prove one economic action, not merely a dashboard:

> **An external caller paid for a real API call through Metron on Celo; the x402 settlement hit Metron's registered wallet, the real API executed, and the creator received a real attributed payout.**

---

## 31. References

Authoritative implementation references:

- Celo x402 documentation: `https://docs.celo.org/build-on-celo/build-with-ai/x402`
- x402 V2 HTTP 402 documentation: `https://docs.x402.org/core-concepts/http-402`
- x402 Builder Code / ERC-8021 extension: `https://docs.x402.org/extensions/builder-code`
- Celo x402 dashboard: `https://x402.celo.org`
- Celo x402 Mainnet API: `https://api.x402.celo.org`

Project-specific hackathon values remain:

```text
Metron registered settlement wallet:
0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa

Metron assigned attribution tag:
celo_91fed90b97fc
```
