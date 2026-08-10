/**
 * Celo explorer link derivation (pure, server-safe).
 *
 * Links are always derived from a real onchain hash — a null hash yields a
 * null link, never a fabricated URL.
 */

/** Blockscout link for a confirmed on-chain transaction. */
export function explorerTxUrl(txHash: string): string {
  return `https://celo.blockscout.com/tx/${txHash}`;
}

/** Null-safe variant for receipts/payouts that never reached the chain. */
export function toExplorerTxUrlOrNull(txHash: string | null): string | null {
  return txHash === null ? null : explorerTxUrl(txHash);
}
