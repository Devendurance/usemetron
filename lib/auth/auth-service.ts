/**
 * SIWE authentication orchestrator (challenge / verify / session lifecycle).
 *
 * Pure orchestration: every dependency (nonce store, session store,
 * developer repository, SIWE primitives) is injected, which makes this
 * module fully unit-testable. It deliberately contains NO `server-only`
 * import and NO direct `process.env` access; production wiring lives in
 * `lib/auth/service.ts`.
 *
 * Error contract: expected client mistakes throw `AuthError` (mapped to
 * 4xx by the API routes). Redis/DB/SIWE-infrastructure failures propagate
 * as raw exceptions and the route layer maps them to 500 INTERNAL without
 * leaking internals.
 */

import { getAddress, isAddress } from "viem";

import { CELO_CHAIN_ID } from "../celo/config";
import type { SessionRecord } from "./session";
import type { SiweValidationResult } from "./siwe";

/** Recoverable client error with an HTTP status and stable error code. */
export class AuthError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, status: number, details?: unknown) {
    super(code);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type Developer = {
  id: string;
  walletAddress: string;
};

export type NonceService = {
  createNonce(): Promise<string>;
  consumeNonce(nonce: string): Promise<boolean>;
};

export type SessionService = {
  createSession(developerId: string, walletAddress: string): Promise<string>;
  getSession(token: string): Promise<SessionRecord | null>;
  deleteSession(token: string): Promise<void>;
};

export type DeveloperRepository = {
  upsertByWallet(walletAddress: `0x${string}`): Promise<Developer>;
};

export type SiweService = {
  buildMessage(params: {
    address: `0x${string}`;
    nonce: string;
    issuedAt?: Date;
  }): string | Promise<string>;
  validateFields(
    message: string,
    expected: { chainId: number; nonce?: string }
  ): SiweValidationResult | Promise<SiweValidationResult>;
  verifySignature(params: {
    message: string;
    signature: string;
    address: string;
  }): Promise<boolean>;
};

export type AuthServiceDeps = {
  nonceService: NonceService;
  sessionService: SessionService;
  developers: DeveloperRepository;
  siwe: SiweService;
};

/** Field issues are validated in order; the first failing field wins. */
const ISSUE_TO_ERROR_CODE: Record<string, string> = {
  address: "INVALID_MESSAGE",
  domain: "WRONG_DOMAIN",
  uri: "WRONG_URI",
  version: "WRONG_CHAIN",
  chainId: "WRONG_CHAIN",
  nonce: "UNKNOWN_NONCE",
  expirationTime: "EXPIRED_MESSAGE",
};

export type AuthService = ReturnType<typeof createAuthService>;

export function createAuthService(deps: AuthServiceDeps) {
  return {
    /**
     * Issues a fresh challenge: validates the wallet address and network,
     * creates a single-use nonce, and returns the EIP-4361 message for the
     * wallet to sign.
     */
    async challenge(input: {
      address: string;
      chainId: number;
    }): Promise<{ nonce: string; message: string }> {
      if (!isAddress(input.address)) {
        throw new AuthError("INVALID_ADDRESS", 400);
      }
      if (input.chainId !== CELO_CHAIN_ID) {
        throw new AuthError("WRONG_NETWORK", 400, {
          expectedChainId: CELO_CHAIN_ID,
        });
      }
      const address = getAddress(input.address);
      const nonce = await deps.nonceService.createNonce();
      const message = await deps.siwe.buildMessage({ address, nonce });
      return { nonce, message };
    },

    /**
     * Verifies a signed SIWE message and issues a session. Steps:
     * field validation → atomic nonce consumption → signature verification
     * → developer upsert → session creation.
     */
    async verify(input: {
      message: string;
      signature: string;
    }): Promise<{ token: string; developer: Developer }> {
      // (a) Field validation against the expected domain/uri/chain.
      const validation = await deps.siwe.validateFields(input.message, {
        chainId: CELO_CHAIN_ID,
      });
      if (!validation.ok) {
        const issue = validation.issues[0];
        const code = (issue && ISSUE_TO_ERROR_CODE[issue.field]) || "INVALID_MESSAGE";
        throw new AuthError(code, 400);
      }
      const parsedNonce = validation.parsed.nonce;
      if (!parsedNonce) {
        throw new AuthError("INVALID_MESSAGE", 400);
      }

      // (b) Atomic single-use nonce consumption (unknown + replay).
      const consumed = await deps.nonceService.consumeNonce(parsedNonce);
      if (!consumed) {
        throw new AuthError("UNKNOWN_NONCE", 400, {
          detail: "unknown or already used nonce",
        });
      }

      // (c) Signature verification against the address in the message.
      if (!validation.parsed.address) {
        throw new AuthError("INVALID_MESSAGE", 400);
      }
      let address: `0x${string}`;
      try {
        address = getAddress(validation.parsed.address);
      } catch {
        throw new AuthError("INVALID_MESSAGE", 400);
      }
      const signatureValid = await deps.siwe.verifySignature({
        message: input.message,
        signature: input.signature,
        address,
      });
      if (!signatureValid) {
        throw new AuthError("INVALID_SIGNATURE", 400);
      }

      // (d) Resolve/create the developer under the checksummed address.
      const developer = await deps.developers.upsertByWallet(address);

      // (e) Issue the opaque session token.
      const token = await deps.sessionService.createSession(
        developer.id,
        developer.walletAddress
      );

      return {
        token,
        developer: { id: developer.id, walletAddress: developer.walletAddress },
      };
    },

    /** Resolves the authenticated developer from a session token, if any. */
    async me(
      token: string | undefined
    ): Promise<
      { authenticated: false } | { authenticated: true; developer: Developer }
    > {
      if (!token) {
        return { authenticated: false };
      }
      const session = await deps.sessionService.getSession(token);
      if (!session) {
        return { authenticated: false };
      }
      return {
        authenticated: true,
        developer: { id: session.developerId, walletAddress: session.walletAddress },
      };
    },

    /** Destroys the session. Idempotent; a missing token is a no-op. */
    async logout(token: string | undefined): Promise<void> {
      if (!token) {
        return;
      }
      await deps.sessionService.deleteSession(token);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Maps any error from an auth operation to a safe HTTP response shape.
 * `AuthError` → its code/status (+ details); anything else → 500
 * INTERNAL, never leaking internals.
 */
export function toAuthErrorResponse(error: unknown): {
  status: number;
  payload: Record<string, unknown>;
} {
  if (error instanceof AuthError) {
    const details = isRecord(error.details) ? error.details : {};
    return {
      status: error.status,
      payload: { error: error.code, ...details },
    };
  }
  return { status: 500, payload: { error: "INTERNAL" } };
}
