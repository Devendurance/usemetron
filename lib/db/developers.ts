/**
 * Server-only developer repository.
 *
 * `developers` rows are keyed by the EIP-55 checksummed wallet address so
 * casing differences can never create duplicate identities. The insert path
 * is race-safe: a concurrent insert is detected via `onConflictDoNothing`
 * and resolved by re-selecting the winning row.
 */

import "server-only";

import { eq, sql } from "drizzle-orm";
import { getAddress } from "viem";

import { db } from "./client";
import { developers } from "./schema";

export type DeveloperRow = {
  id: string;
  walletAddress: string;
  createdAt: Date;
  updatedAt: Date;
};

const developerColumns = {
  id: developers.id,
  wallet_address: developers.wallet_address,
  created_at: developers.created_at,
  updated_at: developers.updated_at,
};

type DeveloperDbRow = {
  id: string;
  wallet_address: string;
  created_at: Date;
  updated_at: Date;
};

function mapRow(row: DeveloperDbRow): DeveloperRow {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Resolves the developer owning `walletAddress`, creating the row on first
 * sign-in. Always normalizes to the checksummed address first (viem
 * `getAddress`, throws on invalid input).
 */
export async function upsertDeveloperByWallet(
  walletAddress: `0x${string}`
): Promise<DeveloperRow> {
  const normalized = getAddress(walletAddress);

  const existing = await db
    .select(developerColumns)
    .from(developers)
    .where(eq(developers.wallet_address, normalized))
    .limit(1);
  if (existing.length > 0) {
    const [updated] = await db
      .update(developers)
      .set({ updated_at: sql`now()` })
      .where(eq(developers.wallet_address, normalized))
      .returning(developerColumns);
    if (!updated) {
      throw new Error("developer update returned no row");
    }
    return mapRow(updated);
  }

  const inserted = await db
    .insert(developers)
    .values({ wallet_address: normalized })
    .onConflictDoNothing()
    .returning(developerColumns);
  if (inserted.length > 0) {
    return mapRow(inserted[0]);
  }

  // A concurrent request inserted the same wallet between our select and
  // insert — return the winner's row rather than failing.
  const [winner] = await db
    .select(developerColumns)
    .from(developers)
    .where(eq(developers.wallet_address, normalized))
    .limit(1);
  if (!winner) {
    throw new Error("developer upsert failed: row missing after conflict");
  }
  return mapRow(winner);
}
