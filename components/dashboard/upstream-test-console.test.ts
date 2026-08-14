import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Static source guards for the upstream test console (M1.5A task 6).
 *
 * The console forwards creator-submitted auth to `POST /api/endpoints/test`
 * (transient, never persisted) and must never read or render secret values,
 * and never surface raw error text (which could embed credential-derived
 * content). Deliberately pragmatic: simple source scans, not a JS parser,
 * mirroring the guard style in caller-label.test.ts.
 */

const SOURCE_DIR = fileURLToPath(new URL(".", import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, `file://${SOURCE_DIR}`), "utf8");
}

const consoleSource = readSource("./upstream-test-console.tsx");
const clientSource = readSource("../../lib/testconsole/client.ts");

describe("upstream test console (static guards)", () => {
  it("calls POST /api/endpoints/test through the shared client helper", () => {
    expect(consoleSource).toContain('from "@/lib/testconsole/client"');
    expect(clientSource).toContain('"/api/endpoints/test"');
    expect(clientSource).toContain('method: "POST"');
  });

  it("never reads or renders auth secret values", () => {
    // Property access on the secret would be how a value could leak into a
    // render; forwarding the whole auth object to the API is the only
    // allowed movement.
    expect(consoleSource).not.toMatch(/\.secret\b/);
    expect(consoleSource).not.toContain("bearerSecret");
    expect(consoleSource).not.toContain("apiSecret");
    expect(clientSource).not.toMatch(/\.secret\b/);
  });

  it("never renders the draft auth object into the result panel", () => {
    expect(consoleSource).not.toMatch(/\{draft\(\)\.auth\}/);
    expect(consoleSource).not.toMatch(/\{snapshot\.auth\}/);
  });

  it("result panel never displays raw error text or stack traces", () => {
    expect(consoleSource).not.toContain(".message");
    expect(consoleSource).not.toMatch(/\.stack\b/);
    expect(consoleSource).not.toMatch(/\.toString\(/);
    expect(consoleSource).not.toMatch(/console\.(log|warn|error)/);
    expect(clientSource).not.toContain(".message");
  });

  it("surfaces machine error codes only, never raw error text", () => {
    expect(clientSource).toContain('"UNAUTHENTICATED"');
    expect(clientSource).toContain('"RATE_LIMITED"');
    expect(clientSource).toContain('"INTERNAL_ERROR"');
    expect(consoleSource).toContain("testConsoleErrorMessage");
  });
});
