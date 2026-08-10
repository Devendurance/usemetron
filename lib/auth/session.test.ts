import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { sessionKey } from "../redis/keys";
import {
  createSessionService,
  sessionCookieOptions,
  sessionKeyFromToken,
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  type SessionStore,
} from "./session";

const SECRET = "test-secret";
const DEVELOPER_ID = "dev-0001";
const WALLET = "0xA0Cf798816D4b9b9866b5330EEa46a18382f251e";

class FakeSessionStore implements SessionStore {
  values = new Map<string, string>();
  ttls = new Map<string, number>();

  async set(key: string, value: string, opts?: { ex?: number }): Promise<void> {
    this.values.set(key, value);
    this.ttls.set(key, opts?.ex ?? 0);
  }

  async get(key: string): Promise<unknown | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
    this.ttls.delete(key);
  }
}

/** Mimics @upstash/redis auto-deserializing JSON values on GET. */
class AutoJsonStore extends FakeSessionStore {
  override async get(key: string): Promise<unknown | null> {
    const value = await super.get(key);
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
}

describe("createSessionService", () => {
  it("returns a 43-char base64url token and never stores it raw", async () => {
    const store = new FakeSessionStore();
    const service = createSessionService(store, SECRET);

    const token = await service.createSession(DEVELOPER_ID, WALLET);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.values.size).toBe(1);
    for (const key of store.values.keys()) {
      expect(key.startsWith("session:")).toBe(true);
      expect(key).not.toBe(token);
    }
    expect(store.values.has(token)).toBe(false);
    expect([...store.values.values()].join("\n")).not.toContain(token);
  });

  it("stores the session record with the expected fields and TTL", async () => {
    const store = new FakeSessionStore();
    const service = createSessionService(store, SECRET);

    const token = await service.createSession(DEVELOPER_ID, WALLET);

    const key = sessionKeyFromToken(token, SECRET);
    const record = JSON.parse(store.values.get(key) ?? "null") as Record<string, unknown>;
    expect(record.developerId).toBe(DEVELOPER_ID);
    expect(record.walletAddress).toBe(WALLET);
    expect(typeof record.createdAt).toBe("string");
    expect(typeof record.expiresAt).toBe("string");
    expect(SESSION_TTL_SECONDS).toBe(604800);
    expect(store.ttls.get(key)).toBe(604800);
  });

  it("round-trips a session through getSession", async () => {
    const store = new FakeSessionStore();
    const service = createSessionService(store, SECRET);

    const token = await service.createSession(DEVELOPER_ID, WALLET);
    const session = await service.getSession(token);

    expect(session).not.toBeNull();
    expect(session?.developerId).toBe(DEVELOPER_ID);
    expect(session?.walletAddress).toBe(WALLET);
    expect(session?.expiresAt).toBeDefined();
  });

  it("reads sessions from a store that auto-deserializes JSON (upstash behavior)", async () => {
    const store = new AutoJsonStore();
    const service = createSessionService(store, SECRET);

    const token = await service.createSession(DEVELOPER_ID, WALLET);
    const session = await service.getSession(token);

    expect(session).not.toBeNull();
    expect(session?.developerId).toBe(DEVELOPER_ID);
    expect(session?.walletAddress).toBe(WALLET);
  });

  it("returns null for a missing token", async () => {
    const service = createSessionService(new FakeSessionStore(), SECRET);

    await expect(service.getSession("no-such-token")).resolves.toBeNull();
  });

  it("returns null for an expired record (defense in depth)", async () => {
    const store = new FakeSessionStore();
    const service = createSessionService(store, SECRET);

    const token = "expired-token-abcdefghij";
    const key = sessionKeyFromToken(token, SECRET);
    store.values.set(
      key,
      JSON.stringify({
        developerId: DEVELOPER_ID,
        walletAddress: WALLET,
        createdAt: new Date(Date.now() - 8 * 24 * 3600_000).toISOString(),
        expiresAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
      })
    );

    await expect(service.getSession(token)).resolves.toBeNull();
  });

  it("deletes the session on deleteSession (idempotent)", async () => {
    const store = new FakeSessionStore();
    const service = createSessionService(store, SECRET);

    const token = await service.createSession(DEVELOPER_ID, WALLET);
    await service.deleteSession(token);

    await expect(service.getSession(token)).resolves.toBeNull();
    await expect(service.deleteSession(token)).resolves.toBeUndefined();
  });

  it("derives distinct keys for different developers", async () => {
    const store = new FakeSessionStore();
    const service = createSessionService(store, SECRET);

    const tokenA = await service.createSession("dev-a", WALLET);
    const tokenB = await service.createSession("dev-b", WALLET);

    const keyA = sessionKeyFromToken(tokenA, SECRET);
    const keyB = sessionKeyFromToken(tokenB, SECRET);
    expect(keyA).not.toBe(keyB);
    expect(keyA).toMatch(/^session:/);
    expect(keyB).toMatch(/^session:/);
  });

  it("derives the same key deterministically for the same token", async () => {
    const store = new FakeSessionStore();
    const service = createSessionService(store, SECRET);

    const token = await service.createSession(DEVELOPER_ID, WALLET);

    const expected = sessionKey(
      createHmac("sha256", SECRET).update(token).digest("hex")
    );
    expect(sessionKeyFromToken(token, SECRET)).toBe(expected);
    expect(store.values.has(expected)).toBe(true);
  });
});

describe("session cookie helpers", () => {
  it("exposes the expected constants and attributes", () => {
    expect(SESSION_COOKIE_NAME).toBe("metron_session");
    expect(SESSION_COOKIE_MAX_AGE).toBe(604800);

    const options = sessionCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(604800);
    // Tests run outside production; the cookie must not be Secure then.
    expect(options.secure).toBe(false);
  });
});
