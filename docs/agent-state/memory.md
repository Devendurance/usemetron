# Metron — Durable Decisions & Gotchas

Durable engineering decisions and discovered lessons. Not task status.

## Architecture decisions

- `docs/metron-PRD.md` is the single implementation authority; subordinate docs defer to it.
- Production is Celo Mainnet only (`42220`, `eip155:42220`). Never Alfajores/Sepolia in active code.
- x402 V2, scheme `exact`; canonical headers `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`; legacy `X-PAYMENT` is not the contract.
- All x402 payments use the registered Metron `payTo` wallet (`0x21E5…bcDa`) for the hackathon scope.
- The creator payout is a separate, attributed transaction (Track 1) from the x402 settlement (Track 2); they must never be conflated.
- Protocol fee is 0% for the MVP; gross = net.
- Financial values are integer micro-USDC (`bigint`/strings) everywhere; floats are forbidden for money.
- Creator identity is derived exclusively from the authenticated server session — never from client input.
- Upstream credentials are encrypted with AES-256-GCM (Base64 32-byte `UPSTREAM_SECRET_ENCRYPTION_KEY`); plaintext exists only transiently server-side after verification.
- Anonymous 402 challenges create no durable receipts; a `call_receipt` begins only after valid verification.
- Postgres is the durable replay/accounting authority; Redis is fast concurrency (nonces, locks, precheck acceleration).
- Verification does not mean settlement; `/verify` success alone never persists SETTLED or pays creators.
- Upstream must succeed (2xx) before `/settle`; upstream failure → `UPSTREAM_FAILED`, never settle.
- The protected upstream body is delivered only after confirmed settlement (`PAYMENT-RESPONSE` included).
- `SETTLEMENT_PENDING` is intentionally fail-closed: unknown outcomes stay pending for operator reconciliation, never guessed settled and never auto-retried.
- Settlement recovery requires strongly bound onchain evidence (EIP-3009 `AuthorizationUsed` payer+nonce AND same-tx canonical-USDC `Transfer` to the registered wallet for the exact amount AND calldata match where decodable).
- Only SETTLED receipts create an EARNING (UNIQUE `call_receipt_id`).
- Payout destination is always the authenticated creator wallet (SIWE-bound); no arbitrary withdrawal addresses.
- Payout gas (CELO) is not deducted from creator earnings; the promised payout amount is exact.
- Payout transactions carry `celo_91fed90b97fc` via `@celo/attribution-tags` (`toDataSuffix` appended to the ERC-20 transfer calldata; EVM ignores trailing bytes).
- Financial payout confirmation is separate from attribution verification: a proven transfer is CONFIRMED even if attribution decode fails; attribution is reported verified/unverified.
- A non-final payout with a persisted tx hash is never blindly resent; recovery inspects the hash onchain.
- Settlement/payout safety switches (`X402_SETTLEMENT_ENABLED`, `PAYOUTS_ENABLED`) stay false except during intentional manual tests, then return to false.
- `METRON_SETTLEMENT_PRIVATE_KEY` is server-only, never in bundles/logs; the facilitator handles x402 settlement (the key is only for creator payouts).

## Discovered bugs & lessons

1. **RainbowKit v2.2.11 "Preparing message..." stall** — the SIWE adapter's `getNonce` returned `""`; RainbowKit requires a TRUTHY nonce before it will call `createMessage` (its SignIn gate is `if (!address || !chainId || !nonce) return`). Fix: `getNonce` returns a constant `"metron"` gate value; the real server-owned nonce lives inside the challenge message. Also invalidate the auth query on verify success.

2. **Auth Sign Out vs wallet Disconnect** — originally separate actions. Primary Sign Out now destroys the server session, disconnects the wagmi/RainbowKit wallet, and redirects to `/`; the low-level Disconnect control is secondary.

3. **Settled-payment replay reached /verify** — after a payment settled, its consumed EIP-3009 authorization failed facilitator verification with a confusing 502. Fix: the deterministic `paymentIdentifier` is derived BEFORE /verify and checked against durable Postgres; any existing receipt (any state) → `409 PAYMENT_REPLAY` without a facilitator call.

4. **Settlement persistence crash gap** — `/settle` succeeded onchain but a crash before DB persistence left a VERIFIED receipt with no way to discover the settlement. Fix: receipts are durably marked `SETTLEMENT_PENDING` (with non-secret attempt metadata incl. payer/nonce/validBefore) BEFORE the `/settle` call; recovery reconciles.

5. **Recovery over-trusted AuthorizationUsed alone** — payer+nonce consumption doesn't prove Metron received USDC. Fix: same-transaction binding to the canonical-USDC Transfer (to = registered wallet, exact amount) plus calldata match; conflicts stay pending.

6. **First payout falsely marked FAILED** — the live receipt poller (`waitForReceipt`) returned `txTo: null`, so the evidence validator rejected every success as `wrong_token`. Fix: financial confirmation is keyed to the canonical-USDC Transfer event (self-authoritative); `txTo` is corroboration only; recovery also reconciles FAILED rows that carry a tx hash. The real payout was repaired to CONFIRMED without resending.

7. **Upstash Redis auto-parses JSON** — `redis.get` returns already-parsed objects for JSON values; session records must accept both string and object forms (session.ts regression test covers this).

8. **viem strict address checks** — the PRD's USDC literal `0xcEBA…` is not EIP-55-checksummed; viem's `isAddress` rejects it and `getAddress` normalizes it to `0xcebA9300…`. Always normalize with `getAddress`; tests use the checksummed form.

9. **Next.js env inlining** — client code must use static `process.env.NEXT_PUBLIC_*` access; dynamic access is not inlined and silently evaluates to `""` in the browser (WalletConnect project id fix).

10. **Celo USDC uses the split-signature EIP-3009 selector** — `transferWithAuthorization(…,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)` = `0xe3ee160e` (not the single-signature `0xeb46e437`); recovery decodes via the official `@x402/evm` `eip3009ABI`.

11. **BigInt literals** — `tsconfig` targets ES2017; `0n`/`10n` literals fail typecheck. Use `BigInt(0)` etc.
