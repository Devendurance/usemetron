import { beforeEach, describe, expect, it } from "vitest";

import {
  getRegisteredSecrets,
  getRegisteredSensitiveKeys,
  registerSecret,
  registerSensitiveKey,
  resetRegistry,
} from "./secret-registry";

describe("secret-registry", () => {
  // Suite-order isolation: the registry is module-global (hot-reload safe),
  // so every test starts from a clean slate.
  beforeEach(() => {
    resetRegistry();
  });

  it("returns registered secret values in insertion order", () => {
    registerSecret("sk_creator_secret");
    registerSecret("k-creator-1");
    expect(getRegisteredSecrets()).toEqual(["sk_creator_secret", "k-creator-1"]);
  });

  it("returns registered sensitive keys in insertion order", () => {
    registerSensitiveKey("X-Custom-Key");
    registerSensitiveKey("X-Other-Key");
    expect(getRegisteredSensitiveKeys()).toEqual(["X-Custom-Key", "X-Other-Key"]);
  });

  it("resetRegistry clears both lists", () => {
    registerSecret("sk_creator_secret");
    registerSensitiveKey("X-Custom-Key");
    resetRegistry();
    expect(getRegisteredSecrets()).toEqual([]);
    expect(getRegisteredSensitiveKeys()).toEqual([]);
  });

  it("ignores empty values and never throws", () => {
    expect(() => registerSecret("")).not.toThrow();
    expect(() => registerSensitiveKey("")).not.toThrow();
    expect(getRegisteredSecrets()).toEqual([]);
    expect(getRegisteredSensitiveKeys()).toEqual([]);
  });

  it("deduplicates repeated registrations", () => {
    registerSecret("sk_creator_secret");
    registerSecret("sk_creator_secret");
    expect(getRegisteredSecrets()).toEqual(["sk_creator_secret"]);
  });
});
