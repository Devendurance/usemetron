/**
 * Ledger reconciliation + earnings orchestration (injectable, testable).
 *
 * `reconcileSettledEarnings` backfills exactly one earning for every
 * SETTLED receipt that lacks one — the mechanism that brings the real M6
 * settlement (created before ledger accounting existed) into the ledger.
 * Idempotent: reruns create zero duplicates thanks to the UNIQUE
 * call_receipt_id constraint plus the per-run re-check.
 */

export type ReconcileDeps = {
  listSettledMissing(): Promise<
    Array<{ id: string; developerId: string; routeId: string; amountMicroUsdc: number }>
  >;
  createEarning(receiptId: string): Promise<
    { kind: "created"; entry: { id: string } } | { kind: "already_exists" } | { kind: "not_settled" }
  >;
};

export type ReconcileResult = {
  scanned: number;
  created: Array<{ receiptId: string; entryId: string }>;
  skipped: number;
};

export async function reconcileSettledEarnings(
  deps: ReconcileDeps
): Promise<ReconcileResult> {
  const missing = await deps.listSettledMissing();
  const created: Array<{ receiptId: string; entryId: string }> = [];
  let skipped = 0;

  for (const receipt of missing) {
    const result = await deps.createEarning(receipt.id);
    if (result.kind === "created") {
      created.push({ receiptId: receipt.id, entryId: result.entry.id });
    } else {
      // already_exists / not_settled: a concurrent run won the insert.
      skipped++;
    }
  }

  return { scanned: missing.length, created, skipped };
}
