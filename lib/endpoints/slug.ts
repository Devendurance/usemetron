/**
 * Server-generated route slugs.
 *
 * Cryptographically random, URL-safe, non-sequential, 12 characters from
 * 9 random bytes (72 bits). Collision handling is the caller's job (retry
 * against the database); `generateSlug` never uses Math.random(), row
 * counts, or timestamps.
 */

import { randomBytes } from "node:crypto";

/** 12 URL-safe characters (A-Za-z0-9_-), no padding. */
export const SLUG_LENGTH = 12;

/** Base64url keeps the slug URL-safe without `+`/`/`/`=` characters. */
export function generateSlug(): string {
  return randomBytes(9).toString("base64url").slice(0, SLUG_LENGTH);
}

/** Whether a value matches the slug shape (used for input hygiene). */
export function isSlugShape(value: string): boolean {
  return new RegExp(`^[A-Za-z0-9_-]{${SLUG_LENGTH}}$`).test(value);
}
