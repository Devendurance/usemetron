/**
 * Dashboard DTOs (pure — no server-only import so vitest can consume them).
 *
 * View types are the only shape exposed to the dashboard UI: they carry
 * public, formatted data and can never leak facilitator internals
 * (payment_identifier, facilitator_response, signatures).
 */

/** Money is always integer micro-USDC; the *Usdc strings are display only. */
export type DashboardSummary = {
  publishedEndpoints: number;
  activeEndpoints: number;
  settledCalls: number;
  verifiedAttempts: number;
  upstreamFailures: number;
  settlementFailures: number;
  settlementPendingCalls: number;
  payoutFailures: number;
  earnedMicroUsdc: number;
  paidMicroUsdc: number;
  outstandingMicroUsdc: number;
  availableToPayoutMicroUsdc: number;
  reservedMicroUsdc: number;
  earnedUsdc: string;
  paidUsdc: string;
  outstandingUsdc: string;
};

export type TransactionView = {
  id: string;
  routeId: string;
  routeName: string;
  createdAt: string;
  paymentStatus: string;
  amountMicroUsdc: number;
  amountUsdc: string;
  callerWallet: string | null;
  asset: string;
  network: string;
  upstreamStatusCode: number | null;
  upstreamLatencyMs: number | null;
  verifiedAt: string | null;
  settledAt: string | null;
  x402TxHash: string | null;
  errorCode: string | null;
  explorerUrl: string | null;
};

export type PayoutEvidenceView = {
  id: string;
  routeName: string;
  toWallet: string;
  amountMicroUsdc: number;
  amountUsdc: string;
  status: string;
  txHash: string | null;
  attributionTag: string | null;
  createdAt: string;
  submittedAt: string | null;
  confirmedAt: string | null;
  explorerUrl: string | null;
};

export type TransactionDetailView = TransactionView & {
  payout: PayoutEvidenceView | null;
};
