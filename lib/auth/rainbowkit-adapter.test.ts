import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMetronAuthenticationAdapter,
  SIWE_NONCE_GATE,
} from "./rainbowkit-adapter";

const MESSAGE = [
  "localhost wants you to sign in with your Ethereum account:",
  "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa",
  "",
  "Sign in to Metron.",
  "",
  "URI: http://localhost:3000",
  "Version: 1",
  "Chain ID: 42220",
  "Nonce: abcdef",
  "Issued At: 2026-08-09T00:00:00.000Z",
].join("\n");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createMetronAuthenticationAdapter (RainbowKit v2.2.11 contract)", () => {
  it("getNonce resolves to a TRUTHY string (regression: RainbowKit SignIn gate)", async () => {
    // Installed RainbowKit v2.2.11's SignIn disables its button and shows
    // "Preparing message..." forever when getNonce resolves falsy, and
    // refuses to call createMessage (`if (!address || !chainId || !nonce)
    // return;`). An empty nonce caused the browser stall where the modal
    // never reached POST /api/auth/challenge.
    const adapter = createMetronAuthenticationAdapter({
      queryClient: new QueryClient(),
    });

    const nonce = await adapter.getNonce();

    expect(typeof nonce).toBe("string");
    expect(nonce.length).toBeGreaterThan(0);
    expect(nonce).toBe(SIWE_NONCE_GATE);
  });

  it("createMessage POSTs address+chainId to /api/auth/challenge and returns the server message", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        address?: string;
        chainId?: number;
      };
      expect(body.address).toBe("0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa");
      expect(body.chainId).toBe(42220);
      return jsonResponse({ message: MESSAGE });
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createMetronAuthenticationAdapter({
      queryClient: new QueryClient(),
    });
    const message = await adapter.createMessage({
      nonce: SIWE_NONCE_GATE,
      address: "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa",
      chainId: 42220,
    });

    expect(message).toBe(MESSAGE);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/challenge",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("createMessage throws when the challenge route fails", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ error: "WRONG_NETWORK" }, 400));

    const adapter = createMetronAuthenticationAdapter({
      queryClient: new QueryClient(),
    });

    await expect(
      adapter.createMessage({
        nonce: SIWE_NONCE_GATE,
        address: "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa",
        chainId: 1,
      })
    ).rejects.toThrow("Metron challenge failed");
  });

  it("verify returns true on success and invalidates the canonical auth query", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    vi.stubGlobal("fetch", async () =>
      jsonResponse({ authenticated: true, developer: { id: "d1", walletAddress: "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa" } })
    );

    const adapter = createMetronAuthenticationAdapter({ queryClient });
    const result = await adapter.verify({ message: MESSAGE, signature: "0xabc" });

    expect(result).toBe(true);
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["auth", "me"] })
    );
  });

  it("verify returns false on failure without invalidating the query", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    vi.stubGlobal("fetch", async () => jsonResponse({ error: "INVALID_SIGNATURE" }, 400));

    const adapter = createMetronAuthenticationAdapter({ queryClient });
    const result = await adapter.verify({ message: MESSAGE, signature: "0xdead" });

    expect(result).toBe(false);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("signOut POSTs /api/auth/logout and invalidates the canonical auth query", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createMetronAuthenticationAdapter({ queryClient });
    await adapter.signOut();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["auth", "me"] })
    );
  });
});
