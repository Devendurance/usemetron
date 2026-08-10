/**
 * Metron x402 facade: facilitator client (server-only), shared capability
 * verification helpers, and the official @x402/core type surface.
 *
 * NOTE: re-exporting the client makes this index server-only. Importing it
 * from client components is a build error by design. Shared code (tests,
 * verification script) should import `./capability` or `./types` directly.
 */

export * from "./capability";
export * from "./types";
export * from "./client";
