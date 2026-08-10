"use client";

import {
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { useAuth, useWalletAuthGuard } from "@/lib/auth/use-auth";
import { createMetronAuthenticationAdapter } from "@/lib/auth/rainbowkit-adapter";
import { wagmiConfig } from "@/lib/web3/config";

// Module-level singleton: must never be recreated per render.
const queryClient = new QueryClient();

/**
 * Lives inside the query provider so it can consume `useAuth` and
 * `useQueryClient`; forwards the canonical auth status into RainbowKit,
 * builds the custom-auth adapter (stable identity via useMemo), and mounts
 * the app-wide wallet-switch guard.
 *
 * The SIWE message is constructed server-side (POST /api/auth/challenge)
 * so nonce, domain, URI, chain, and expiry are all server-owned. Signing
 * is authentication only — no transaction, no gas.
 */
function RainbowKitAuthBridge({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { status } = useAuth();
  useWalletAuthGuard();

  const authenticationAdapter = useMemo(
    () => createMetronAuthenticationAdapter({ queryClient }),
    [queryClient]
  );

  return (
    <RainbowKitAuthenticationProvider
      adapter={authenticationAdapter}
      status={status}
    >
      <RainbowKitProvider appInfo={{ appName: "Metron" }}>
        {children}
      </RainbowKitProvider>
    </RainbowKitAuthenticationProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitAuthBridge>{children}</RainbowKitAuthBridge>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
