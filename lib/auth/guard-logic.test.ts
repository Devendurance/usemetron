import { describe, expect, it } from "vitest";

import {
  resolveAuthStatus,
  walletMismatchKey,
} from "./guard-logic";

const WALLET_A = "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa";
const WALLET_B = "0x0d74D5Cefd2e7F24E623330ebE3d8D4cB45fFB48";

describe("walletMismatchKey — automatic logout condition", () => {
  it("unauthenticated + no connected wallet → no logout", () => {
    expect(
      walletMismatchKey({ authStatus: "unauthenticated" })
    ).toBeNull();
  });

  it("unauthenticated + connected wallet → no logout (SIWE flow must be allowed)", () => {
    expect(
      walletMismatchKey({
        authStatus: "unauthenticated",
        connectedAddress: WALLET_A,
      })
    ).toBeNull();
  });

  it("unauthenticated + connected wallet + no session → no logout", () => {
    expect(
      walletMismatchKey({
        authStatus: "unauthenticated",
        connectedAddress: WALLET_A,
        sessionWalletAddress: null,
      })
    ).toBeNull();
  });

  it("authenticated wallet A + connected wallet A → no logout", () => {
    expect(
      walletMismatchKey({
        authStatus: "authenticated",
        connectedAddress: WALLET_A,
        sessionWalletAddress: WALLET_A,
      })
    ).toBeNull();
  });

  it("authenticated wallet A + connected wallet A in different casing → no logout", () => {
    expect(
      walletMismatchKey({
        authStatus: "authenticated",
        connectedAddress: WALLET_A.toLowerCase(),
        sessionWalletAddress: WALLET_A,
      })
    ).toBeNull();
  });

  it("authenticated wallet A + connected wallet B → logout (once per key)", () => {
    const key = walletMismatchKey({
      authStatus: "authenticated",
      connectedAddress: WALLET_B,
      sessionWalletAddress: WALLET_A,
    });
    expect(key).not.toBeNull();
    // Repeated evaluations return the same key so the hook can fire the
    // logout exactly once for this mismatch pair.
    expect(
      walletMismatchKey({
        authStatus: "authenticated",
        connectedAddress: WALLET_B,
        sessionWalletAddress: WALLET_A,
      })
    ).toBe(key);
  });

  it("loading auth state + connected wallet → no logout", () => {
    expect(
      walletMismatchKey({
        authStatus: "loading",
        connectedAddress: WALLET_B,
        sessionWalletAddress: WALLET_A,
      })
    ).toBeNull();
  });

  it("authenticated + connected wallet but no session wallet → no logout", () => {
    expect(
      walletMismatchKey({
        authStatus: "authenticated",
        connectedAddress: WALLET_B,
        sessionWalletAddress: null,
      })
    ).toBeNull();
  });

  it("authenticated + session wallet but no connected wallet → no logout", () => {
    expect(
      walletMismatchKey({
        authStatus: "authenticated",
        sessionWalletAddress: WALLET_A,
      })
    ).toBeNull();
  });
});

describe("resolveAuthStatus — RainbowKit status mapping", () => {
  it("maps unresolved query to loading", () => {
    expect(resolveAuthStatus(true, undefined)).toBe("loading");
    expect(resolveAuthStatus(true, { status: "authenticated", developer: { walletAddress: WALLET_A } })).toBe("loading");
  });

  it("maps resolved authenticated query to authenticated", () => {
    expect(
      resolveAuthStatus(false, {
        status: "authenticated",
        developer: { walletAddress: WALLET_A },
      })
    ).toBe("authenticated");
  });

  it("maps resolved unauthenticated query to unauthenticated", () => {
    expect(
      resolveAuthStatus(false, { status: "unauthenticated", developer: null })
    ).toBe("unauthenticated");
  });

  it("maps failed/absent query data to unauthenticated (never loading forever)", () => {
    expect(resolveAuthStatus(false, undefined)).toBe("unauthenticated");
  });
});
