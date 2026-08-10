import { describe, expect, it } from "vitest";

import {
  ENV_NAMES,
  REQUIRED_ENV_VARS,
  SECRET_ENV_VARS,
  validateEnv,
} from "./env";

const fullEnv = Object.fromEntries(
  REQUIRED_ENV_VARS.map((name) => [name, "configured"])
) as Record<string, string>;

describe("validateEnv", () => {
  it("passes when every required variable is set", () => {
    const result = validateEnv(fullEnv);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it("reports missing required variables without throwing", () => {
    const result = validateEnv({});
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(REQUIRED_ENV_VARS);
  });

  it("treats empty strings as missing", () => {
    const result = validateEnv({ ...fullEnv, DATABASE_URL: "" });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain(ENV_NAMES.DATABASE_URL);
  });

  it("never includes values in the per-variable report", () => {
    const result = validateEnv({ ...fullEnv, X402_API_KEY: "super-secret-value" });
    const serialized = JSON.stringify(result.report);
    expect(serialized).not.toContain("super-secret-value");
    for (const item of result.report) {
      expect(item.hasValue).toBe(true);
      expect("value" in item).toBe(false);
    }
  });

  it("marks secrets as secret without exposing them", () => {
    expect(SECRET_ENV_VARS).toContain(ENV_NAMES.METRON_SETTLEMENT_PRIVATE_KEY);
    expect(SECRET_ENV_VARS).toContain(ENV_NAMES.X402_API_KEY);
    expect(REQUIRED_ENV_VARS).not.toContain(ENV_NAMES.METRON_SETTLEMENT_PRIVATE_KEY);
  });

  it("isolates public variables from the server set", () => {
    const result = validateEnv({
      ...fullEnv,
      NEXT_PUBLIC_APP_URL: "https://app.metron.dev",
    });
    expect(result.ok).toBe(true);
    expect(result.values.NEXT_PUBLIC_APP_URL).toBe("https://app.metron.dev");
  });
});
