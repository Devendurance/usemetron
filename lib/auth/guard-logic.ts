/**
 * Pure wallet/session mismatch logic for the app-wide auth guard.
 *
 * Extracted from `lib/auth/use-auth.ts` so the exact logout condition is
 * unit-testable without a React renderer.
 *
 * Rule (regression-tested): an automatic logout may only be triggered when
 * ALL of the following hold:
 *   - Metron auth status is "authenticated"
 *   - a session wallet exists
 *   - a connected wallet exists
 *   - the normalized connected wallet differs from the normalized session
 *     wallet
 * A merely connected wallet with no authenticated session must NEVER
 * trigger a logout — that would kill the SIWE flow mid-authentication.
 */

export type AuthStatus = "loading" | "unauthenticated" | "authenticated";

export type ResolvedAuthState =
  | { status: "authenticated"; developer: { walletAddress: string } }
  | { status: "unauthenticated"; developer: null };

/**
 * Maps raw `/api/me` query state to the canonical auth status.
 * `isPending` (unresolved) always wins: while the server has not answered,
 * the application is "loading", never "unauthenticated".
 */
export function resolveAuthStatus(
  isPending: boolean,
  data: ResolvedAuthState | undefined
): AuthStatus {
  if (isPending) return "loading";
  return data?.status ?? "unauthenticated";
}

/**
 * Returns the stable mismatch key when an automatic logout is warranted,
 * or null when it is not.
 *
 * The hook uses the returned key to fire the logout exactly once per
 * mismatch pair (repeated evaluations return the same key).
 */
export function walletMismatchKey(input: {
  authStatus: AuthStatus;
  connectedAddress?: string;
  sessionWalletAddress?: string | null;
}): string | null {
  const { authStatus, connectedAddress, sessionWalletAddress } = input;

  // A loading or unauthenticated session must never trigger a logout.
  if (authStatus !== "authenticated") return null;
  // Both wallets must exist before any comparison is possible.
  if (!connectedAddress || !sessionWalletAddress) return null;

  const connected = connectedAddress.toLowerCase();
  const sessionWallet = sessionWalletAddress.toLowerCase();
  // Same wallet (any casing) is not a mismatch.
  if (connected === sessionWallet) return null;

  return `${connected}::${sessionWallet}`;
}
