/**
 * Test console core (pure, injectable).
 *
 * Runs a creator-authorized test request through the SAME hardened
 * upstream path the paid gateway uses — the production
 * `upstreamService.executeUpstream` (runtime SSRF revalidation + DNS pin,
 * decrypt, creator-header injection after caller-header filtering,
 * compression normalization, response bounds, redirects never followed).
 * It is never a weaker parallel HTTP client.
 *
 * Auth handling mirrors the publish path exactly: the plaintext credential
 * is validated with `validateUpstreamAuth`, encrypted with the real
 * AES-256-GCM encryptor, and handed to the service, which decrypts it and
 * invokes the M11.1 `onDecrypt` wiring — so a transient test secret is
 * registered with the log redactor automatically. Nothing is persisted and
 * nothing is logged by this module.
 *
 * Money safety: no settlement, no ledger, no payouts — the only side
 * effects are the upstream request itself.
 */

import { encryptUpstreamSecret } from "../crypto/upstream-secrets";
import { validateUpstreamAuth, type UpstreamAuthInput } from "../endpoints/auth-config";
import { MAX_CALLER_BODY_BYTES, UPSTREAM_ERROR_CODES } from "../gateway/limits";
import type {
  UpstreamExecutionInput,
  UpstreamExecutionResult,
  UpstreamService,
} from "../gateway/upstream-service";
import { redactFields } from "../observability/redact";
import { validateUpstreamUrl, type UpstreamUrlResult } from "../ssrf/validate";

/** Preview cap for test results (the backend capture cap is 5 MiB). */
export const TEST_PREVIEW_MAX_BYTES = 64 * 1024;

/**
 * Fixed route context identity for console executions. The real gateway
 * never runs from this context (no receipts, no settlement), so the
 * identity is purely informational.
 */
const TEST_ROUTE_ID = "test-console";

export type TestAuth =
  | { type: "NONE" }
  | { type: "BEARER"; secret: string }
  | { type: "API_KEY"; headerName: string; secret: string };

export type TestRequest = {
  method: "GET" | "POST";
  callerPathSegments: string[];
  callerQuery: URLSearchParams;
  callerHeaders: Record<string, string>;
  body: Buffer | null;
};

export type RunUpstreamTestInput = {
  upstreamUrl: string;
  auth: TestAuth;
  request: TestRequest;
};

export type TestResult =
  | {
      kind: "success";
      status: number;
      latencyMs: number;
      contentType: string | null;
      bodyPreview: string;
      bodyBytes: number;
      previewTruncated: boolean;
      isJson: boolean;
    }
  | { kind: "non_2xx"; status: number; latencyMs: number; errorCode: string }
  | { kind: "upstream_failed"; errorCode: string; latencyMs: number }
  | { kind: "ssrf_blocked"; reason: string }
  | { kind: "invalid_config"; reason: string }
  | { kind: "timeout"; latencyMs: number };

export type RunUpstreamTestDeps = {
  /** The REAL production service (injected here for tests). */
  executeUpstream: UpstreamService["executeUpstream"];
  /** Real encryptor: auth goes through the same encrypt -> decrypt path. */
  encryptSecret: typeof encryptUpstreamSecret;
  encryptionKey: Buffer;
  now: () => number;
};

/** URL validation reasons that are configuration errors, not security blocks. */
const CONFIG_URL_REASONS = new Set([
  "url_empty",
  "url_malformed",
  "url_unsupported_scheme",
  "url_http_not_allowed",
  "url_embedded_credentials",
]);

function urlFailure(result: UpstreamUrlResult & { ok: false }): TestResult {
  return CONFIG_URL_REASONS.has(result.reason)
    ? { kind: "invalid_config", reason: result.reason }
    : { kind: "ssrf_blocked", reason: result.reason };
}

function toUpstreamAuthInput(auth: TestAuth): UpstreamAuthInput {
  switch (auth.type) {
    case "NONE":
      return { type: "none" };
    case "BEARER":
      return { type: "bearer", secret: auth.secret };
    case "API_KEY":
      return { type: "apiKey", headerName: auth.headerName, secret: auth.secret };
  }
}

function isJsonContentType(contentType: string | null): boolean {
  return contentType !== null && /json/i.test(contentType);
}

/** Text-ish content types are rendered; everything else is binary metadata. */
function isTextContentType(contentType: string | null): boolean {
  if (contentType === null) return true;
  if (/^text\//i.test(contentType)) return true;
  return /json|xml|javascript|x-www-form-urlencoded|svg|graphql|yaml/i.test(contentType);
}

function prettyJsonOrRaw(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Truncates to `maxBytes` UTF-8 bytes without splitting a character. */
function truncateUtf8(value: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return { text: value, truncated: false };
  }
  let text = "";
  let bytes = 0;
  for (const char of value) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (bytes + charBytes > maxBytes) break;
    text += char;
    bytes += charBytes;
  }
  return { text, truncated: true };
}

function successResult(
  execution: Extract<UpstreamExecutionResult, { kind: "success" }>,
  latencyMs: number,
  activeSecret: string
): TestResult {
  const contentType = execution.safeResponseHeaders["content-type"] ?? null;
  const bodyBytes = execution.responseBody.byteLength;
  const isJson = isJsonContentType(contentType);

  // Server-side preview redaction: an echo upstream (httpbin/headers,
  // postman-echo) can reflect the injected credential in the response
  // body. The redactor's leaf substitution replaces any value containing
  // the active secret with [REDACTED] — the whole preview collapses to the
  // marker, which is safe by construction ("the secret is never shown").
  // The redacted text is what gets pretty-printed/truncated.
  const redactedPreview = (text: string): string =>
    (redactFields({ body: text }, [activeSecret]).body as string | undefined) ?? text;

  if (isTextContentType(contentType)) {
    const decoded = execution.responseBody.toString("utf8");
    const rendered = isJson
      ? prettyJsonOrRaw(redactedPreview(decoded))
      : redactedPreview(decoded);
    const bounded = truncateUtf8(rendered, TEST_PREVIEW_MAX_BYTES);
    return {
      kind: "success",
      status: execution.status,
      latencyMs,
      contentType,
      bodyPreview: bounded.text,
      bodyBytes,
      previewTruncated: bounded.truncated,
      isJson,
    };
  }

  return {
    kind: "success",
    status: execution.status,
    latencyMs,
    contentType,
    bodyPreview: redactedPreview(
      `[binary] ${contentType ?? "unknown"}, ${bodyBytes} bytes`
    ),
    bodyBytes,
    previewTruncated: bodyBytes > TEST_PREVIEW_MAX_BYTES,
    isJson: false,
  };
}

/**
 * Runs one creator-authorized upstream test. Never throws: every failure
 * mode is a truthfully classified `TestResult`.
 */
export async function runUpstreamTest(
  input: RunUpstreamTestInput,
  deps: RunUpstreamTestDeps
): Promise<TestResult> {
  // 1. Publication-grade SSRF validation (incl. DNS) BEFORE execution.
  //    The service re-validates and pins at runtime as well.
  const urlResult = await validateUpstreamUrl(input.upstreamUrl, {
    rejectHttp: process.env.NODE_ENV === "production",
    resolveDns: true,
  });
  if (!urlResult.ok) return urlFailure(urlResult);

  // 2. Caller body bound — the same 1 MiB cap the paid gateway enforces.
  if (
    input.request.body !== null &&
    input.request.body.byteLength > MAX_CALLER_BODY_BYTES
  ) {
    return { kind: "invalid_config", reason: "request_body_too_large" };
  }

  // 3. Auth: the publish path's validator, then the real encryptor. The
  //    service decrypts this envelope and registers the plaintext with
  //    the log redactor (M11.1) before injecting it.
  const validated = validateUpstreamAuth(toUpstreamAuthInput(input.auth));
  if (!validated.ok) {
    return { kind: "invalid_config", reason: validated.reason };
  }
  // The exact value injected upstream (trimmed, matching encryptSecret);
  // used to redact echoed previews. Empty for NONE auth.
  const activeSecret = input.auth.type === "NONE" ? "" : input.auth.secret.trim();
  let encryptedUpstreamAuth: string | null = null;
  if (validated.authType !== "NONE" && input.auth.type !== "NONE") {
    try {
      encryptedUpstreamAuth = deps.encryptSecret(
        activeSecret,
        deps.encryptionKey,
        { authType: validated.authType, headerName: validated.headerName }
      );
    } catch {
      return { kind: "invalid_config", reason: "secret_encryption_failed" };
    }
  }

  const executionInput: UpstreamExecutionInput = {
    route: {
      id: TEST_ROUTE_ID,
      developerId: TEST_ROUTE_ID,
      slug: TEST_ROUTE_ID,
      upstreamUrl: input.upstreamUrl.trim(),
      encryptedUpstreamAuth,
    },
    encryptionKey: deps.encryptionKey,
    method: input.request.method,
    callerPathSegments: input.request.callerPathSegments,
    callerQuery: input.request.callerQuery,
    callerHeaders: input.request.callerHeaders,
    body: input.request.body,
  };

  const started = deps.now();
  let execution: UpstreamExecutionResult;
  try {
    execution = await deps.executeUpstream(executionInput);
  } catch {
    // Total contract: the hardened path never throws in practice, but an
    // unexpected failure must still surface as a truthful classification.
    return {
      kind: "upstream_failed",
      errorCode: "UPSTREAM_EXECUTION_FAILED",
      latencyMs: deps.now() - started,
    };
  }
  const latencyMs = deps.now() - started;

  switch (execution.kind) {
    case "success":
      return successResult(execution, latencyMs, activeSecret);
    case "failed":
      if (execution.errorCode === UPSTREAM_ERROR_CODES.TIMEOUT) {
        return { kind: "timeout", latencyMs };
      }
      if (
        execution.errorCode === UPSTREAM_ERROR_CODES.NON_2XX &&
        execution.status !== null
      ) {
        // Truthful: 3xx/4xx/5xx from the upstream is a non-2xx result,
        // never a synthetic transport error. Redirects are never followed.
        return {
          kind: "non_2xx",
          status: execution.status,
          latencyMs,
          errorCode: execution.errorCode,
        };
      }
      // Everything else — transport failures, unsafe destinations, and
      // service-level decode failures (which carry a 2xx upstream status)
      // — is an upstream execution failure, never non_2xx.
      return { kind: "upstream_failed", errorCode: execution.errorCode, latencyMs };
    case "request_rejected":
      return { kind: "invalid_config", reason: execution.errorCode };
  }
}
