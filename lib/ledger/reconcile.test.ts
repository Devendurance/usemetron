import { describe, expect, it, vi } from "vitest";

import { reconcileSettledEarnings, type ReconcileDeps } from "./reconcile";

function makeDeps(overrides: {
  missing?: Array<{ id: string; developerId: string; routeId: string; amountMicroUsdc: number }>;
  createResult?: { kind: "created"; entry: { id: string } } | { kind: "already_exists" } | { kind: "not_settled" };
} = {}) {
  const missing = overrides.missing ?? [
    { id: "receipt-1", developerId: "dev-1", routeId: "route-1", amountMicroUsdc: 1000 },
    { id: "receipt-2", developerId: "dev-1", routeId: "route-2", amountMicroUsdc: 2000 },
  ];
  const createEarning = vi.fn(async () =>
    overrides.createResult ?? { kind: "created", entry: { id: "entry-x" } }
  );
  const deps = {
    listSettledMissing: async () => missing,
    createEarning,
  } as unknown as ReconcileDeps;
  return { deps, createEarning };
}

describe("reconcileSettledEarnings", () => {
  it("creates exactly one earning per missing SETTLED receipt", async () => {
    const { deps, createEarning } = makeDeps();
    const result = await reconcileSettledEarnings(deps);

    expect(result.scanned).toBe(2);
    expect(result.created).toHaveLength(2);
    expect(createEarning).toHaveBeenCalledTimes(2);
    expect(createEarning).toHaveBeenCalledWith("receipt-1");
    expect(createEarning).toHaveBeenCalledWith("receipt-2");
  });

  it("a rerun finds nothing and creates zero duplicates", async () => {
    const { deps } = makeDeps({ missing: [] });
    const result = await reconcileSettledEarnings(deps);
    expect(result.scanned).toBe(0);
    expect(result.created).toHaveLength(0);
  });

  it("treats a concurrent already_exists insert as skipped, not duplicated", async () => {
    const { deps, createEarning } = makeDeps({
      createResult: { kind: "already_exists" },
    });
    const result = await reconcileSettledEarnings(deps);
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toBe(2);
    expect(createEarning).toHaveBeenCalledTimes(2);
  });

  it("skips receipts that turned non-SETTLED between scan and insert", async () => {
    const { deps } = makeDeps({ createResult: { kind: "not_settled" } });
    const result = await reconcileSettledEarnings(deps);
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toBe(2);
  });
});
