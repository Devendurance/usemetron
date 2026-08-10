/**
 * Client-safe wagmi configuration for Metron.
 *
 * Celo Mainnet only — no Ethereum, Base, Polygon, Alfajores, or Celo
 * Sepolia. The canonical chain constant lives in `lib/celo/config.ts`;
 * this module validates the wagmi chain object against it and refuses to
 * load on mismatch.
 *
 * Connectors are provided via RainbowKit's `connectorsForWallets` (official
 * v2 pattern). RainbowKit v2 sources its wallet list from the wagmi config
 * connectors — without them the connect modal would be empty.
 */

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { celo } from "wagmi/chains";

import { CELO_CHAIN_ID } from "@/lib/celo/config";

if (celo.id !== CELO_CHAIN_ID) {
  throw new Error(
    `wagmi "celo" chain id (${celo.id}) does not match canonical CELO_CHAIN_ID (${CELO_CHAIN_ID})`
  );
}

/** The only network Metron authenticates against. */
export const METRON_SUPPORTED_CHAIN_ID = CELO_CHAIN_ID;

// Static member access is required here: Next.js inlines
// process.env.NEXT_PUBLIC_* into client bundles only for static accesses.
// A dynamic lookup would silently evaluate to "" in the browser.
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
if (walletConnectProjectId === "") {
  throw new Error(
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not configured; refusing to start with an empty WalletConnect project id"
  );
}

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      // v2.2.11 `WalletList` takes the wallet factory functions; RainbowKit
      // invokes them with the merged params (projectId, metadata, etc.).
      wallets: [walletConnectWallet, injectedWallet],
    },
  ],
  { appName: "Metron", projectId: walletConnectProjectId }
);

export const wagmiConfig = createConfig({
  chains: [celo],
  connectors,
  transports: { [celo.id]: http("https://forno.celo.org") },
  ssr: true,
});
