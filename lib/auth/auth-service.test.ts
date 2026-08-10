import { describe, expect, it } from "vitest";
import { getAddress, recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { CELO_CHAIN_ID } from "../celo/config";
import {
  AuthError,
  createAuthService,
  toAuthErrorResponse,
  type AuthService,
  type AuthServiceDeps,
} from "./auth-service";
import { createNonceService, type NonceStore } from "./nonce";
import { createSessionService, type SessionStore } from "./session";
import { buildSiweMessage, validateSiweMessageFields, type SiweContext } from "./siwe";

const CONTEXT: SiweContext = { domain: "app.metron.dev", uri: "https://app.metron.dev" };

// Well-known test accounts; used only inside tests.
const SIGNER = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
);
const OTHER_SIGNER = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);
const WALLET = getAddress(SIGNER.address);

class FakeNonceStore implements NonceStore {
  values = new Map<string, string>();

  async set(key: string, value: string, opts?: { ex?: number }): Promise<void> {
    void opts;
    this.values.set(key, value);
  }

  async getdel(key: string): Promise<string | null> {
    const value = this.values.get(key);
    this.values.delete(key);
    return value ?? null;
  }
}

class FakeSessionStore implements SessionStore {
  values = new Map<string, string>();

  async set(key: string, value: string, opts?: { ex?: number }): Promise<void> {
    void opts;
    this.values.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function createDeveloperRepo() {
  const upserts: `0x${string}`[] = [];
  return {
    upserts,
    upsertByWallet: async (wallet: `0x${string}`) => {
      upserts.push(wallet);
      return { id: "dev-0001", walletAddress: wallet };
    },
  };
}

/** Pure EOA-only verifier: recovers the signer locally, no RPC required. */
async function recoverAddressVerifier(params: {
  message: string;
  signature: string;
  address: string;
}): Promise<boolean> {
  try {
    const recovered = await recoverMessageAddress({
      message: params.message,
      signature: params.signature as `0x${string}`,
    });
    return getAddress(recovered) === getAddress(params.address);
  } catch {
    return false;
  }
}

function buildSiweDeps() {
  return {
    buildMessage: (params: { address: `0x${string}`; nonce: string; issuedAt?: Date }) =>
      buildSiweMessage({ ...params, context: CONTEXT }),
    validateFields: (
      message: string,
      expected: { chainId: number; nonce?: string }
    ) =>
      validateSiweMessageFields(message, {
        ...CONTEXT,
        chainId: expected.chainId,
        nonce: expected.nonce,
      }),
    verifySignature: recoverAddressVerifier,
  };
}

function createTestAuth() {
  const nonceStore = new FakeNonceStore();
  const sessionStore = new FakeSessionStore();
  const developers = createDeveloperRepo();
  const deps: AuthServiceDeps = {
    nonceService: createNonceService(nonceStore),
    sessionService: createSessionService(sessionStore, "test-secret"),
    developers,
    siwe: buildSiweDeps(),
  };
  return { auth: createAuthService(deps), nonceStore, sessionStore, developers };
}

async function signValidMessage(auth: AuthService, address: string = WALLET) {
  const { message } = await auth.challenge({ address, chainId: CELO_CHAIN_ID });
  const signature = await SIGNER.signMessage({ message });
  return { message, signature };
}

describe("challenge", () => {
  it("returns a SIWE-compatible nonce and a signable message", async () => {
    const { auth } = createTestAuth();

    const { nonce, message } = await auth.challenge({
      address: WALLET,
      chainId: CELO_CHAIN_ID,
    });

    expect(nonce).toMatch(/^[a-zA-Z0-9]{8,}$/);
    expect(message).toContain(`${CONTEXT.domain} wants you to sign in`);
    expect(message).toContain(`Nonce: ${nonce}`);
    expect(message).toContain(`Chain ID: ${CELO_CHAIN_ID}`);
  });

  it("rejects a wrong chain id with WRONG_NETWORK", async () => {
    const { auth } = createTestAuth();

    await expect(
      auth.challenge({ address: WALLET, chainId: 1 })
    ).rejects.toMatchObject({
      code: "WRONG_NETWORK",
      status: 400,
      details: { expectedChainId: CELO_CHAIN_ID },
    });
  });

  it("rejects an invalid address with INVALID_ADDRESS", async () => {
    const { auth } = createTestAuth();

    await expect(
      auth.challenge({ address: "0x123", chainId: CELO_CHAIN_ID })
    ).rejects.toMatchObject({ code: "INVALID_ADDRESS", status: 400 });
  });
});

describe("verify", () => {
  it("accepts a valid SIWE message, upserts the developer, and returns a session token", async () => {
    const { auth, developers } = createTestAuth();
    const { message, signature } = await signValidMessage(auth);

    const result = await auth.verify({ message, signature });

    expect(result.developer).toEqual({ id: "dev-0001", walletAddress: WALLET });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(developers.upserts).toEqual([WALLET]);
  });

  it("upserts the developer under the checksummed address regardless of input casing", async () => {
    const { auth, developers } = createTestAuth();
    const { message, signature } = await signValidMessage(auth, WALLET.toLowerCase());

    await auth.verify({ message, signature });

    expect(developers.upserts).toEqual([WALLET]);
  });

  it("rejects an invalid signature with INVALID_SIGNATURE", async () => {
    const { auth } = createTestAuth();
    const { message } = await auth.challenge({ address: WALLET, chainId: CELO_CHAIN_ID });
    const signature = await OTHER_SIGNER.signMessage({ message });

    await expect(auth.verify({ message, signature })).rejects.toMatchObject({
      code: "INVALID_SIGNATURE",
      status: 400,
    });
  });

  it("rejects a message for the wrong chain with WRONG_CHAIN", async () => {
    const { auth } = createTestAuth();
    const { message } = await auth.challenge({ address: WALLET, chainId: CELO_CHAIN_ID });
    const tampered = message.replace(`Chain ID: ${CELO_CHAIN_ID}`, "Chain ID: 11142220");
    const signature = await SIGNER.signMessage({ message: tampered });

    await expect(auth.verify({ message: tampered, signature })).rejects.toMatchObject({
      code: "WRONG_CHAIN",
      status: 400,
    });
  });

  it("rejects a message for the wrong domain with WRONG_DOMAIN", async () => {
    const { auth } = createTestAuth();
    const { message } = await auth.challenge({ address: WALLET, chainId: CELO_CHAIN_ID });
    const tampered = message.replace(`${CONTEXT.domain} wants`, "evil.example.com wants");
    const signature = await SIGNER.signMessage({ message: tampered });

    await expect(auth.verify({ message: tampered, signature })).rejects.toMatchObject({
      code: "WRONG_DOMAIN",
      status: 400,
    });
  });

  it("rejects a message for the wrong uri with WRONG_URI", async () => {
    const { auth } = createTestAuth();
    const { message } = await auth.challenge({ address: WALLET, chainId: CELO_CHAIN_ID });
    const tampered = message.replace(`URI: ${CONTEXT.uri}`, "URI: https://evil.example.com");
    const signature = await SIGNER.signMessage({ message: tampered });

    await expect(auth.verify({ message: tampered, signature })).rejects.toMatchObject({
      code: "WRONG_URI",
      status: 400,
    });
  });

  it("rejects an expired message with EXPIRED_MESSAGE", async () => {
    const { auth } = createTestAuth();
    const { nonce } = await auth.challenge({ address: WALLET, chainId: CELO_CHAIN_ID });
    const message = buildSiweMessage({
      address: WALLET,
      nonce,
      issuedAt: new Date(Date.now() - 10 * 60_000),
      context: CONTEXT,
    });
    const signature = await SIGNER.signMessage({ message });

    await expect(auth.verify({ message, signature })).rejects.toMatchObject({
      code: "EXPIRED_MESSAGE",
      status: 400,
    });
  });

  it("rejects an unknown nonce with UNKNOWN_NONCE", async () => {
    const { auth } = createTestAuth();
    const message = buildSiweMessage({
      address: WALLET,
      nonce: "fakenonce123456",
      context: CONTEXT,
    });
    const signature = await SIGNER.signMessage({ message });

    await expect(auth.verify({ message, signature })).rejects.toMatchObject({
      code: "UNKNOWN_NONCE",
      status: 400,
    });
  });

  it("rejects a replayed message (nonce already consumed) with UNKNOWN_NONCE", async () => {
    const { auth } = createTestAuth();
    const { message, signature } = await signValidMessage(auth);

    await auth.verify({ message, signature });

    await expect(auth.verify({ message, signature })).rejects.toMatchObject({
      code: "UNKNOWN_NONCE",
      status: 400,
    });
  });

  it("propagates storage failures truthfully (route layer maps them to 500)", async () => {
    const deps: AuthServiceDeps = {
      nonceService: createNonceService(new FakeNonceStore()),
      sessionService: createSessionService(new FakeSessionStore(), "test-secret"),
      developers: {
        upsertByWallet: async () => {
          throw new Error("redis is down");
        },
      },
      siwe: buildSiweDeps(),
    };
    const auth = createAuthService(deps);
    const { message, signature } = await signValidMessage(auth);

    await expect(auth.verify({ message, signature })).rejects.toThrow("redis is down");
  });
});

describe("me", () => {
  it("returns the developer for a valid session token", async () => {
    const { auth } = createTestAuth();
    const { message, signature } = await signValidMessage(auth);
    const { token } = await auth.verify({ message, signature });

    await expect(auth.me(token)).resolves.toEqual({
      authenticated: true,
      developer: { id: "dev-0001", walletAddress: WALLET },
    });
  });

  it("returns unauthenticated for an unknown token", async () => {
    const { auth } = createTestAuth();

    await expect(auth.me("bogus-token")).resolves.toEqual({ authenticated: false });
  });

  it("returns unauthenticated when no token is provided", async () => {
    const { auth } = createTestAuth();

    await expect(auth.me(undefined)).resolves.toEqual({ authenticated: false });
  });
});

describe("logout", () => {
  it("deletes the session so me() becomes unauthenticated", async () => {
    const { auth } = createTestAuth();
    const { message, signature } = await signValidMessage(auth);
    const { token } = await auth.verify({ message, signature });

    await auth.logout(token);

    await expect(auth.me(token)).resolves.toEqual({ authenticated: false });
  });

  it("is idempotent and tolerates a missing token", async () => {
    const { auth } = createTestAuth();

    await expect(auth.logout(undefined)).resolves.toBeUndefined();
    await expect(auth.logout("some-token")).resolves.toBeUndefined();
  });
});

describe("toAuthErrorResponse", () => {
  it("maps an AuthError to its status, code, and details", () => {
    const { status, payload } = toAuthErrorResponse(
      new AuthError("WRONG_NETWORK", 400, { expectedChainId: CELO_CHAIN_ID })
    );

    expect(status).toBe(400);
    expect(payload).toEqual({ error: "WRONG_NETWORK", expectedChainId: CELO_CHAIN_ID });
  });

  it("maps unknown errors to 500 INTERNAL without leaking internals", () => {
    const { status, payload } = toAuthErrorResponse(
      new Error("postgres connection refused: 10.0.0.5:5432")
    );

    expect(status).toBe(500);
    expect(payload).toEqual({ error: "INTERNAL" });
  });
});
