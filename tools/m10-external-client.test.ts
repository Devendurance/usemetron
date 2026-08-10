import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describeResponseBody } from "./m10-external-client.mjs";

/**
 * Static source guards for tools/m10-external-client.mjs.
 *
 * Deliberately pragmatic: simple regex/source scans, not a JS parser.
 * The client source is small and hand-maintained, so these scans are robust
 * to the formatting used there.
 */

const SOURCE_PATH = fileURLToPath(
  new URL("./m10-external-client.mjs", import.meta.url)
);
const source = readFileSync(SOURCE_PATH, "utf8");

// The only import prefixes the client may use.
const ALLOWED_IMPORT_PREFIXES = ["@x402/", "viem/", "node:"];

// Project-internal path fragments that must never appear in an import.
const FORBIDDEN_IMPORT_FRAGMENTS = ["lib/", "app/", "@/", "db", "redis"];

function collectImportSpecifiers(src: string): string[] {
  const specifiers: string[] = [];
  // Every import in the client uses `from "..."`, and nothing else in the
  // file uses `from "..."`, so this scan covers all imports.
  const re = /from\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

describe("tools/m10-external-client.mjs (static guards)", () => {
  it("has zero project-internal imports (only @x402/*, viem/*, node:*)", () => {
    const specifiers = collectImportSpecifiers(source);
    expect(specifiers.length).toBeGreaterThan(0);

    for (const specifier of specifiers) {
      const allowed = ALLOWED_IMPORT_PREFIXES.some((prefix) =>
        specifier.startsWith(prefix)
      );
      expect(
        allowed,
        `import of "${specifier}" is not an allowed public package/builtin`
      ).toBe(true);

      for (const fragment of FORBIDDEN_IMPORT_FRAGMENTS) {
        expect(
          specifier.includes(fragment),
          `import "${specifier}" contains project-internal fragment "${fragment}"`
        ).toBe(false);
      }
    }
  });

  it("references both M10_BUYER_PRIVATE_KEY and M10_METRON_URL", () => {
    expect(source).toContain("M10_BUYER_PRIVATE_KEY");
    expect(source).toContain("M10_METRON_URL");
  });

  it("never prints the private key or PAYMENT-SIGNATURE", () => {
    // Scan every console.log / console.error call argument (single-line
    // calls, which is how the client is written). If the argument mentions
    // the key variable or the payment signature header, that is a violation.
    const consoleCallRe = /console\.(log|error)\s*\(([^)]*)\)/g;
    const forbidden = /(M10_BUYER_PRIVATE_KEY|privateKey|PAYMENT-SIGNATURE)/;
    const violations: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = consoleCallRe.exec(source)) !== null) {
      if (forbidden.test(match[2])) {
        violations.push(`console.${match[1]}(${match[2]})`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("guards main() execution behind the ESM CLI entry check", () => {
    // The CLI must not run when the module is imported (tests import it).
    expect(source).toContain("import.meta.url");
    expect(source).toContain("process.argv[1]");
    expect(source).toContain("void main()");
  });
});

describe("describeResponseBody (unit)", () => {
  it("pretty-prints a JSON object body", () => {
    expect(
      describeResponseBody({ ok: true, n: 1 }, "application/json")
    ).toBe('{\n  "ok": true,\n  "n": 1\n}');
  });

  it("passes string bodies through as-is", () => {
    expect(describeResponseBody("plain text", "text/plain")).toBe(
      "plain text"
    );
  });

  it("returns (empty body) for null and undefined", () => {
    expect(describeResponseBody(null, "text/plain")).toBe("(empty body)");
    expect(describeResponseBody(undefined, null)).toBe("(empty body)");
  });

  it("renders non-string primitives via String()", () => {
    expect(describeResponseBody(42, "application/json")).toBe("42");
    expect(describeResponseBody(false, null)).toBe("false");
  });

  it("renders Buffer bodies as text, not JSON noise", () => {
    expect(describeResponseBody(Buffer.from("hi"), "text/plain")).toBe("hi");
  });

  it("never throws on hostile input", () => {
    const circular: { self: unknown } = { self: null };
    circular.self = circular;

    expect(() =>
      describeResponseBody(circular, "application/json")
    ).not.toThrow();
    expect(() =>
      describeResponseBody(
        {
          toString() {
            throw new Error("boom");
          },
        },
        null
      )
    ).not.toThrow();
    expect(() => describeResponseBody(Symbol("x"), null)).not.toThrow();
  });
});
