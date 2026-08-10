import { describe, expect, it, vi } from "vitest";

import { reconcilePayouts, type ReconcilePayoutDeps } from "./reconcile";
import { buildPayoutCalldata } from "./execution";
import { METRON_SETTLEMENT_WALLET } from "../celo/config";
import type { PayoutRow } from "../db/payouts";

const CREATOR = "0xAAe584e729edA3D3bb2Ecb3b6Fb8C1dc4A9e5F7B";
const { data } = buildPayoutCalldata({ to: CREATOR, amountMicroUsdc: BigInt(1000) });

function makeRow(overrides: Partial<PayoutRow> = {}): PayoutRow {
  return {
    id: "p1",
    developerId: "dev-1",
    callReceiptId: "receipt-1",
    ledgerEntryId: "entry-1",
    fromWallet: METRON_SETTLEMENT_WALLET,
    toWallet: CREATOR,
    amountMicroUsdc: 1000,
    status: "SUBMITTED",
    attributionTag: "celo_91fed90b97fc",
    txHash: "0xabc123",
    attemptCount: 1,
    lastError: null,
    createdAt: new Date(),
    submittedAt: new Date(),
    confirmedAt: null,
    ...overrides,
  };
}

function makeDeps(overrides: {
  rows?: PayoutRow[];
  receipt?: Awaited<ReturnType<NonNullable<ReconcilePayoutDeps["fetchReceipt"]>>>;
  receiptError?: Error;
} = {}) {
  const listNonFinal = vi.fn(async () => overrides.rows ?? [makeRow()]);
  const fetchReceipt = vi.fn(async () =>
    overrides.receiptError
      ? Promise.reject(overrides.receiptError)
      : (overrides.receipt ?? {
          status: "success" as const,
          txTo: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
          transfers: [{ from: METRON_SETTLEMENT_WALLET, to: CREATOR, value: BigInt(1000) }],
          txInput: data,
        })
  );
  const finalize = vi.fn(async () => {});
  const markFailed = vi.fn(async () => {});
  const deps: ReconcilePayoutDeps = { listNonFinal, fetchReceipt, finalize, markFailed, now: () => new Date() };
  return { deps, fetchReceipt, finalize, markFailed };
}

describe("reconcilePayouts", () => {
  it("finalizes a SUBMITTED payout whose receipt confirms the transfer", async () => {
    const { deps, finalize } = makeDeps();
    const report = await reconcilePayouts(deps);
    expect(report.confirmed).toHaveLength(1);
    expect(report.confirmed[0]).toMatchObject({ payoutId: "p1", txHash: "0xabc123", attributionVerified: true });
    expect(finalize).toHaveBeenCalledWith("p1", expect.any(Date));
  });

  it("marks FAILED on a reverted receipt and releases the reservation", async () => {
    const { deps, markFailed, finalize } = makeDeps({
      receipt: { status: "reverted" as const, txTo: null, transfers: [], txInput: null },
    });
    const report = await reconcilePayouts(deps);
    expect(report.failed).toHaveLength(1);
    expect(markFailed).toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("keeps a pending/unknown receipt reserved — never resends", async () => {
    const { deps, finalize, markFailed } = makeDeps({
      receipt: { status: "unknown" as const, txTo: null, transfers: [], txInput: null },
    });
    const report = await reconcilePayouts(deps);
    expect(report.keptReserved).toHaveLength(1);
    expect(finalize).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("keeps reserved payouts with no persisted hash (never broadcast)", async () => {
    const { deps } = makeDeps({ rows: [makeRow({ status: "PENDING", txHash: null })] });
    const report = await reconcilePayouts(deps);
    expect(report.keptReserved[0]).toMatchObject({ reason: "never_broadcast" });
  });

  it("never acts on a FAILED payout without a persisted hash — no fetch, no finalize, no re-mark", async () => {
    // FAILED-without-hash is the pre-broadcast failure case (reservation
    // released at the accounting layer). Recovery must check the hash
    // BEFORE any action: with no hash there is nothing to inspect onchain
    // and nothing to finalize or re-fail — and never a blind resend.
    const { deps, fetchReceipt, finalize, markFailed } = makeDeps({
      rows: [makeRow({ status: "FAILED", txHash: null, lastError: "insufficient_usdc_balance" })],
    });
    const report = await reconcilePayouts(deps);
    expect(report.keptReserved).toHaveLength(1);
    expect(report.keptReserved[0]).toMatchObject({ payoutId: "p1", reason: "never_broadcast" });
    expect(fetchReceipt).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("finalizes each confirmed payout exactly once with its own payout id", async () => {
    const { deps, fetchReceipt, finalize } = makeDeps({
      rows: [
        makeRow({ id: "p1", txHash: "0xabc111" }),
        makeRow({ id: "p2", txHash: "0xabc222" }),
      ],
    });
    const report = await reconcilePayouts(deps);
    expect(report.confirmed).toHaveLength(2);
    expect(fetchReceipt).toHaveBeenCalledTimes(2);
    expect(fetchReceipt).toHaveBeenCalledWith("0xabc111");
    expect(fetchReceipt).toHaveBeenCalledWith("0xabc222");
    expect(finalize).toHaveBeenCalledTimes(2);
    expect(
      (finalize.mock.calls as unknown as Array<[string, Date]>).map((c) => c[0])
    ).toEqual(["p1", "p2"]);
  });

  it("keeps reserved when the RPC is unavailable", async () => {
    const { deps } = makeDeps({ receiptError: new Error("rpc down") });
    const report = await reconcilePayouts(deps);
    expect(report.keptReserved[0]).toMatchObject({ reason: "receipt_unavailable" });
  });

  it("never marks CONFIRMED without matching transfer evidence", async () => {
    const { deps, finalize } = makeDeps({
      receipt: {
        status: "success" as const,
        txTo: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
        transfers: [{ from: METRON_SETTLEMENT_WALLET, to: "0x00000000000000000000000000000000000000EE", value: BigInt(1000) }],
        txInput: data,
      },
    });
    const report = await reconcilePayouts(deps);
    expect(report.confirmed).toHaveLength(0);
    expect(finalize).not.toHaveBeenCalled();
  });
});

describe("reconcilePayouts — M8.1 false-FAILED repair", () => {
  it("repairs a locally FAILED payout whose tx is successful onchain, without a new transaction", async () => {
    const { deps, finalize, fetchReceipt } = makeDeps({
      rows: [makeRow({ status: "FAILED", txHash: "0xreal", lastError: "wrong_token" })],
    });
    const report = await reconcilePayouts(deps);

    expect(report.confirmed).toHaveLength(1);
    expect(report.confirmed[0]).toMatchObject({ payoutId: "p1", txHash: "0xreal", attributionVerified: true });
    expect(finalize).toHaveBeenCalledWith("p1", expect.any(Date));
    // Read-only: the fetch is the only chain interaction.
    expect(fetchReceipt).toHaveBeenCalledWith("0xreal");
  });

  it("reverts a locally FAILED payout back to FAILED when its tx reverted onchain", async () => {
    const { deps, markFailed, finalize } = makeDeps({
      rows: [makeRow({ status: "FAILED", txHash: "0xrevert" })],
      receipt: { status: "reverted" as const, txTo: null, transfers: [], txInput: null },
    });
    const report = await reconcilePayouts(deps);
    expect(report.failed).toHaveLength(1);
    expect(markFailed).toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("keeps a FAILED-with-hash payout conservative when the outcome is unknown", async () => {
    const { deps, finalize, markFailed } = makeDeps({
      rows: [makeRow({ status: "FAILED", txHash: "0xunk" })],
      receipt: { status: "unknown" as const, txTo: null, transfers: [], txInput: null },
    });
    const report = await reconcilePayouts(deps);
    expect(report.keptReserved).toHaveLength(1);
    expect(finalize).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });
});
