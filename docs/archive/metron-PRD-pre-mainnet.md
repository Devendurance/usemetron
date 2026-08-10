# Metron Product Requirements Document (PRD)

## 1. Product Overview
- **Product Name:** Metron
- **One-liner and Positioning:** Metron is a zero-code x402 payment gateway that lets any developer turn an API into a paid service in minutes—without billing code, Stripe, or API keys. Callers pay per request using stablecoins on Celo, and developers earn instantly.
- **Core Value Proposition:** Metron abstracts away the billing infrastructure (Stripe, API keys, usage tracking, subscriptions) and replaces it with a simple gateway. A creator registers their API endpoint, sets a per-request price, and gets a "powered URL". AI agents or humans can then call this URL, pay the required amount via Celo's x402 facilitator, and get the response, enabling true machine-to-machine micropayments.

## 2. User Personas

### API Creator (Seller)
- **Profile:** An indie developer, AI researcher, or data provider who has built a useful API (e.g., translation, data feed, image processing).
- **Goals:** To monetize their API quickly and start earning without writing complex billing infrastructure.
- **Pain Points:** 
  - Integrating Stripe takes weeks.
  - API key management and quota tracking is tedious.
  - Global payouts are difficult due to country restrictions.
  - Traditional payment floors (~$0.30) make micropayments unviable.
- **Success Metrics:** Time to first paid request is < 5 minutes. Consistent, real-time stablecoin payouts to their Celo wallet.

### API Consumer / AI Agent (Buyer)
- **Profile:** An autonomous AI agent or a developer needing to consume external APIs on demand.
- **Goals:** To reliably discover and authorize small payments for API capabilities without needing a credit card or subscription account.
- **Pain Points:** 
  - Cannot sign up for traditional subscriptions or handle credit card checkouts.
  - Difficult to handle API keys securely across multiple third-party services.
- **Success Metrics:** Successfully completing an HTTP request via the x402 payment flow with predictable pricing and latency.

## 3. User Stories & Acceptance Criteria

### Creator Stories
- **As a creator, I can connect my Celo wallet.**
  - *Acceptance Criteria:* User clicks "Connect Wallet", RainbowKit modal appears, user signs message, wallet address is saved to session/database.
- **As a creator, I can register an API endpoint with a price.**
  - *Acceptance Criteria:* User enters a valid upstream URL (e.g., `https://api.example.com/data`) and a price in USD/Stablecoin. The system validates the URL and saves it to the DB.
- **As a creator, I can see a powered proxy URL for my endpoint.**
  - *Acceptance Criteria:* After registration, the UI displays a unique Metron URL (e.g., `https://metron.network/p/abc123/data`) that the creator can copy.
- **As a creator, I can view my earnings and transaction history.**
  - *Acceptance Criteria:* Dashboard shows total earnings (sum of completed transactions) and a table of recent transactions (timestamp, amount, endpoint, status).
- **As a creator, I can toggle endpoints on/off.**
  - *Acceptance Criteria:* UI has a switch to disable an endpoint. When disabled, proxy requests immediately return a 404 or 403.
- **As a creator, I can set pricing (flat rate per request).**
  - *Acceptance Criteria:* User can update the price for an active endpoint via the dashboard. Subsequent requests reflect the new price in the 402 challenge.

### Consumer/Agent Stories
- **As a consumer, I can call a Metron-powered URL and receive a 402 challenge.**
  - *Acceptance Criteria:* Making a standard GET/POST request without payment headers returns HTTP 402 Payment Required. The response includes x402 payment requirements (price, currency, destination wallet, nonce).
- **As a consumer, I can pay via x402 (X-PAYMENT header) and get the API response.**
  - *Acceptance Criteria:* The consumer signs the transaction, provides the transaction receipt in the `X-Payment` header, and receives the upstream API's 200 OK response with the actual data.
- **As a consumer, I receive a payment receipt in response headers.**
  - *Acceptance Criteria:* Successful responses include headers indicating the payment was successfully settled (e.g., `X-Payment-Status: settled`).
- **As a consumer, I am NOT charged if the upstream API fails.**
  - *Acceptance Criteria:* If the upstream API returns a 5xx error or times out, the Metron gateway does not capture/settle the escrowed payment, and the consumer's funds are safe or refunded as per x402 spec.

### System Stories
- **The gateway verifies payments via x402.celo.org/verify.**
  - *Acceptance Criteria:* The proxy engine calls the Celo x402 verify endpoint to ensure the transaction in the `X-Payment` header is valid and covers the endpoint price.
- **The gateway only settles via x402.celo.org/settle AFTER upstream returns 2xx.**
  - *Acceptance Criteria:* The settlement API is only called upon a successful HTTP status code from the target upstream server.
- **All settlements include @celo/attribution-tags (ERC-8021).**
  - *Acceptance Criteria:* The on-chain transaction or settlement call includes the appropriate attribution tag for the Metron protocol.
- **Nonces are tracked to prevent replay attacks.**
  - *Acceptance Criteria:* Each proxy request generates a unique nonce (stored in Redis). A transaction using a consumed nonce is rejected.
- **Failed upstream calls do NOT trigger settlement.**
  - *Acceptance Criteria:* If the proxy receives a 4xx or 5xx from the upstream, it returns the error to the client without calling the settle endpoint.

## 4. Functional Requirements

- **Wallet Connection:** Use RainbowKit and Wagmi to support Celo Mainnet and Alfajores Testnet wallet connections. Create a session securely.
- **Endpoint Registration Flow:** A form in the dashboard to input: Name, Upstream URL, Price. Generates a unique short slug (e.g., nanoid).
- **Proxy Gateway Engine (The Hot Path):** 
  - Intercepts requests to `/p/:slug/*`.
  - Looks up the endpoint configuration in DB/Redis.
  - If no `X-Payment` header, generates a nonce, saves to Redis (TTL 5 mins), and returns HTTP 402.
  - If `X-Payment` header exists, validates it against `x402.celo.org/verify`.
  - Proxies the exact request (headers, body, method) to the upstream URL.
  - If upstream succeeds (2xx), calls `x402.celo.org/settle` and returns the upstream response to the client.
- **Attribution Tagging:** Implement ERC-8021 tagging by appending the protocol ID/tag in the transaction data field or through the x402 facilitator payload.
- **Dashboard:** Protected route showing the user's registered endpoints, total revenue, and a list of transactions mapped to their wallet address.
- **SDK Snippet Generation:** For each endpoint, provide a UI tab showing how to call the API in `cURL`, `TypeScript`, and `Python` (showing how to handle the 402 challenge).

## 5. Non-Functional Requirements

- **Performance:** Proxy latency overhead should be <200ms (excluding upstream response time and blockchain verification time). Use edge-compatible runtimes or fast Node.js endpoints with Redis caching.
- **Security:** 
  - Nonces must be strictly single-use to prevent replay attacks.
  - Validations on the upstream URL to prevent SSRF (Server-Side Request Forgery).
- **Reliability:** Graceful error handling if `x402.celo.org` is unreachable (return 502 Bad Gateway to consumer).
- **Scalability:** The hot path (proxy engine) should rely on Redis for fast lookups rather than querying PostgreSQL synchronously on every request.

## 6. API Contract

### `POST /api/endpoints` - Register endpoint
**Request:**
```typescript
{
  name: string;
  upstreamUrl: string;
  priceUsd: number;
}
```

**Response:**
```typescript
{
  id: string;
  slug: string;
  name: string;
  upstreamUrl: string;
  priceUsd: number;
  proxyUrl: string; // e.g., https://metron.network/p/slug
}
```

### `GET /api/endpoints` - List creator's endpoints
**Response:**
```typescript
Array<{
  id: string;
  slug: string;
  name: string;
  priceUsd: number;
  isActive: boolean;
  proxyUrl: string;
  createdAt: string;
}>
```

### `PATCH /api/endpoints/:id` - Update endpoint
**Request:**
```typescript
{
  priceUsd?: number;
  isActive?: boolean;
}
```

### `DELETE /api/endpoints/:id` - Remove endpoint
**Response:** `204 No Content`

### `GET /api/transactions` - List transactions
**Response:**
```typescript
Array<{
  id: string;
  endpointId: string;
  amountUsd: number;
  status: 'settled' | 'failed' | 'pending';
  txHash: string;
  createdAt: string;
}>
```

### `GET /api/stats` - Earnings summary
**Response:**
```typescript
{
  totalEarningsUsd: number;
  totalRequests: number;
  activeEndpoints: number;
}
```

### `ANY /p/:slug/*` - Proxy Gateway
**Request Headers:**
- (Optional on first call) `X-Payment: <transaction_payload>`

**Response (402 Payment Required):**
```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "error": "Payment Required",
  "price": 0.05,
  "currency": "cUSD",
  "destination": "0x1234...",
  "nonce": "n_abc123"
}
```

**Response (200 OK - After valid payment):**
*(Returns exactly what the upstream API returns)*
```http
HTTP/1.1 200 OK
X-Payment-Status: settled
Content-Type: application/json

{
  "data": "upstream payload"
}
```

## 7. Tech Stack
- **Frontend & Backend API:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Database:** Drizzle ORM + PostgreSQL (Supabase)
- **Caching & Rate Limiting:** Redis (Upstash)
- **Web3 Integration:** Wagmi + Viem + RainbowKit
- **Network:** Celo L2 (Chain ID: 42220 mainnet, 44787 Alfajores testnet)
- **Payments:** x402.celo.org facilitator
- **Attribution:** `@celo/attribution-tags` (ERC-8021)
- **UI Components:** Shadcn UI + Tailwind CSS

## 8. Hackathon MVP Scope
### IN Scope (Must-have for demo)
- Connect wallet via RainbowKit.
- Register an endpoint and set a flat price.
- Generate a powered proxy URL.
- Handle HTTP 402 challenge dynamically via the proxy.
- Verify payment via Celo x402 facilitator.
- Proxy the request and return the result ONLY after verification.
- Basic creator dashboard showing endpoints and total earnings.
- Ensure failed upstream calls do not capture payment.

### OUT of Scope (Defer)
- API marketplace / discovery portal.
- Subscriptions or token-based LLM billing (keep it flat-rate for MVP).
- Custom domains for creators.
- Multi-chain routing.
- Advanced analytics or graphical charts.

## 9. Success Metrics
- **Functional:** At least 1 API successfully monetized end-to-end on testnet/mainnet.
- **Transactions:** Real x402 transactions settled on the Celo network.
- **Demo Flow:** An AI agent script calls the endpoint → receives 402 → pays via smart contract/facilitator → gets response → creator sees earnings update instantly on the dashboard.
