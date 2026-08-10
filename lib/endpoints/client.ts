/**
 * Client-safe fetchers for the Metron endpoints API.
 *
 * This module is browser-safe (no server-only imports) and mirrors the
 * wire contract of `/api/endpoints`. It owns the client-side copy of the
 * `EndpointView` shape and the shared query keys used across dashboard
 * screens.
 *
 * All fetchers return parsed JSON and throw an `EndpointClientError`
 * carrying the server `error` code so UI can map codes to friendly copy.
 */

export type EndpointAuthInput =
  | { type: "none" }
  | { type: "bearer"; secret: string }
  | { type: "apiKey"; headerName: string; secret: string };

export type CreateEndpointInput = {
  name: string;
  description?: string;
  upstreamUrl: string;
  priceUsdc: string;
  auth?: EndpointAuthInput;
};

export type UpdateEndpointPatch = Partial<{
  name: string;
  description: string | null;
  upstreamUrl: string;
  priceUsdc: string;
  isActive: boolean;
  auth: EndpointAuthInput | null;
}>;

export type EndpointView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  upstreamUrl: string;
  priceMicroUsdc: number;
  priceUsdc: string;
  isActive: boolean;
  hasUpstreamAuth: boolean;
  upstreamAuthType: "NONE" | "BEARER" | "API_KEY" | null;
  headerName: string | null;
  poweredUrl: string;
  createdAt: string;
  updatedAt: string;
};

export const endpointQueryKeys = {
  list: ["endpoints"] as const,
  detail: (id: string) => ["endpoints", id] as const,
};

export type EndpointErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "INVALID_UPSTREAM_URL"
  | "UNSAFE_UPSTREAM_URL"
  | "INVALID_PRICE"
  | "INVALID_AUTH_CONFIG"
  | "ENDPOINT_NOT_FOUND"
  | "INTERNAL_ERROR";

export class EndpointClientError extends Error {
  readonly code: EndpointErrorCode;
  readonly status: number;

  constructor(code: EndpointErrorCode, status: number, message?: string) {
    super(message ?? `Endpoint request failed with ${code}`);
    this.name = "EndpointClientError";
    this.code = code;
    this.status = status;
  }
}

const ERROR_MESSAGES: Record<EndpointErrorCode, string> = {
  UNAUTHENTICATED: "Your session has expired. Sign in again to continue.",
  INVALID_INPUT: "Some of the details were not accepted. Check the form and try again.",
  INVALID_UPSTREAM_URL: "Enter a valid HTTP or HTTPS upstream URL.",
  UNSAFE_UPSTREAM_URL:
    "That URL is not allowed (private/local/unsafe destinations are blocked)",
  INVALID_PRICE:
    "Enter a price of at least 0.001 USDC with up to 6 decimal places",
  INVALID_AUTH_CONFIG:
    "The upstream authentication settings are invalid. Review the header name and secret.",
  ENDPOINT_NOT_FOUND: "That endpoint is no longer available.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
};

export function endpointErrorMessage(code: EndpointErrorCode | string): string {
  return ERROR_MESSAGES[code as EndpointErrorCode] ?? ERROR_MESSAGES.INTERNAL_ERROR;
}

/**
 * Parses a decimal USDC string ("0.005") into integer micro-USDC.
 * Returns `null` for malformed, negative or over-precision input.
 */
export function parsePriceMicroUsdc(priceUsdc: string): number | null {
  const value = priceUsdc.trim();
  if (value === "") return null;
  if (!/^\d+(\.\d{1,6})?$/.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  const micros =
    Number(whole) * 1_000_000 + Number((fraction + "000000").slice(0, 6));
  return Number.isFinite(micros) ? micros : null;
}

/**
 * Validates that a string is an absolute http(s) URL suitable as an
 * upstream destination. Returns the parsed URL or `null`.
 */
export function parseUpstreamUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.hostname === "") return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Formats an ISO timestamp as a short readable date ("Jan 15, 2025").
 * Returns a placeholder dash for invalid dates.
 */
export function formatEndpointDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "—";
  // Fixed locale so server and client renders cannot diverge (no mismatch).
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

const ERROR_CODES: readonly EndpointErrorCode[] = [
  "UNAUTHENTICATED",
  "INVALID_INPUT",
  "INVALID_UPSTREAM_URL",
  "UNSAFE_UPSTREAM_URL",
  "INVALID_PRICE",
  "INVALID_AUTH_CONFIG",
  "ENDPOINT_NOT_FOUND",
  "INTERNAL_ERROR",
];

function isEndpointErrorCode(value: string): value is EndpointErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new EndpointClientError("INTERNAL_ERROR", 0, "Could not reach the Metron service.");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errorBody =
      body && typeof body === "object" && "error" in body
        ? (body as { error?: unknown }).error
        : null;
    const code: EndpointErrorCode =
      typeof errorBody === "string" && isEndpointErrorCode(errorBody)
        ? errorBody
        : "INTERNAL_ERROR";
    throw new EndpointClientError(code, response.status);
  }

  return body as T;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function fetchEndpoints(): Promise<{ endpoints: EndpointView[] }> {
  return request<{ endpoints: EndpointView[] }>("/api/endpoints");
}

export function fetchEndpoint(id: string): Promise<{ endpoint: EndpointView }> {
  const safeId = encodeURIComponent(id);
  return request<{ endpoint: EndpointView }>(`/api/endpoints/${safeId}`);
}

export function createEndpoint(
  input: CreateEndpointInput
): Promise<{ endpoint: EndpointView }> {
  return request<{ endpoint: EndpointView }>("/api/endpoints", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function updateEndpoint(
  id: string,
  patch: UpdateEndpointPatch
): Promise<{ endpoint: EndpointView }> {
  const safeId = encodeURIComponent(id);
  return request<{ endpoint: EndpointView }>(`/api/endpoints/${safeId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export function retireEndpoint(
  id: string
): Promise<{ id: string; retired: true }> {
  const safeId = encodeURIComponent(id);
  return request<{ id: string; retired: true }>(`/api/endpoints/${safeId}`, {
    method: "DELETE",
  });
}
