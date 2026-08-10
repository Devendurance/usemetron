import { describe, expect, it, vi } from "vitest";

import { withPayoutWalletLock, type WalletLockDeps } from "./wallet-lock";
import { payoutWalletLockKey } from "../redis/keys";

const WALLET = "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa";
const TTL_SECONDS = 120;

type Mock = ReturnType<typeof vi.fn>;

function makeLockDeps(overrides: Partial<WalletLockDeps> = {}): {
  deps: WalletLockDeps;
  acquire: Mock;
  release: Mock;
} {
  const acquire = overrides.acquire ?? vi.fn(async () => true);
  const release = overrides.release ?? vi.fn(async () => {});
  const deps: WalletLockDeps = { acquire, release };
  return { deps, acquire: acquire as unknown as Mock, release: release as unknown as Mock };
}

describe("withPayoutWalletLock", () => {
  it("uses the PRD §16 lock key format payout-wallet-lock:{wallet}", () => {
    expect(payoutWalletLockKey(WALLET)).toBe(`payout-wallet-lock:${WALLET}`);
  });

  it("acquires the per-wallet key, runs once, and releases with the same token", async () => {
    const { deps, acquire, release } = makeLockDeps();
    const run = vi.fn(async () => "ok");

    const outcome = await withPayoutWalletLock({ wallet: WALLET, ttlSeconds: TTL_SECONDS }, deps, run);

    expect(outcome).toEqual({ result: "ok", locked: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(acquire).toHaveBeenCalledTimes(1);
    const [key, token, ttl] = acquire.mock.calls[0] as [string, string, number];
    expect(key).toBe(payoutWalletLockKey(WALLET));
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    expect(ttl).toBe(TTL_SECONDS);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(payoutWalletLockKey(WALLET), token);
  });

  it("does not change the run result when the lock is uncontended", async () => {
    const { deps } = makeLockDeps();
    const payload = { kind: "confirmed" as const, txHash: "0xabc", attributionVerified: true };

    const outcome = await withPayoutWalletLock({ wallet: WALLET, ttlSeconds: TTL_SECONDS }, deps, async () => payload);

    expect(outcome.result).toEqual(payload);
  });

  it("releases the lock in finally even when run throws, and the error still propagates", async () => {
    const { deps, acquire, release } = makeLockDeps();
    const boom = new Error("broadcast exploded");
    const run = vi.fn(async () => {
      throw boom;
    });

    await expect(
      withPayoutWalletLock({ wallet: WALLET, ttlSeconds: TTL_SECONDS }, deps, run)
    ).rejects.toThrow("broadcast exploded");
    expect(run).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    const token = (acquire.mock.calls[0] as [string, string])[1];
    expect(release).toHaveBeenCalledWith(payoutWalletLockKey(WALLET), token);
  });

  it("runs anyway with locked:false when the lock is contended (fail-open)", async () => {
    const { deps, release } = makeLockDeps({
      acquire: vi.fn(async () => false),
    });
    const run = vi.fn(async () => "ran");

    const outcome = await withPayoutWalletLock({ wallet: WALLET, ttlSeconds: TTL_SECONDS }, deps, run);

    expect(outcome).toEqual({ result: "ran", locked: false });
    expect(run).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
  });

  it("runs anyway with locked:false when acquire throws (lock outage never strands payouts)", async () => {
    const { deps, release } = makeLockDeps({
      acquire: vi.fn(async () => {
        throw new Error("redis down");
      }),
    });
    const run = vi.fn(async () => "ran");

    const outcome = await withPayoutWalletLock({ wallet: WALLET, ttlSeconds: TTL_SECONDS }, deps, run);

    expect(outcome).toEqual({ result: "ran", locked: false });
    expect(run).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
  });

  it("a failing release is swallowed so a successful payout is not misreported", async () => {
    const { deps } = makeLockDeps({
      release: vi.fn(async () => {
        throw new Error("del failed");
      }),
    });
    const run = vi.fn(async () => "ran");

    const outcome = await withPayoutWalletLock({ wallet: WALLET, ttlSeconds: TTL_SECONDS }, deps, run);

    expect(outcome).toEqual({ result: "ran", locked: true });
  });

  it("a failing release never masks the run error", async () => {
    const boom = new Error("run boom");
    const { deps } = makeLockDeps({
      release: vi.fn(async () => {
        throw new Error("del failed");
      }),
    });
    const run = vi.fn(async () => {
      throw boom;
    });

    await expect(
      withPayoutWalletLock({ wallet: WALLET, ttlSeconds: TTL_SECONDS }, deps, run)
    ).rejects.toThrow("run boom");
  });
});
