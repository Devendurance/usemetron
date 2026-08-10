import { describe, expect, it } from "vitest";

import { generateSlug, isSlugShape, SLUG_LENGTH } from "./slug";

describe("generateSlug", () => {
  it("produces URL-safe unique slugs of the expected length", () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const slug = generateSlug();
      expect(slug).toMatch(new RegExp(`^[A-Za-z0-9_-]{${SLUG_LENGTH}}$`));
      expect(isSlugShape(slug)).toBe(true);
      slugs.add(slug);
    }
    // 1000 draws from 72 bits must never collide in practice.
    expect(slugs.size).toBe(1000);
  });

  it("is not sequential and not derived from timestamps", () => {
    const first = generateSlug();
    const second = generateSlug();
    expect(first).not.toBe(second);
  });
});
