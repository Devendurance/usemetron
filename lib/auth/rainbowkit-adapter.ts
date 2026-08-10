/**
 * Metron RainbowKit custom-authentication adapter.
 *
 * Client-safe module (no server-only, no secrets). Follows the installed
 * RainbowKit v2.2.11 `AuthenticationAdapter` contract:
 *   getNonce: () => Promise<string>
 *   createMessage: ({ nonce, address, chainId }) => Promise<string>
 *   verify: ({ message, signature }) => Promise<boolean>
 *   signOut: () => Promise<void>
 *
 * SECURITY: all SIWE fields (nonce, chain, domain, URI, issuedAt,
 * expiration) are server-owned. The message returned by `createMessage`
 * comes from POST /api/auth/challenge; the server re-validates every
 * security-critical field during POST /api/auth/verify. Nothing security
 * critical is constructed in browser code.
 */

import type { QueryClient } from "@tanstack/react-query";
import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";

import { AUTH_QUERY_KEY } from "./use-auth";

/**
 * Nonce returned to RainbowKit's `getNonce`.
 *
 * This value exists ONLY to satisfy RainbowKit v2.2.11's SignIn gate, which
 * disables its "Sign message" button (showing "Preparing message..." forever)
 * and refuses to call `createMessage` while the returned nonce is falsy
 * (verified in the installed `SignIn` source: `if (!address || !chainId ||
 * !nonce) return;`). It is never sent to the Metron server and never
 * included in a SIWE message; the authoritative nonce is generated
 * server-side inside the challenge message and validated during verify.
 */
export const SIWE_NONCE_GATE = "metron";

/** Structural type of the adapter returned by the official factory. */
export type MetronAuthenticationAdapter = ReturnType<
  typeof createAuthenticationAdapter<string>
>;

export function createMetronAuthenticationAdapter(deps: {
  queryClient: QueryClient;
}): MetronAuthenticationAdapter {
  const { queryClient } = deps;

  return {
    getNonce: async () => SIWE_NONCE_GATE,

    createMessage: async ({ address, chainId }) => {
      const res = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, chainId }),
      });
      if (!res.ok) throw new Error("Metron challenge failed");
      const data = (await res.json()) as { message?: unknown };
      if (typeof data.message !== "string" || data.message.length === 0) {
        throw new Error("Metron challenge failed");
      }
      return data.message;
    },

    verify: async ({ message, signature }) => {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (res.ok) {
        // The server has set the session cookie; re-read the canonical
        // auth state so RainbowKit and the UI flip to authenticated
        // immediately instead of waiting out the query's staleTime.
        void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      }
      return res.ok;
    },

    signOut: async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  };
}
