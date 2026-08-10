import { describe, expect, it, vi } from "vitest";

import type { CreatorTotals } from "../db/ledger";
import type { ReceiptCounts } from "../db/receipts";
import type { RouteRow } from "../db/routes";
import {
  buildDashboardSummary,
  type DashboardSummaryDeps,
} from "./summary";

const DEVELOPER_ID = "dev-42";

function makeRouteRow(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id: "route-1",
    developerId: DEVELOPER_ID,
    slug: "my-api",
    name: "My API",
    description: null,
    upstreamUrl: "https://example.com",
    encryptedUpstreamAuth: null,
    priceMicroUsdc: 1000,
    isActive: true,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

const ZERO_COUNTS: ReceiptCounts = {
  settled: 0,
  verified: 0,
  upstreamFailed: 0,
  settlementFailed: 0,
  settlementPending: 0,
  total: 0,
};

const ZERO_TOTALS: CreatorTotals = {
  earnedMicroUsdc: 0,
  paidMicroUsdc: 0,
  outstandingMicroUsdc: 0,
  availableToPayoutMicroUsdc: 0,
  reservedMicroUsdc: 0,
};

function makeDeps(overrides: {
  routes?: RouteRow[];
  counts?: ReceiptCounts;
  totals?: CreatorTotals;
  failedPayoutCount?: number;
} = {}) {
  const listRoutes = vi.fn(async () => overrides.routes ?? []);
  const receiptCounts = vi.fn(async () => overrides.counts ?? ZERO_COUNTS);
  const creatorTotals = vi.fn(async () => overrides.totals ?? ZERO_TOTALS);
  const failedPayoutCount = vi.fn(async () => overrides.failedPayoutCount ?? 0);
  const deps: DashboardSummaryDeps = {
    listRoutes,
    receiptCounts,
    creatorTotals,
    failedPayoutCount,
  };
  return { deps, listRoutes, receiptCounts, creatorTotals, failedPayoutCount };
}

describe("buildDashboardSummary", () => {
  it("counts published and active endpoints from real routes", async () => {
    const { deps } = makeDeps({
      routes: [
        makeRouteRow({ id: "r1", isActive: true }),
        makeRouteRow({ id: "r2", isActive: false }),
        makeRouteRow({ id: "r3", isActive: true }),
      ],
    });
    const summary = await buildDashboardSummary(DEVELOPER_ID, deps);
    expect(summary.publishedEndpoints).toBe(3);
    expect(summary.activeEndpoints).toBe(2);
  });

  it("passes receipt counts through exactly (settled counts only SETTLED)", async () => {
    const { deps } = makeDeps({
      counts: {
        settled: 5,
        verified: 3,
        upstreamFailed: 1,
        settlementFailed: 2,
        settlementPending: 4,
        total: 15,
      },
    });
    const summary = await buildDashboardSummary(DEVELOPER_ID, deps);
    expect(summary.settledCalls).toBe(5);
    expect(summary.verifiedAttempts).toBe(3);
    expect(summary.upstreamFailures).toBe(1);
    expect(summary.settlementFailures).toBe(2);
    expect(summary.settlementPendingCalls).toBe(4);
  });

  it("reports payout failures from the payout repository", async () => {
    const { deps } = makeDeps({ failedPayoutCount: 2 });
    const summary = await buildDashboardSummary(DEVELOPER_ID, deps);
    expect(summary.payoutFailures).toBe(2);
  });

  it("passes money totals through as exact integers with exact decimal strings (no float math)", async () => {
    const { deps } = makeDeps({
      totals: {
        earnedMicroUsdc: 12345,
        paidMicroUsdc: 4500,
        outstandingMicroUsdc: 7845,
        availableToPayoutMicroUsdc: 3845,
        reservedMicroUsdc: 4000,
      },
    });
    const summary = await buildDashboardSummary(DEVELOPER_ID, deps);
    expect(summary.earnedMicroUsdc).toBe(12345);
    expect(summary.paidMicroUsdc).toBe(4500);
    expect(summary.outstandingMicroUsdc).toBe(7845);
    expect(summary.availableToPayoutMicroUsdc).toBe(3845);
    expect(summary.reservedMicroUsdc).toBe(4000);
    // Exact decimal strings from integer micro values — no floats anywhere.
    expect(summary.earnedUsdc).toBe("0.012345");
    expect(summary.paidUsdc).toBe("0.0045");
    expect(summary.outstandingUsdc).toBe("0.007845");
    expect(
      [
        summary.earnedMicroUsdc,
        summary.paidMicroUsdc,
        summary.outstandingMicroUsdc,
        summary.availableToPayoutMicroUsdc,
        summary.reservedMicroUsdc,
      ].every(Number.isInteger)
    ).toBe(true);
  });

  it("zero-defaults every metric when there is no activity", async () => {
    const { deps } = makeDeps();
    const summary = await buildDashboardSummary(DEVELOPER_ID, deps);
    expect(summary).toMatchObject({
      publishedEndpoints: 0,
      activeEndpoints: 0,
      settledCalls: 0,
      verifiedAttempts: 0,
      upstreamFailures: 0,
      settlementFailures: 0,
      settlementPendingCalls: 0,
      payoutFailures: 0,
      earnedMicroUsdc: 0,
      paidMicroUsdc: 0,
      outstandingMicroUsdc: 0,
      availableToPayoutMicroUsdc: 0,
      reservedMicroUsdc: 0,
      earnedUsdc: "0",
      paidUsdc: "0",
      outstandingUsdc: "0",
    });
  });

  it("threads developerId into every dependency call (ownership)", async () => {
    const { deps, listRoutes, receiptCounts, creatorTotals, failedPayoutCount } =
      makeDeps();
    await buildDashboardSummary(DEVELOPER_ID, deps);
    expect(listRoutes).toHaveBeenCalledTimes(1);
    expect(listRoutes).toHaveBeenCalledWith(DEVELOPER_ID);
    expect(receiptCounts).toHaveBeenCalledTimes(1);
    expect(receiptCounts).toHaveBeenCalledWith(DEVELOPER_ID);
    expect(creatorTotals).toHaveBeenCalledTimes(1);
    expect(creatorTotals).toHaveBeenCalledWith(DEVELOPER_ID);
    expect(failedPayoutCount).toHaveBeenCalledTimes(1);
    expect(failedPayoutCount).toHaveBeenCalledWith(DEVELOPER_ID);
  });
});
