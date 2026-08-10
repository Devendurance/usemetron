import { describe, expect, it } from "vitest";

import { authNonceKey } from "../redis/keys";
import { createNonceService, NONCE_TTL_SECONDS, type NonceStore } from "./nonce";

class FakeNonceStore implements NonceStore {
  values = new Map<string, string>();
  ttls = new Map<string, number>();
  getdelCalls = 0;

  async set(key: string, value: string, opts?: { ex?: number }): Promise<void> {
    this.values.set(key, value);
    this.ttls.set(key, opts?.ex ?? 0);
  }

  async getdel(key: string): Promise<string | null> {
    this.getdelCalls += 1;
    const value = this.values.get(key);
    this.values.delete(key);
    return value ?? null;
  }
}

describe("createNonceService", () => {
  it("creates a SIWE-compatible nonce stored under auth:{nonce} with a 5-minute TTL", async () => {
    const store = new FakeNonceStore();
    const service = createNonceService(store);

    const nonce = await service.createNonce();

    expect(nonce).toMatch(/^[a-zA-Z0-9]{8,}$/);
    expect(NONCE_TTL_SECONDS).toBe(300);
    expect(store.values.get(authNonceKey(nonce))).toBe(nonce);
    expect(store.ttls.get(authNonceKey(nonce))).toBe(300);
  });

  it("consumes a nonce exactly once (single-use / replay protection)", async () => {
    const store = new FakeNonceStore();
    const service = createNonceService(store);

    const nonce = await service.createNonce();

    await expect(service.consumeNonce(nonce)).resolves.toBe(true);
    await expect(service.consumeNonce(nonce)).resolves.toBe(false);
  });

  it("rejects a malformed nonce without touching the store", async () => {
    const store = new FakeNonceStore();
    const service = createNonceService(store);

    await expect(service.consumeNonce("short")).resolves.toBe(false);
    await expect(service.consumeNonce("nonce-with-dashes")).resolves.toBe(false);
    expect(store.getdelCalls).toBe(0);
  });

  it("rejects when the stored value does not match the requested nonce", async () => {
    const store = new FakeNonceStore();
    store.values.set(authNonceKey("abcdefgh"), "something-else");
    const service = createNonceService(store);

    await expect(service.consumeNonce("abcdefgh")).resolves.toBe(false);
  });
});
