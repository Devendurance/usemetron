/**
 * Client-safe mirror of the test console wire contract
 * (POST /api/endpoints/test).
 *
 * Browser-safe (no server-only imports). Mirrors the `TestResult` union
 * from `lib/testconsole/core.ts` (server module) and owns the fetch helper
 * plus the machine-error mapping used by the dashboard test console.
 *
 * Secret hygiene: the draft auth object is forwarded to the API untouched —
 * this module never reads, logs or returns secret values, and error
 * responses are consumed by machine code only (never raw `message` text).
 */

import type { EndpointAuthInput } from "@/lib/endpoints/client";

export type TestRequestInput = {
  method: "GET" | "POST";
  path?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
};

export type RunEndpointTestInput =
  | {
      endpointId: string;
      request: TestRequestInput;
    }
  | {
      draft: { upstreamUrl: string; auth: EndpointAuthInput };
      request: TestRequestInput;
    };

/** Client-side mirror of `lib/testconsole/core.ts` `TestResult`. */
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

export type TestConsoleErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_BODY"
  | "REQUEST_TOO_LARGE"
  | "ENDPOINT_NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class TestConsoleClientError extends Error {
  readonly code: TestConsoleErrorCode;
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: TestConsoleErrorCode,
    status: number,
    retryAfterSeconds: number | null = null
  ) {
    super(`Endpoint test request failed with ${code}`);
    this.name = "TestConsoleClientError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const ERROR_MESSAGES: Record<TestConsoleErrorCode, string> = {
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  INVALID_BODY:
    "The test request was not accepted. Check the path suffix and headers, and make sure the upstream credential is filled in.",
  REQUEST_TOO_LARGE:
    "The test request exceeds the 1 MiB limit. Trim the body and try again.",
  ENDPOINT_NOT_FOUND: "That endpoint is no longer available.",
  RATE_LIMITED: "Too many test requests. Wait a moment and try again.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
};

export function testConsoleErrorMessage(code: TestConsoleErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.INTERNAL_ERROR;
}

const ERROR_CODES: readonly TestConsoleErrorCode[] = [
  "UNAUTHENTICATED",
  "INVALID_BODY",
  "REQUEST_TOO_LARGE",
  "ENDPOINT_NOT_FOUND",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
];

function isErrorCode(value: string): value is TestConsoleErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

const TEST_RESULT_KINDS: ReadonlySet<string> = new Set([
  "success",
  "non_2xx",
  "upstream_failed",
  "ssrf_blocked",
  "invalid_config",
  "timeout",
]);

/**
 * Runs one creator-authorized upstream test. Throws `TestConsoleClientError`
 * with a machine code on any failure; the server never includes secret
 * material in responses and this helper never surfaces raw error text.
 */
export async function runEndpointTest(
  input: RunEndpointTestInput
): Promise<{ result: TestResult }> {
  let response: Response;
  try {
    response = await fetch("/api/endpoints/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new TestConsoleClientError("INTERNAL_ERROR", 0);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errorBody =
      body !== null && typeof body === "object" && "error" in body
        ? (body as { error?: unknown }).error
        : null;
    const retryBody =
      body !== null &&
      typeof body === "object" &&
      "retryAfterSeconds" in body
        ? (body as { retryAfterSeconds?: unknown }).retryAfterSeconds
        : null;
    const code: TestConsoleErrorCode =
      typeof errorBody === "string" && isErrorCode(errorBody)
        ? errorBody
        : "INTERNAL_ERROR";
    throw new TestConsoleClientError(
      code,
      response.status,
      typeof retryBody === "number" ? retryBody : null
    );
  }

  const result =
    body !== null && typeof body === "object" && "result" in body
      ? (body as { result?: unknown }).result
      : null;
  if (
    result === null ||
    typeof result !== "object" ||
    !("kind" in result) ||
    typeof (result as { kind?: unknown }).kind !== "string" ||
    !TEST_RESULT_KINDS.has((result as { kind: string }).kind)
  ) {
    throw new TestConsoleClientError("INTERNAL_ERROR", response.status);
  }
  return { result: result as TestResult };
}
