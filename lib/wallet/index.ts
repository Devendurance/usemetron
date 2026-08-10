/**
 * Wallet module entry point.
 *
 * NOTE: the server-only payout signer (`settlement-wallet.ts`) is
 * intentionally NOT re-exported here so this index stays importable by
 * client bundles and tests. Import it directly from server code only.
 */

export * from "./validate";
