/**
 * Test console (public surface).
 *
 * Pure, injectable core only — no server-only imports, no logging, no
 * payment modules. The production route wires the real upstream service
 * from `lib/gateway/instance.ts`.
 */

export {
  runUpstreamTest,
  TEST_PREVIEW_MAX_BYTES,
  type RunUpstreamTestDeps,
  type RunUpstreamTestInput,
  type TestAuth,
  type TestRequest,
  type TestResult,
} from "./core";
