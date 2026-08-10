/**
 * Server-side session service (opaque token sessions).
 *
 * The session token is 32 random bytes base64url-encoded (43 chars) and is
 * NEVER stored server-side: Redis holds only
 * `session:{hex(HMAC-SHA256(token, SESSION_SECRET))}`. The token reaches
 * the browser exclusively via the `HttpOnly` `metron_session` cookie.
 *
 * NOTE: deliberately NO `server-only` import (same rationale as
 * `lib/redis/keys.ts`): the store and secret are injected, so unit tests
 * run under plain Node. Production wires the real Redis client and the
 * validated SESSION_SECRET in `lib/auth/service.ts`.
 */

import { createHmac, randomBytes } from "node:crypto";

import { sessionKey } from "../redis/keys";

/** Sessions live for 7 days. */
export const SESSION_TTL_SECONDS = 604800;
export const SESSION_COOKIE_NAME = "metron_session";
export const SESSION_COOKIE_MAX_AGE = 604800;

export type SessionRecord = {
  developerId: string;
  walletAddress: string;
  createdAt: string;
  expiresAt: string;
};

/**
 * Minimal async key-value store used for session records.
 *
 * `get` may return the raw string or an already-deserialized object:
 * @upstash/redis auto-parses JSON values on GET.
 */
export type SessionStore = {
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>;
  get(key: string): Promise<unknown | null>;
  del(key: string): Promise<unknown>;
};

export type SessionService = {
  createSession(developerId: string, walletAddress: string): Promise<string>;
  getSession(token: string): Promise<SessionRecord | null>;
  deleteSession(token: string): Promise<void>;
};

/** Deterministic Redis key for a token: HMAC-SHA256(token, secret). */
export function sessionKeyFromToken(token: string, secret: string): string {
  const hash = createHmac("sha256", secret).update(token).digest("hex");
  return sessionKey(hash);
}

export function createSessionService(
  store: SessionStore,
  secret: string
): SessionService {
  return {
    async createSession(developerId: string, walletAddress: string): Promise<string> {
      const token = randomBytes(32).toString("base64url");
      const record: SessionRecord = {
        developerId,
        walletAddress,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
      };
      await store.set(sessionKeyFromToken(token, secret), JSON.stringify(record), {
        ex: SESSION_TTL_SECONDS,
      });
      return token;
    },

    async getSession(token: string): Promise<SessionRecord | null> {
      const raw = await store.get(sessionKeyFromToken(token, secret));
      if (raw === null) {
        return null;
      }
      // @upstash/redis auto-deserializes JSON strings into objects on GET,
      // so the record may arrive either as a raw string or as an object.
      const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }
      const { developerId, walletAddress, createdAt, expiresAt } =
        parsed as Record<string, unknown>;
      if (
        typeof developerId !== "string" ||
        typeof walletAddress !== "string" ||
        typeof createdAt !== "string" ||
        typeof expiresAt !== "string"
      ) {
        return null;
      }
      // Defense in depth: Redis TTL is the primary expiry; re-check here
      // so a stale record can never authenticate.
      const expires = new Date(expiresAt).getTime();
      if (Number.isNaN(expires) || expires <= Date.now()) {
        return null;
      }
      return { developerId, walletAddress, createdAt, expiresAt };
    },

    async deleteSession(token: string): Promise<void> {
      await store.del(sessionKeyFromToken(token, secret));
    },
  };
}

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
};

/** Cookie attributes for the session cookie (Secure only in production). */
export function sessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}
