"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAccount, useDisconnect } from "wagmi";

import {
  resolveAuthStatus,
  walletMismatchKey,
  type AuthStatus,
} from "./guard-logic";

/**
 * Canonical Metron authentication state.
 *
 * `/api/me` is the single source of truth for app authentication. These
 * hooks never read localStorage or infer auth from the wallet connection:
 * a connected wallet is NOT an authenticated session.
 */

export type { AuthStatus };

export type Developer = {
  id: string;
  walletAddress: string;
};

type MeResponse =
  | { authenticated: false }
  | { authenticated: true; developer: Developer };

type AuthState =
  | { status: "authenticated"; developer: Developer }
  | { status: "unauthenticated"; developer: null };

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery<AuthState>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/me");
      const data = (await res.json()) as MeResponse;
      if (res.ok && data.authenticated) {
        return { status: "authenticated", developer: data.developer };
      }
      return { status: "unauthenticated", developer: null };
    },
    staleTime: 30_000,
    retry: false,
  });

  const status = resolveAuthStatus(isPending, data);

  return {
    status,
    developer: data?.developer ?? null,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  };
}

export function useLogout() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Logout failed");
    },
    onSuccess: () => {
      // Re-read the authoritative session state after logging out.
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });

  return {
    logout: () => mutation.mutateAsync(),
    isLoggingOut: mutation.isPending,
  };
}

/**
 * The single Sign Out action: destroys the Metron server session, then
 * disconnects the wagmi/RainbowKit wallet, then navigates to the landing
 * page. No separate Disconnect step is required afterwards.
 */
export function useSignOut() {
  const { logout, isLoggingOut } = useLogout();
  const { disconnect } = useDisconnect();
  const router = useRouter();

  return {
    signOut: async () => {
      // Destroy the server session first; if that fails the user is still
      // returned to the landing page rather than trapped in the dashboard.
      try {
        await logout();
      } catch {
        // Session may already be gone; proceed with disconnect + redirect.
      }
      disconnect();
      router.replace("/");
    },
    isSigningOut: isLoggingOut,
  };
}

/**
 * App-wide guard: when the session is authenticated for wallet A but the
 * connected wallet is B, the session is invalidated (logged out) rather
 * than silently moved to the new wallet. Fires exactly once per mismatch
 * pair; does nothing while auth is loading or unauthenticated.
 *
 * The decision logic lives in the pure `walletMismatchKey` helper
 * (lib/auth/guard-logic.ts); this effect only enforces "exactly once".
 */
export function useWalletAuthGuard() {
  const { address } = useAccount();
  const { status, developer } = useAuth();
  const { logout } = useLogout();

  const handledMismatch = useRef<string | null>(null);

  useEffect(() => {
    const mismatchKey = walletMismatchKey({
      authStatus: status,
      connectedAddress: address,
      sessionWalletAddress: developer?.walletAddress,
    });
    if (mismatchKey === null) return;

    if (handledMismatch.current === mismatchKey) return;
    handledMismatch.current = mismatchKey;

    void logout();
  }, [address, status, developer, logout]);
}
