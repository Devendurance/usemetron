/**
 * Server-only database client (drizzle + postgres.js singleton).
 *
 * Constructing the postgres.js client does not open a connection — it
 * connects lazily on first query. The global singleton survives hot reload.
 */

import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerEnv } from "../env/server";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  metronDb?: ReturnType<typeof createClient>;
};

function createClient() {
  const { DATABASE_URL } = getServerEnv();
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required to construct the database client");
  }

  const client = postgres(DATABASE_URL, {
    max: 5,
    // Required by drizzle-orm/postgres-js: prepared statements are emulated
    // per connection and cannot be cached across them.
    prepare: false,
  });

  return drizzle(client, { schema });
}

export const db = globalForDb.metronDb ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.metronDb = db;
}
