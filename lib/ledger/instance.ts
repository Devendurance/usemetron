/**
 * Production ledger wiring (server-only).
 */

import "server-only";

import {
  createEarningForReceipt,
  creatorTotals,
  listSettledReceiptsMissingEarnings,
  recentCreatorEntries,
} from "../db/ledger";
import { reconcileSettledEarnings } from "./reconcile";

const globalForLedger = globalThis as unknown as {
  metronLedgerService?: {
    reconcile: () => ReturnType<typeof reconcileSettledEarnings>;
  };
};

/** Server-side reconciliation service used by scripts/admin tooling. */
export const ledgerService =
  globalForLedger.metronLedgerService ??
  (globalForLedger.metronLedgerService = {
    reconcile: () =>
      reconcileSettledEarnings({
        listSettledMissing: listSettledReceiptsMissingEarnings,
        createEarning: createEarningForReceipt,
      }),
  });

export { creatorTotals, recentCreatorEntries };
