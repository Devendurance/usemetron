# Metron

Metron is intended to turn callable API requests into paid work through x402 V2 on Celo Mainnet.

> **Turn API calls into paid work.**
>
> **One call. One price. One settlement.**

## Current State

The repository currently contains a UI shell and presentation previews. Production API routes, wallet authentication, PostgreSQL/Supabase persistence, Redis, x402 integration, Celo Mainnet provider configuration, USDC payment handling, `payTo` routing, attribution runtime, and transaction persistence are not implemented yet.

Preview states must never be presented as real payments, earnings, transactions, or settlement evidence.

## Canonical Target

- Celo Mainnet, chain ID `42220`, CAIP-2 `eip155:42220`.
- x402 V2 with the `exact` scheme.
- USDC with 6 decimals at `0xcEBA9300f2b948710d2653dD7B07f33A8B32118C`.
- Facilitator API: `https://api.x402.celo.org`.
- Dashboard: `https://x402.celo.org`.

The authoritative implementation specification is [`docs/metron-PRD.md`](docs/metron-PRD.md).

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` during local UI work. Local preview behavior is not production payment behavior.

## Documentation

- [Authoritative implementation PRD](docs/metron-PRD.md)
- [System architecture and database target](docs/system-architecture-and-database-schema.md)
- [Mainnet build plan](docs/build-plan.md)
- [Brand messaging](docs/brand-messaging.md)
- [Registered Celo project details](docs/metron-celo-registration.md)
- [Product idea and scope](docs/metron-product-idea.md)
- [Pre-mainnet PRD archive](docs/archive/metron-PRD-pre-mainnet.md)

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

### M0 mainnet foundation

```bash
npm run verify:foundation
```

The foundation verification script safely proves the configured mainnet
foundation without moving funds: environment contract, Celo Mainnet constants,
USDC address, registered settlement wallet, Postgres connectivity, Redis
connectivity, the real x402 facilitator `/health` and `/supported` responses,
the attribution tag utility, and the payout signer address match. It never
calls `/verify` or `/settle`, never creates durable rows, and never prints
secret values.

Environment: copy `.env.example` to `.env` and fill in real values. See
`docs/metron-PRD.md` §24 for the canonical environment contract.
