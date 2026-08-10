"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown } from "lucide-react";
import { useSwitchChain } from "wagmi";

import { useAuth } from "@/lib/auth/use-auth";
import { cn } from "@/lib/utils";
import { METRON_SUPPORTED_CHAIN_ID } from "@/lib/web3/config";
import { formatWalletAddress } from "@/lib/web3/format";

/**
 * Metron web pill (canonical CTA styling per DESIGN.md):
 * full pill, 2px ink border, bold label, 44–48px touch target,
 * lime for action, focus ring on keyboard focus.
 */
const PILL_BASE = cn(
  "inline-flex items-center justify-center gap-2 rounded-pill border-2 border-ink",
  "whitespace-nowrap font-bold text-sm tracking-wide uppercase select-none",
  "transition-colors outline-none focus-visible:shadow-focus",
  "disabled:pointer-events-none disabled:opacity-60"
);

const PILL_SIZE = {
  default: "h-12 px-6",
  compact: "h-11 px-4",
} as const;

const PILL_ACTION = "bg-lime text-ink hover:bg-lime-hover";
const PILL_PAPER = "bg-clear-paper text-ink hover:bg-cream";
const PILL_WARNING = "bg-coral text-ink hover:bg-coral/80";

type ConnectButtonSize = keyof typeof PILL_SIZE;

export function MetronConnectButton({
  size = "default",
}: {
  size?: ConnectButtonSize;
}) {
  const { status } = useAuth();
  const { switchChain } = useSwitchChain();

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openConnectModal,
      }) => {
        // Hydration guard (official RainbowKit pattern): render an inert
        // placeholder of the same size until the client knows the state.
        if (!mounted) {
          return (
            <button
              type="button"
              className={cn(
                PILL_BASE,
                PILL_PAPER,
                PILL_SIZE[size],
                "opacity-60"
              )}
              disabled
              aria-hidden="true"
              tabIndex={-1}
            >
              CONNECT WALLET
            </button>
          );
        }

        const isConnected = account !== undefined;
        const wrongNetwork =
          isConnected &&
          chain !== undefined &&
          (chain.unsupported === true ||
            chain.id !== METRON_SUPPORTED_CHAIN_ID);

        if (!isConnected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className={cn(PILL_BASE, PILL_ACTION, PILL_SIZE[size])}
              aria-label="Connect wallet"
            >
              CONNECT WALLET
            </button>
          );
        }

        if (wrongNetwork) {
          return (
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  void switchChain({ chainId: METRON_SUPPORTED_CHAIN_ID })
                }
                className={cn(PILL_BASE, PILL_WARNING, PILL_SIZE[size])}
                aria-label="Switch to Celo network"
              >
                SWITCH TO CELO
              </button>
              <span className="text-xs font-semibold text-muted-ink">
                Wrong network
              </span>
            </div>
          );
        }

        if (status === "loading") {
          return (
            <button
              type="button"
              className={cn(PILL_BASE, PILL_PAPER, PILL_SIZE[size])}
              disabled
              aria-label="Checking session"
            >
              CHECKING SESSION…
            </button>
          );
        }

        if (status === "authenticated") {
          return (
            <button
              type="button"
              onClick={openAccountModal}
              className={cn(PILL_BASE, PILL_PAPER, PILL_SIZE[size])}
              aria-label="Open wallet menu"
            >
              <span>{formatWalletAddress(account.address)}</span>
              <ChevronDown className="size-4" aria-hidden="true" />
            </button>
          );
        }

        // Connected, correct chain, not authenticated: the connect pill
        // reopens the modal; RainbowKit custom auth runs SIWE afterwards.
        return (
          <button
            type="button"
            onClick={openConnectModal}
            className={cn(PILL_BASE, PILL_ACTION, PILL_SIZE[size])}
            aria-label="Connect wallet"
          >
            CONNECT WALLET
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

/**
 * Compact authenticated-address chip for the dashboard sidebar.
 * Neutral skeleton while loading — no fake state.
 */
export function MetronAccountBadge() {
  const { status, developer } = useAuth();

  if (status === "loading") {
    return (
      <div
        className="h-11 w-32 animate-pulse rounded-pill border-2 border-ink/10 bg-clear-paper"
        aria-hidden="true"
      />
    );
  }

  if (status === "authenticated" && developer !== null) {
    return (
      <div className="inline-flex h-11 items-center gap-2 rounded-pill border-2 border-ink bg-clear-paper px-4 text-sm font-bold text-ink">
        <span
          className="size-2 shrink-0 rounded-full bg-settlement-green"
          aria-hidden="true"
        />
        <span>{formatWalletAddress(developer.walletAddress)}</span>
        <span className="sr-only">Authenticated</span>
      </div>
    );
  }

  return <MetronConnectButton size="compact" />;
}
