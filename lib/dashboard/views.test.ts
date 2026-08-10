import { describe, expect, it } from "vitest";

import type { PayoutRow } from "../db/payouts";
import type { ReceiptRow } from "../db/receipts";
import {
  toPayoutEvidenceView,
  toTransactionDetailView,
  toTransactionView,
} from "./views";

const BLOCKSCOUT_BASE = "https://celo.blockscout.com/tx/";

function makeReceiptRow(overrides: Partial<ReceiptRow> = {}): ReceiptRow {
  return {
    id: "receipt-1",
    routeId: "route-1",
    routeName: "My API",
    callerWallet: "0xCaller",
    amountMicroUsdc: 12345,
    asset: "USDC",
    network: "celo",
    scheme: "x402",
    payTo: "0xPayTo",
    paymentStatus: "SETTLED",
    upstreamStatusCode: 200,
    upstreamLatencyMs: 150,
    x402TxHash: "0xabc123",
    errorCode: null,
    verifiedAt: new Date("2026-08-02T10:00:00.000Z"),
    settledAt: new Date("2026-08-02T10:05:00.000Z"),
    createdAt: new Date("2026-08-02T09:59:00.000Z"),
    ...overrides,
  };
}

function makePayoutRow(
  overrides: Partial<PayoutRow & { routeName: string }> = {}
): PayoutRow & { routeName: string } {
  return {
    id: "payout-1",
    developerId: "dev-42",
    callReceiptId: "receipt-1",
    ledgerEntryId: "entry-1",
    fromWallet: "0xMetron",
    toWallet: "0xCreator",
    amountMicroUsdc: 12345,
    status: "CONFIRMED",
    attributionTag: "celo_tag",
    txHash: "0xdef456",
    attemptCount: 1,
    lastError: null,
    createdAt: new Date("2026-08-02T11:00:00.000Z"),
    submittedAt: new Date("2026-08-02T11:01:00.000Z"),
    confirmedAt: new Date("2026-08-02T11:05:00.000Z"),
    routeName: "My API",
    ...overrides,
  };
}

describe("toTransactionView", () => {
  it("maps every field and formats amount as an exact decimal string", () => {
    const view = toTransactionView(makeReceiptRow());
    expect(view.id).toBe("receipt-1");
    expect(view.routeId).toBe("route-1");
    expect(view.routeName).toBe("My API");
    expect(view.paymentStatus).toBe("SETTLED");
    expect(view.amountMicroUsdc).toBe(12345);
    expect(view.amountUsdc).toBe("0.012345");
    expect(view.callerWallet).toBe("0xCaller");
    expect(view.asset).toBe("USDC");
    expect(view.network).toBe("celo");
    expect(view.upstreamStatusCode).toBe(200);
    expect(view.upstreamLatencyMs).toBe(150);
    expect(view.errorCode).toBeNull();
  });

  it("formats timestamps as ISO strings and nulls the nullable ones", () => {
    const view = toTransactionView(makeReceiptRow());
    expect(view.createdAt).toBe("2026-08-02T09:59:00.000Z");
    expect(view.verifiedAt).toBe("2026-08-02T10:00:00.000Z");
    expect(view.settledAt).toBe("2026-08-02T10:05:00.000Z");

    const sparse = toTransactionView(
      makeReceiptRow({ verifiedAt: null, settledAt: null })
    );
    expect(sparse.verifiedAt).toBeNull();
    expect(sparse.settledAt).toBeNull();
  });

  it("links a real settlement hash to blockscout", () => {
    const view = toTransactionView(makeReceiptRow());
    expect(view.x402TxHash).toBe("0xabc123");
    expect(view.explorerUrl).toBe(`${BLOCKSCOUT_BASE}0xabc123`);
  });

  it("never fabricates an explorer link without a hash", () => {
    const view = toTransactionView(makeReceiptRow({ x402TxHash: null }));
    expect(view.explorerUrl).toBeNull();
  });

  it("redacts payment_identifier and facilitator_response (object-shape check)", () => {
    const receiptWithSecrets = {
      ...makeReceiptRow(),
      payment_identifier: "SECRET_PAYMENT_IDENTIFIER",
      facilitator_response: { secret: "FACILITATOR_SECRET" },
    } as ReceiptRow;

    const view = toTransactionView(receiptWithSecrets);

    // Exact shape: the view carries only the public DTO keys.
    expect(Object.keys(view).sort()).toEqual(
      [
        "id",
        "routeId",
        "routeName",
        "createdAt",
        "paymentStatus",
        "amountMicroUsdc",
        "amountUsdc",
        "callerWallet",
        "asset",
        "network",
        "upstreamStatusCode",
        "upstreamLatencyMs",
        "verifiedAt",
        "settledAt",
        "x402TxHash",
        "errorCode",
        "explorerUrl",
      ].sort()
    );
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("SECRET_PAYMENT_IDENTIFIER");
    expect(serialized).not.toContain("FACILITATOR_SECRET");
    expect(serialized).not.toContain("payment_identifier");
    expect(serialized).not.toContain("facilitator_response");
  });
});

describe("toPayoutEvidenceView", () => {
  it("maps payout evidence with exact amounts and ISO timestamps", () => {
    const view = toPayoutEvidenceView(makePayoutRow());
    expect(view.id).toBe("payout-1");
    expect(view.routeName).toBe("My API");
    expect(view.toWallet).toBe("0xCreator");
    expect(view.amountMicroUsdc).toBe(12345);
    expect(view.amountUsdc).toBe("0.012345");
    expect(view.status).toBe("CONFIRMED");
    expect(view.txHash).toBe("0xdef456");
    expect(view.explorerUrl).toBe(`${BLOCKSCOUT_BASE}0xdef456`);
    expect(view.attributionTag).toBe("celo_tag");
    expect(view.createdAt).toBe("2026-08-02T11:00:00.000Z");
    expect(view.submittedAt).toBe("2026-08-02T11:01:00.000Z");
    expect(view.confirmedAt).toBe("2026-08-02T11:05:00.000Z");
  });

  it("nulls the explorer link and timestamps when unset", () => {
    const view = toPayoutEvidenceView(
      makePayoutRow({
        txHash: null,
        submittedAt: null,
        confirmedAt: null,
        attributionTag: null,
      })
    );
    expect(view.explorerUrl).toBeNull();
    expect(view.submittedAt).toBeNull();
    expect(view.confirmedAt).toBeNull();
    expect(view.attributionTag).toBeNull();
  });
});

describe("toTransactionDetailView", () => {
  it("attaches the payout evidence when a payout exists", () => {
    const detail = toTransactionDetailView(
      makeReceiptRow(),
      makePayoutRow()
    );
    expect(detail.payout).not.toBeNull();
    expect(detail.payout?.id).toBe("payout-1");
    expect(detail.id).toBe("receipt-1");
  });

  it("keeps payout null when no payout exists (no fabricated evidence)", () => {
    const detail = toTransactionDetailView(makeReceiptRow(), null);
    expect(detail.payout).toBeNull();
  });

  it("redacts secrets from the detail view too", () => {
    const receiptWithSecrets = {
      ...makeReceiptRow(),
      payment_identifier: "SECRET_PAYMENT_IDENTIFIER",
      facilitator_response: { secret: "FACILITATOR_SECRET" },
    } as ReceiptRow;
    const detail = toTransactionDetailView(receiptWithSecrets, makePayoutRow());
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("SECRET_PAYMENT_IDENTIFIER");
    expect(serialized).not.toContain("FACILITATOR_SECRET");
  });
});
