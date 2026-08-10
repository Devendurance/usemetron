/**
 * Server-only thin typed client for the Celo x402 facilitator
 * (https://api.x402.celo.org).
 *
 * This module is the ONLY place Metron talks HTTP to the facilitator. All
 * requests flow through the private `request` helper; raw `fetch` is never
 * exposed outside this module. Failure paths are typed so later milestones
 * can distinguish auth, credit, rate-limit, timeout, and transport errors.
 *
 * Milestone M0 does not call /verify or /settle — these wrappers exist for
 * later milestones. No payloads are fabricated here.
 *
 * SECURITY: the settlement API key (`X402_API_KEY`) is read server-side and
 * sent only as the `X-API-Key` header on /settle. It is never placed in a
 * URL, request body, error message, or anything client-visible, and is never
 * logged.
 */

import "server-only";

import { getCeloConfig } from "../celo/config";
import { getServerEnv } from "../env/server";
import type {
  SettleRequest,
  SettleResponse,
  SupportedResponse,
  VerifyRequest,
  VerifyResponse,
} from "./types";

/** Per-request timeout for facilitator calls (~10s). */
const REQUEST_TIMEOUT_MS = 10_000;

/** Validated canonical facilitator base URL (must be api.x402.celo.org). */
const FACILITATOR_BASE_URL = getCeloConfig().facilitatorUrl;

/** A facilitator health probe result. Non-2xx responses are reported, not thrown. */
export type FacilitatorHealthResult = {
  ok: boolean;
  /** HTTP status; 0 when the facilitator was unreachable (transport error). */
  status: number;
  body: unknown;
};

type ErrorOptions = {
  path: string;
  method: string;
  message: string;
  /** HTTP status; undefined for transport/parse failures. */
  status?: number;
  /** Response body (parsed JSON when possible, otherwise text), when available. */
  body?: unknown;
  /** Underlying cause (e.g. a fetch TypeError), never printed by this module. */
  cause?: unknown;
};

/** Base error for any failed facilitator interaction (non-2xx, parse, transport). */
export class X402ClientError extends Error {
  readonly path: string;
  readonly method: string;
  readonly status: number | undefined;
  readonly body: unknown;

  constructor(options: ErrorOptions) {
    super(`${options.method} ${options.path} failed: ${options.message}`, {
      cause: options.cause,
    });
    this.name = "X402ClientError";
    this.path = options.path;
    this.method = options.method;
    this.status = options.status;
    this.body = options.body;
  }
}

/** The server-side X402_API_KEY is not configured; /settle cannot be called. */
export class X402ApiKeyMissingError extends Error {
  constructor() {
    super(
      "X402_API_KEY is not configured; /settle requires the facilitator's server-side API key"
    );
    this.name = "X402ApiKeyMissingError";
  }
}

/** 401 — the facilitator rejected our X-API-Key (missing or invalid). */
export class X402UnauthorizedError extends X402ClientError {
  constructor(options: ErrorOptions) {
    super(options);
    this.name = "X402UnauthorizedError";
  }
}

/** 402 — the facilitator account is out of credits. */
export class X402OutOfCreditsError extends X402ClientError {
  constructor(options: ErrorOptions) {
    super(options);
    this.name = "X402OutOfCreditsError";
  }
}

/** 429 — rate limited. */
export class X402RateLimitedError extends X402ClientError {
  /** Seconds suggested by the facilitator's Retry-After header, when present. */
  readonly retryAfterSeconds: number | undefined;

  constructor(options: ErrorOptions & { retryAfterSeconds?: number }) {
    super(options);
    this.name = "X402RateLimitedError";
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** The request exceeded the facilitator timeout. Outcome is indeterminate. */
export class X402TimeoutError extends X402ClientError {
  constructor(path: string, method: string) {
    super({
      path,
      method,
      message: `request exceeded ${REQUEST_TIMEOUT_MS}ms timeout`,
    });
    this.name = "X402TimeoutError";
  }
}

/** Reads a response body as JSON when possible, otherwise raw text (or null). */
async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Parses a 2xx JSON object response, or throws a typed error when the body
 * is not a JSON object (a facilitator contract violation).
 */
async function parseJson<T>(
  res: Response,
  path: string,
  method: string
): Promise<T> {
  const body = await readBody(res);
  if (typeof body === "object" && body !== null) {
    return body as T;
  }
  throw new X402ClientError({
    path,
    method,
    status: res.status,
    body,
    message: "expected a JSON object response body",
  });
}

/**
 * Low-level fetch with timeout. Throws typed errors on transport failure and
 * timeout; returns the Response for HTTP-status handling by the caller.
 */
async function rawRequest(path: string, init: RequestInit): Promise<Response> {
  const url = new URL(
    path.startsWith("/") ? path : `/${path}`,
    FACILITATOR_BASE_URL
  );
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new X402TimeoutError(path, init.method ?? "GET");
    }
    throw new X402ClientError({
      path,
      method: init.method ?? "GET",
      message: "network error reaching facilitator",
      cause: error,
    });
  }
}

/**
 * Shared request pipeline: fetch + typed error mapping for known status
 * codes (401 missing/invalid key, 402 out of credits, 429 rate limit) and a
 * generic X402ClientError for everything else.
 */
async function request(path: string, init: RequestInit): Promise<Response> {
  const res = await rawRequest(path, init);
  if (res.ok) return res;

  const body = await readBody(res);
  const options: ErrorOptions = {
    path,
    method: init.method ?? "GET",
    message: `unexpected status ${res.status}`,
    status: res.status,
    body,
  };

  if (res.status === 401) throw new X402UnauthorizedError(options);
  if (res.status === 402) throw new X402OutOfCreditsError(options);
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    throw new X402RateLimitedError({
      ...options,
      retryAfterSeconds:
        retryAfter === null ? undefined : Number(retryAfter) || undefined,
    });
  }
  throw new X402ClientError(options);
}

/**
 * GET /health — reports facilitator reachability. Never throws for a
 * non-200 response or an unreachable facilitator; the caller decides what
 * to do with the report. Bypasses the throwing status check by design.
 */
export async function fetchHealth(): Promise<FacilitatorHealthResult> {
  try {
    const res = await rawRequest("/health", { method: "GET" });
    const body = await readBody(res);
    return { ok: res.ok, status: res.status, body };
  } catch {
    // Transport or timeout failure: report as unreachable rather than throw.
    return { ok: false, status: 0, body: null };
  }
}

/** GET /supported — the facilitator's advertised kinds, extensions, signers. */
export async function fetchSupported(): Promise<SupportedResponse> {
  const res = await request("/supported", { method: "GET" });
  return parseJson<SupportedResponse>(res, "/supported", "GET");
}

/** POST /verify — asks the facilitator to verify a payment payload. */
export async function verifyPayment(
  body: VerifyRequest
): Promise<VerifyResponse> {
  const res = await request("/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson<VerifyResponse>(res, "/verify", "POST");
}

/**
 * POST /settle — asks the facilitator to settle an authorized payment.
 *
 * Requires the server-side X402_API_KEY, sent as the `X-API-Key` header.
 * The key is never logged, placed in the body, or exposed to clients.
 *
 * Note: when the key is absent, the repo's fail-closed env validator
 * (getServerEnv) typically surfaces the missing variable first as an
 * EnvValidationError; the dedicated error below guards the direct check.
 */
export async function settlePayment(
  body: SettleRequest
): Promise<SettleResponse> {
  const apiKey = getServerEnv().X402_API_KEY;
  if (apiKey === undefined) {
    throw new X402ApiKeyMissingError();
  }

  const res = await request("/settle", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  return parseJson<SettleResponse>(res, "/settle", "POST");
}
