/**
 * Pure client-safe formatting helpers for wallet UI.
 *
 * No wallet, network, or server dependencies: safe to import anywhere and
 * unit-testable in isolation.
 */

/**
 * Truncates an EVM address for compact UI display, e.g. `0x1234…abcd`
 * (first 6 chars + last 4 chars). Passes short strings through unchanged.
 */
export function formatWalletAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
