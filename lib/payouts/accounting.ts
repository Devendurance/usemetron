/**
 * Payout accounting semantics (pure, M8.1).
 *
 * Canonical definitions:
 *   paid      = CONFIRMED payout amounts only
 *   reserved  = PENDING + SUBMITTED amounts, plus FAILED-with-tx-hash
 *               amounts still awaiting onchain reconciliation
 *   available = earned - paid - reserved
 *
 * A FAILED row WITHOUT a tx hash releases its reservation (pre-broadcast
 * failure). A FAILED row WITH a tx hash stays reserved: the onchain
 * outcome is unknown until recovery inspects the persisted hash, and the
 * earning can never be reserved or paid again meanwhile.
 */

export type PayoutAccountingRow = {
  status: string;
  txHash: string | null;
  amountMicroUsdc: number;
};

export type PayoutAccounting = {
  paidMicroUsdc: number;
  reservedMicroUsdc: number;
};

export const PAYOUT_STATUS = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  CONFIRMED: "CONFIRMED",
  FAILED: "FAILED",
} as const;

export function computePayoutAccounting(
  rows: PayoutAccountingRow[]
): PayoutAccounting {
  let paidMicroUsdc = 0;
  let reservedMicroUsdc = 0;
  for (const row of rows) {
    if (row.status === PAYOUT_STATUS.CONFIRMED) {
      paidMicroUsdc += row.amountMicroUsdc;
    } else if (
      row.status === PAYOUT_STATUS.PENDING ||
      row.status === PAYOUT_STATUS.SUBMITTED ||
      (row.status === PAYOUT_STATUS.FAILED && row.txHash !== null)
    ) {
      reservedMicroUsdc += row.amountMicroUsdc;
    }
  }
  return { paidMicroUsdc, reservedMicroUsdc };
}
