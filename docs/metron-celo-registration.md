# Metron Celo Registration

## Registered Details

| Field | Value |
|---|---|
| Product name | Metron |
| Public GitHub repository | [Devendurance/usemetron](https://github.com/Devendurance/usemetron) |
| Registration status | Draft; not published |
| Attribution tag | `celo_91fed90b97fc` |
| Builder name | Endurance Udoh |
| X handle | `@devendyyy` |
| Agent wallet | `0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa` |
| Telegram username | `@devendurance` |

## Transaction Attribution

The assigned attribution tag must be included in every transaction sent by the agent. It is used to attribute tagged Celo volume to Metron for the hackathon leaderboards, including **Most Revenue Generated**. Do not replace it with a self-derived tag.

For a transaction with no existing attribution code:

```ts
import { toDataSuffix } from '@celo/attribution-tags'

await wallet.sendTransaction({
  to,
  value,
  data: toDataSuffix('celo_91fed90b97fc'),
})
```

If the app already uses its own attribution code, preserve both codes:

```ts
const data = toDataSuffix(['your_existing_code', 'celo_91fed90b97fc'])
```

For **Most x402 Payments**, route successful pay-per-request payments through the Celo x402 facilitator at `https://x402.celo.org` and ensure the resulting transactions carry the assigned tag. After the first tagged transaction, decode it with `verifyTx` from `@celo/attribution-tags` and confirm that `celo_91fed90b97fc` is present.

Keep the agent wallet above as the registered `payTo` or transaction wallet and retain transaction hashes as evidence for the submission.
