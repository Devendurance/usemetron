/**
 * Drizzle Kit configuration.
 *
 * Loads DATABASE_URL from .env when present (Node 20.12+ `loadEnvFile`);
 * generation does not require a reachable database, only the URL to be set
 * for `drizzle-kit migrate`/`studio` commands.
 */

import { defineConfig } from "drizzle-kit";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch {
  // No .env file — DATABASE_URL may come from the process environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
