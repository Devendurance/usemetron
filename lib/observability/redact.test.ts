import { describe, expect, it } from "vitest";

import { redactFields, SENSITIVE_KEYS } from "./redact";

describe("redactFields", () => {
  it("replaces values that exactly match a secret value", () => {
    const result = redactFields({ apiKey: "sk-live-x402-12345" }, ["sk-live-x402-12345"]);
    expect(result.apiKey).toBe("[REDACTED]");
  });

  it("redacts secrets embedded as substrings inside longer values", () => {
    const result = redactFields(
      { note: "https://logs.example.com?key=sk-live-x402-12345&extra=1" },
      ["sk-live-x402-12345"]
    );
    expect(result.note).toBe("[REDACTED]");
  });

  it("leaves unrelated values untouched when no secret matches", () => {
    const result = redactFields({ receiptId: "r1", note: "sk-live-x402-other" }, ["sk-live-x402-12345"]);
    expect(result).toEqual({ receiptId: "r1", note: "sk-live-x402-other" });
  });

  it("scrubs userinfo passwords from URL credential strings", () => {
    const result = redactFields(
      { db: "postgres://admin:dbpass123@db.example.com:5432/metron" },
      []
    );
    expect(result.db).toBe("postgres://admin:[REDACTED]@db.example.com:5432/metron");
  });

  it("scrubs redis URL tokens (userinfo password)", () => {
    const result = redactFields(
      { redis: "https://default:redis-token-abc@upstash.example.com:6379" },
      []
    );
    expect(result.redis).toBe("https://default:[REDACTED]@upstash.example.com:6379");
  });

  it("leaves plain URLs without userinfo untouched", () => {
    const result = redactFields({ url: "https://api.example.com/v1/verify" }, []);
    expect(result.url).toBe("https://api.example.com/v1/verify");
  });

  it("redacts sensitive-key values regardless of content", () => {
    const result = redactFields(
      {
        signature: "PAYMENT-SIGNATURE anything",
        secret: "anything",
        apiKey: "x",
        privateKey: "0xdeadbeef",
        authorization: "Bearer abc",
        cookie: "sid=abc",
        token: "t",
        password: "p",
        session: "s",
        credential: "c",
      },
      []
    );
    for (const value of Object.values(result)) {
      expect(value).toBe("[REDACTED]");
    }
  });

  it("redacts strings nested one level inside objects", () => {
    const result = redactFields(
      {
        headers: {
          authorization: "Bearer secret-token-xyz",
          note: "contains sk-live-x402-12345",
          safe: "keep me",
        },
      },
      ["sk-live-x402-12345"]
    );
    expect(result).toEqual({
      headers: {
        authorization: "[REDACTED]",
        note: "[REDACTED]",
        safe: "keep me",
      },
    });
  });

  it("redacts strings nested one level inside arrays", () => {
    const result = redactFields(
      { items: ["sk-live-x402-12345", "ok", "not-a-secret"] },
      ["sk-live-x402-12345"]
    );
    expect(result).toEqual({ items: ["[REDACTED]", "ok", "not-a-secret"] });
  });

  it("scrubs URL credentials nested one level inside objects", () => {
    const result = redactFields(
      { nested: { db: "postgres://admin:dbpass123@db.example.com:5432/metron" } },
      []
    );
    expect(result.nested).toEqual({
      db: "postgres://admin:[REDACTED]@db.example.com:5432/metron",
    });
  });

  it("redacts a sensitive-key value wholesale even when it is an object", () => {
    const result = redactFields({ signature: { nested: "anything" } }, []);
    expect(result.signature).toBe("[REDACTED]");
  });

  it("recurses exactly one level — deeper nested values pass through", () => {
    const input = { a: { b: { token: "deep-secret" } } };
    const result = redactFields(input, ["deep-secret"]);
    expect(result).toEqual(input);
  });

  it.each([
    ["x-api-key", "cmc-test-key-dummy"],
    ["api-key", "cmc-test-key-dummy"],
    ["authorization", "Bearer sk-test-dummy-value"],
    ["CMC_API_KEY", "cmc-test-key-dummy"],
    ["bearer_token", "sk-test-dummy-value"],
  ] as const)(
    "serialized output redacts a secret-looking value under %s and never leaks it",
    (name, value) => {
      const serialized = JSON.stringify(redactFields({ [name]: value }, []));
      expect(serialized).toContain("[REDACTED]");
      expect(serialized).not.toContain(value);
    }
  );

  it("matches sensitive keys case-insensitively and through punctuation", () => {
    const result = redactFields(
      { "x-api-key": "k1", "PAYMENT-SIGNATURE": "sig", Authorization: "a", private_key: "pk" },
      []
    );
    expect(result["x-api-key"]).toBe("[REDACTED]");
    expect(result["PAYMENT-SIGNATURE"]).toBe("[REDACTED]");
    expect(result.Authorization).toBe("[REDACTED]");
    expect(result.private_key).toBe("[REDACTED]");
  });

  it("redacts numeric and boolean values under sensitive keys too", () => {
    const result = redactFields({ signature: 12345, token: false }, []);
    expect(result.signature).toBe("[REDACTED]");
    expect(result.token).toBe("[REDACTED]");
  });

  it("leaves unknown keys untouched", () => {
    const input = {
      receiptId: "r1",
      routeId: "rt",
      paymentIdentifier: "pid",
      count: 3,
      active: true,
      nothing: null,
    };
    const result = redactFields({ ...input }, ["unrelated-secret"]);
    expect(result).toEqual(input);
  });

  it("never throws on weird input", () => {
    expect(() =>
      redactFields(
        {
          big: BigInt(1),
          sym: Symbol("x"),
          nested: { a: 1 },
          undef: undefined,
          obj: new Date(),
          arr: [1, 2],
        } as unknown as Record<string, unknown>,
        []
      )
    ).not.toThrow();

    expect(() => redactFields({}, [])).not.toThrow();
    expect(redactFields({}, [])).toEqual({});

    expect(() => redactFields(null as unknown as Record<string, unknown>, [])).not.toThrow();
    expect(redactFields(null as unknown as Record<string, unknown>, [])).toEqual({});
  });
});

describe("redactFields — extraSensitiveKeys (creator-configured header names)", () => {
  it("redacts a registered custom header name that contains no sensitive substring", () => {
    // `X-Custom-Key` normalizes to `xcustomkey` — none of the built-in
    // sensitive words appear inside it, so only the extra key list can
    // catch it (M11.1: creator-configured header names were the hole).
    const serialized = JSON.stringify(
      redactFields({ "X-Custom-Key": "sk_creator_secret" }, [], ["X-Custom-Key"])
    );
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("sk_creator_secret");
  });

  it("matches extra sensitive keys case-insensitively and through punctuation", () => {
    const result = redactFields(
      { "x-custom-key": "v1", "X-OTHER_HEADER": "v2" },
      [],
      ["X-Custom-Key", "x-other-header"]
    );
    expect(result["x-custom-key"]).toBe("[REDACTED]");
    expect(result["X-OTHER_HEADER"]).toBe("[REDACTED]");
  });

  it("leaves unregistered custom header names untouched", () => {
    const result = redactFields({ "X-Custom-Key": "sk_creator_secret" }, []);
    expect(result["X-Custom-Key"]).toBe("sk_creator_secret");
  });

  it("redacts a registered secret value appearing inside any field", () => {
    // A hypothetical request-header dump: the field key is not sensitive,
    // so only the registered secret VALUE catches it.
    const serialized = JSON.stringify(
      redactFields(
        { headers: { "x-request-dump": "authorization: Bearer sk_creator_secret" } },
        ["sk_creator_secret"]
      )
    );
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("sk_creator_secret");
  });

  it("does not throw when extraSensitiveKeys is omitted", () => {
    expect(() => redactFields({ apiKey: "x" }, [])).not.toThrow();
    expect(redactFields({ apiKey: "x" }, [])).toEqual({ apiKey: "[REDACTED]" });
  });
});

describe("SENSITIVE_KEYS", () => {
  it("keeps the set conservative — nonce is not secret", () => {
    expect(SENSITIVE_KEYS.has("nonce")).toBe(false);
  });
});
