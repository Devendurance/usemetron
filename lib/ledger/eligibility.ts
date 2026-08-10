/**
 * Creator-earning eligibility rules (pure).
 *
 * Only a SETTLED creator call earns. Protocol fee is 0% for the MVP, so
 * gross = net = the settled route amount in integer micro-USDC.
 */

export type SettledEligibleReceipt = {
  id: string;
  developerId: string;
  routeId: string;
  paymentStatus: string;
  amountMicroUsdc: number;
};

export function isEarningEligible(receipt: {
  paymentStatus: string;
}): boolean {
  return receipt.paymentStatus === "SETTLED";
}

/** Settled amount → earning amount (protocol fee = 0%). */
export function earningAmountMicroUsdc(receipt: {
  paymentStatus: string;
  amountMicroUsdc: number;
}): number {
  if (!isEarningEligible(receipt)) {
    throw new Error("only SETTLED receipts may create an earning");
  }
  if (!Number.isSafeInteger(receipt.amountMicroUsdc) || receipt.amountMicroUsdc < 0) {
    throw new Error("earning amount must be a non-negative safe integer");
  }
  return receipt.amountMicroUsdc;
}
