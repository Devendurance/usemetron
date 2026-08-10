/**
 * Production wiring for the M4 gateway verification service (server-only).
 */

import "server-only";

import { redis } from "../redis/client";
import { paymentLockKey } from "../redis/keys";
import { verifyPayment } from "../x402/client";
import { insertVerifiedReceipt, getReceiptByPaymentIdentifier } from "../db/receipts";
import { createGatewayService } from "./gateway-service";

const LOCK_VALUE = "1";

function buildGatewayService() {
  return createGatewayService({
    verify: verifyPayment,
    replayLock: {
      async acquire(identifier: string, ttlSeconds: number): Promise<boolean> {
        const result = await redis.set(paymentLockKey(identifier), LOCK_VALUE, {
          nx: true,
          ex: ttlSeconds,
        });
        return result === "OK";
      },
      async release(identifier: string): Promise<void> {
        await redis.del(paymentLockKey(identifier));
      },
    },
    receipts: {
      insertVerified: insertVerifiedReceipt,
      findByPaymentIdentifier: getReceiptByPaymentIdentifier,
    },
  });
}

type GatewaySingleton = ReturnType<typeof createGatewayService>;

const globalForGateway = globalThis as unknown as {
  metronGatewayService?: GatewaySingleton;
};

/** Shared gateway service singleton (hot-reload safe). */
export const gatewayService: GatewaySingleton =
  globalForGateway.metronGatewayService ??
  (globalForGateway.metronGatewayService = buildGatewayService());
