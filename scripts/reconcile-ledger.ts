/**
 * M7/M7.1 admin/dev reconciliation:
 *   1. create exactly one creator earning for every SETTLED receipt that
 *      lacks one;
 *   2. resolve SETTLEMENT_PENDING receipts using authoritative onchain
 *      evidence (EIP-3009 AuthorizationUsed).
 * Safe and idempotent. Run:
 *   npm run reconcile:ledger
 */

import { ledgerService } from "../lib/ledger/instance";
import { recoveryService } from "../lib/recovery/instance";
import { payoutRecovery } from "../lib/payouts/instance";

async function main() {
  const earnings = await ledgerService.reconcile();
  const pending = await recoveryService.resolvePending();
  const payouts = await payoutRecovery();

  console.log(JSON.stringify({
    settledEarnings: {
      scanned: earnings.scanned,
      created: earnings.created.map((c) => ({ receiptId: c.receiptId, entryId: c.entryId })),
      skipped: earnings.skipped,
    },
    pendingResolution: {
      scanned: pending.scanned,
      outcomes: pending.outcomes.map((o) => ({
        status: o.status,
        receiptId: o.receiptId,
        ...(o.status === "settled" ? { txHash: o.txHash, earningCreated: o.earningCreated } : {}),
        ...(o.status === "still_pending" ? { reason: o.reason } : {}),
      })),
    },
    payouts: {
      scanned: payouts.scanned,
      confirmed: payouts.confirmed,
      failed: payouts.failed,
      keptReserved: payouts.keptReserved,
    },
  }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("RECONCILE FAILED:", e.message);
  process.exit(1);
});
