import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Static source guards for the receipt "Caller" label (M10 task 3).
 *
 * The payment-receipt wallet is the CALLER (buyer), never the creator.
 * Deliberately pragmatic: simple source scans, not a JS parser, mirroring
 * the guard style used in tools/m10-external-client.test.ts.
 */

const SOURCE_DIR = fileURLToPath(new URL(".", import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, `file://${SOURCE_DIR}`), "utf8");
}

const receiptSources = {
  metronReceipt: readSource("../metron/metron-receipt.tsx"),
  transactionDetail: readSource("./transaction-detail.tsx"),
  recentTransactions: readSource("./recent-transactions.tsx"),
  proxyStateView: readSource("../proxy/proxy-call-state-view.tsx"),
  dashboardPage: readSource("../../app/dashboard/page.tsx"),
};

// Every file that renders the receipt or labels its fields must never pass
// a value to a `creator` prop on the receipt surface.
const RECEIPT_SURFACES: Array<[string, string]> = [
  ["metron-receipt.tsx", receiptSources.metronReceipt],
  ["transaction-detail.tsx", receiptSources.transactionDetail],
  ["recent-transactions.tsx", receiptSources.recentTransactions],
  ["proxy-call-state-view.tsx", receiptSources.proxyStateView],
];

describe("receipt Caller label (static guards)", () => {
  it("metron-receipt.tsx labels the wallet row Caller, not Creator", () => {
    expect(receiptSources.metronReceipt).not.toContain('["Creator",');
    expect(receiptSources.metronReceipt).toContain('["Caller", caller]');
    expect(receiptSources.metronReceipt).not.toContain("creator?: React.ReactNode");
  });

  it("transaction-detail.tsx passes the caller wallet via the caller prop", () => {
    expect(receiptSources.transactionDetail).toContain(
      "caller={transaction.callerWallet"
    );
  });

  it("recent-transactions.tsx passes the caller wallet via the caller prop", () => {
    expect(receiptSources.recentTransactions).toContain(
      "caller={data.transactions[0].callerWallet"
    );
  });

  it("no receipt surface passes a caller wallet to a creator-labeled prop", () => {
    // `creator={` anywhere on the receipt surface would label the caller
    // wallet (or its placeholder) as the Creator — a semantic regression.
    for (const [fileName, source] of RECEIPT_SURFACES) {
      expect(source, `${fileName} must not use creator={`).not.toMatch(/creator=\{/);
    }
  });

  it("dashboard receipt-anatomy copy names the caller field", () => {
    expect(receiptSources.dashboardPage).toContain(
      "response, caller, and transaction evidence"
    );
    expect(receiptSources.dashboardPage).not.toContain("response, creator, and");
  });
});
