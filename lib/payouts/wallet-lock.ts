/**
 * Per-wallet payout submission lock (pure, injectable).
 *
 * Serializes the nonce-fetch-through-broadcast section of payout
 * submission per settlement wallet so concurrent submissions cannot
 * nonce-collide (two payout txs signed with the same nonce would
 * otherwise race, silently dropping one).
 *
 * Fail-open by design: when the lock cannot be acquired (contended or
 * Redis unavailable) the run STILL executes with `locked: false` —
 * payout submission is never stranded by a lock outage. The lock is a
 * best-effort serialization aid; the durable UNIQUE ledger_entry_id
 * reservation and crash-safe recovery remain the correctness backstop.
 *
 * Release is always attempted in `finally` when the lock was held, and
 * release errors are swallowed (the Redis TTL is the safety net) so a
 * successful payout is never misreported as a failure.
 */

import { randomUUID } from "node:crypto";

import { payoutWalletLockKey } from "../redis/keys";

export type WalletLockDeps = {
  /** SET NX with a fresh token; resolves true only when this caller holds the lock. */
  acquire(key: string, token: string, ttlSeconds: number): Promise<boolean>;
  /** Best-effort release of the lock (only when it still holds `token`). */
  release(key: string, token: string): Promise<unknown>;
};

export type WalletLockOutcome<T> = {
  result: T;
  /** True when this call held the lock for the whole run. */
  locked: boolean;
};

/**
 * Runs `run` while holding a per-wallet lock (key built from `wallet` via
 * `payoutWalletLockKey`). Returns the run result plus whether the lock was
 * held. `run` errors always propagate; lock failures degrade, never throw.
 */
export async function withPayoutWalletLock<T>(
  input: { wallet: string; ttlSeconds: number },
  deps: WalletLockDeps,
  run: () => Promise<T>
): Promise<WalletLockOutcome<T>> {
  const key = payoutWalletLockKey(input.wallet);
  const token = randomUUID();

  let held = false;
  try {
    try {
      held = await deps.acquire(key, token, input.ttlSeconds);
    } catch {
      // Fail-open: a lock outage must never strand payout submission.
      held = false;
    }
    const result = await run();
    return { result, locked: held };
  } finally {
    if (held) {
      try {
        await deps.release(key, token);
      } catch {
        // Best-effort release; the TTL auto-expires the lock as a backstop.
      }
    }
  }
}
