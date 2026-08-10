/**
 * Production wiring for the SIWE authentication service.
 *
 * This is the ONLY module that binds the real infrastructure (Redis,
 * validated server env, Postgres developer repo) to the pure auth core.
 * It is `server-only`, so importing it from a client bundle fails at build
 * time.
 */

import "server-only";

import { upsertDeveloperByWallet } from "../db/developers";
import { getServerEnv } from "../env/server";
import { redis } from "../redis/client";
import { createAuthService, type AuthServiceDeps } from "./auth-service";
import { createNonceService } from "./nonce";
import { createSessionService } from "./session";
import {
  buildSiweMessage,
  getSiweContext,
  validateSiweMessageFields,
  verifySiweSignature,
} from "./siwe";

function buildDeps(): AuthServiceDeps {
  // Fail fast: throws a clear error when NEXT_PUBLIC_APP_URL is unusable.
  const { domain, uri } = getSiweContext();
  const sessionSecret = getServerEnv().SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required to start the auth service");
  }

  const deps: AuthServiceDeps = {
    nonceService: createNonceService(redis),
    sessionService: createSessionService(redis, sessionSecret),
    developers: { upsertByWallet: upsertDeveloperByWallet },
    siwe: {
      buildMessage: buildSiweMessage,
      validateFields: (message, expected) =>
        validateSiweMessageFields(message, {
          domain,
          uri,
          chainId: expected.chainId,
          nonce: expected.nonce,
        }),
      // The verifier parses the address from the message itself.
      verifySignature: ({ message, signature }) =>
        verifySiweSignature(message, signature as `0x${string}`),
    },
  };
  return deps;
}

type AuthServiceSingleton = ReturnType<typeof createAuthService>;

const globalForAuth = globalThis as unknown as {
  metronAuthService?: AuthServiceSingleton;
};

/**
 * Shared auth service singleton (hot-reload safe via `globalThis`).
 * Deps are built lazily on first use, fail-closed when the environment
 * is not configured.
 */
export const authService: AuthServiceSingleton =
  globalForAuth.metronAuthService ??
  (globalForAuth.metronAuthService = createAuthService(buildDeps()));

/** Convenience for server components / route handlers reading the cookie. */
export function getSessionFromCookie(token: string | undefined) {
  return authService.me(token);
}
