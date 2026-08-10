/**
 * Production recovery wiring (server-only).
 */

import "server-only";

import { getServerEnv } from "../env/server";
import { applySettledSettlement } from "../db/receipts";
import {
  listPendingSettlementReceipts,
  markPendingSettlementFailed,
} from "../db/settlement-recovery";
import { createOnchainEvidenceProvider } from "./onchain";
import { resolvePendingSettlements } from "./reconcile-pending";

const globalForRecovery = globalThis as unknown as {
  metronRecoveryService?: ReturnType<typeof buildRecoveryService>;
};

function buildRecoveryService() {
  const rpcUrl = getServerEnv().CELO_RPC_URL ?? "https://forno.celo.org";
  const { resolve } = createOnchainEvidenceProvider({ rpcUrl });  return {
    resolvePending: () =>
      resolvePendingSettlements({
        listPending: listPendingSettlementReceipts,
        resolveEvidence: resolve,
        applySettled: applySettledSettlement,
        markFailed: markPendingSettlementFailed,
      }),
  };
}

export const recoveryService =
  globalForRecovery.metronRecoveryService ??
  (globalForRecovery.metronRecoveryService = buildRecoveryService());
