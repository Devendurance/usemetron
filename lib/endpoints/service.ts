/**
 * Endpoint publishing service (injectable, testable).
 *
 * Every route is owned by the authenticated developer; ownership is always
 * derived from the server session, never from client input. Secrets are
 * encrypted with AES-256-GCM before persistence and are never returned in
 * any view.
 */

import { fromMicroUsdc, parseUsdcPrice } from "../celo/amounts";
import type { DecryptedSecret } from "../crypto/upstream-secrets";
import {
  decryptUpstreamSecret,
  encryptUpstreamSecret,
  type UpstreamAuthType,
} from "../crypto/upstream-secrets";
import {
  validateUpstreamAuth,
  type UpstreamAuthInput,
} from "./auth-config";
import { generateSlug } from "./slug";
import {
  validateUpstreamUrl,
  type ValidateUpstreamUrlOptions,
  type UpstreamUrlResult,
} from "../ssrf/validate";

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
  upstreamAuthType: UpstreamAuthType;
  headerName: string | null;
  poweredUrl: string;
  createdAt: Date;
  updatedAt: Date;
};

export type EndpointCreateInput = {
  name: string;
  description?: string;
  upstreamUrl: string;
  priceUsdc: string;
  auth?: UpstreamAuthInput;
};

export type EndpointUpdateInput = {
  name?: string;
  description?: string;
  upstreamUrl?: string;
  priceUsdc?: string;
  isActive?: boolean;
  /** undefined = preserve, null = clear, object = replace */
  auth?: UpstreamAuthInput | null;
};

/** Minimal route repository contract (faked in tests, real in prod). */
export type RouteRow = {
  id: string;
  developerId: string;
  slug: string;
  name: string;
  description: string | null;
  upstreamUrl: string;
  encryptedUpstreamAuth: string | null;
  priceMicroUsdc: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type RouteRepository = {
  insertRoute(data: {
    developerId: string;
    slug: string;
    name: string;
    description: string | null;
    upstreamUrl: string;
    encryptedUpstreamAuth: string | null;
    priceMicroUsdc: number;
    isActive?: boolean;
  }): Promise<RouteRow>;
  listRoutesByDeveloper(developerId: string): Promise<RouteRow[]>;
  getRouteById(id: string): Promise<RouteRow | null>;
  routeSlugExists(slug: string): Promise<boolean>;
  updateRoute(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      upstreamUrl?: string;
      encryptedUpstreamAuth?: string | null;
      priceMicroUsdc?: number;
      isActive?: boolean;
    }
  ): Promise<RouteRow | null>;
};

export class EndpointServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "EndpointServiceError";
    this.code = code;
    this.status = status;
  }
}

const SERVICE_ERROR_CODES = {
  INVALID_INPUT: 400,
  INVALID_UPSTREAM_URL: 400,
  UNSAFE_UPSTREAM_URL: 400,
  INVALID_PRICE: 400,
  INVALID_AUTH_CONFIG: 400,
  ENDPOINT_NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;

export type EndpointServiceErrorCode = keyof typeof SERVICE_ERROR_CODES;

function endpointError(code: EndpointServiceErrorCode): EndpointServiceError {
  return new EndpointServiceError(code, SERVICE_ERROR_CODES[code]);
}

/** Maps raw URL-validation reasons to the public error contract. */
function urlErrorFromResult(result: UpstreamUrlResult): EndpointServiceError {
  if (result.ok) throw new Error("url valid");
  const invalidReasons = new Set([
    "url_malformed",
    "url_unsupported_scheme",
    "url_http_not_allowed",
    "url_embedded_credentials",
  ]);
  return endpointError(
    invalidReasons.has(result.reason) ? "INVALID_UPSTREAM_URL" : "UNSAFE_UPSTREAM_URL"
  );
}

export type EndpointServiceDeps = {
  routes: RouteRepository;
  appUrl: string;
  encryptionKey: Buffer;
  generateSlug?: () => string;
  validateUrl?: (
    input: string,
    options?: ValidateUpstreamUrlOptions
  ) => Promise<UpstreamUrlResult>;
  validateAuth?: typeof validateUpstreamAuth;
  encryptSecret?: typeof encryptUpstreamSecret;
  decryptSecret?: typeof decryptUpstreamSecret;
  now?: () => Date;
  /** Default: `NODE_ENV === "production"`. Overridable for tests. */
  rejectHttp?: boolean;
};

const MAX_SLUG_ATTEMPTS = 5;

export type EndpointService = ReturnType<typeof createEndpointService>;

export function createEndpointService(deps: EndpointServiceDeps) {
  const appUrl = deps.appUrl.replace(/\/+$/, "");
  const slugFor = deps.generateSlug ?? generateSlug;
  const validateUrl =
    deps.validateUrl ??
    ((input: string, options?: ValidateUpstreamUrlOptions) =>
      validateUpstreamUrl(input, options));
  const validateAuth = deps.validateAuth ?? validateUpstreamAuth;
  const encryptSecret = deps.encryptSecret ?? encryptUpstreamSecret;
  const decryptSecret = deps.decryptSecret ?? decryptUpstreamSecret;
  const rejectHttp = deps.rejectHttp ?? process.env.NODE_ENV === "production";

  function poweredUrlFor(slug: string): string {
    return `${appUrl}/p/${slug}`;
  }

  function viewFromRow(row: RouteRow): EndpointView {
    const hasUpstreamAuth = row.encryptedUpstreamAuth !== null;
    let upstreamAuthType: UpstreamAuthType = "NONE";
    let headerName: string | null = null;
    if (row.encryptedUpstreamAuth !== null) {
      try {
        const decrypted: DecryptedSecret = decryptSecret(
          row.encryptedUpstreamAuth,
          deps.encryptionKey
        );
        upstreamAuthType = decrypted.authType;
        headerName = decrypted.headerName;
      } catch {
        // Undecryptable envelope: report auth as present but unusable;
        // never leak the ciphertext or any secret.
        upstreamAuthType = "NONE";
        headerName = null;
      }
    }
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      upstreamUrl: row.upstreamUrl,
      priceMicroUsdc: row.priceMicroUsdc,
      priceUsdc: fromMicroUsdc(String(row.priceMicroUsdc)),
      isActive: row.isActive,
      hasUpstreamAuth,
      upstreamAuthType,
      headerName,
      poweredUrl: poweredUrlFor(row.slug),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async function encryptAuth(
    auth: UpstreamAuthInput | undefined
  ): Promise<string | null> {
    const validated = validateAuth(auth ?? { type: "none" });
    if (!validated.ok) throw endpointError("INVALID_AUTH_CONFIG");
    if (validated.authType === "NONE") return null;
    const input = auth as { secret: string };
    return encryptSecret(input.secret.trim(), deps.encryptionKey, {
      authType: validated.authType,
      headerName: validated.headerName,
    });
  }

  async function validateCommon(input: {
    name?: string;
    description?: string;
    upstreamUrl?: string;
    priceUsdc?: string;
  }): Promise<{
    name: string | undefined;
    description: string | null | undefined;
    upstreamUrl: string | undefined;
    priceMicroUsdc: number | undefined;
  }> {
    let name: string | undefined;
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (trimmed.length === 0 || trimmed.length > 120) {
        throw endpointError("INVALID_INPUT");
      }
      name = trimmed;
    }
    let description: string | null | undefined;
    if (input.description !== undefined) {
      const trimmed = input.description.trim();
      if (trimmed.length > 1000) throw endpointError("INVALID_INPUT");
      description = trimmed === "" ? null : trimmed;
    }
    let upstreamUrl: string | undefined;
    if (input.upstreamUrl !== undefined) {
      const result = await validateUrl(input.upstreamUrl, {
        rejectHttp,
        resolveDns: true,
      });
      if (!result.ok) throw urlErrorFromResult(result);
      upstreamUrl = input.upstreamUrl.trim();
    }
    let priceMicroUsdc: number | undefined;
    if (input.priceUsdc !== undefined) {
      try {
        priceMicroUsdc = parseUsdcPrice(input.priceUsdc);
      } catch (error) {
        if (error instanceof Error && error.name === "PriceValidationError") {
          throw endpointError("INVALID_PRICE");
        }
        throw error;
      }
    }
    return { name, description, upstreamUrl, priceMicroUsdc };
  }

  async function uniqueSlug(): Promise<string> {
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const candidate = slugFor();
      const exists = await deps.routes.routeSlugExists(candidate);
      if (!exists) return candidate;
    }
    throw endpointError("INTERNAL_ERROR");
  }

  return {
    async create(
      developerId: string,
      input: EndpointCreateInput
    ): Promise<EndpointView> {
      const { name, description, upstreamUrl, priceMicroUsdc } =
        await validateCommon(input);
      if (name === undefined || upstreamUrl === undefined || priceMicroUsdc === undefined) {
        throw endpointError("INVALID_INPUT");
      }
      const encrypted = await encryptAuth(input.auth);
      const slug = await uniqueSlug();
      const row = await deps.routes.insertRoute({
        developerId,
        slug,
        name,
        description: description ?? null,
        upstreamUrl,
        encryptedUpstreamAuth: encrypted,
        priceMicroUsdc,
      });
      return viewFromRow(row);
    },

    async list(developerId: string): Promise<EndpointView[]> {
      const rows = await deps.routes.listRoutesByDeveloper(developerId);
      return rows.map(viewFromRow);
    },

    async get(developerId: string, id: string): Promise<EndpointView> {
      const row = await deps.routes.getRouteById(id);
      if (row === null || row.developerId !== developerId) {
        throw endpointError("ENDPOINT_NOT_FOUND");
      }
      return viewFromRow(row);
    },

    async update(
      developerId: string,
      id: string,
      patch: EndpointUpdateInput
    ): Promise<EndpointView> {
      const existing = await deps.routes.getRouteById(id);
      if (existing === null || existing.developerId !== developerId) {
        throw endpointError("ENDPOINT_NOT_FOUND");
      }

      const { name, description, upstreamUrl, priceMicroUsdc } =
        await validateCommon(patch);

      let encryptedUpstreamAuth: string | null | undefined;
      if (patch.auth !== undefined) {
        if (patch.auth === null) {
          // Explicit removal.
          encryptedUpstreamAuth = null;
        } else {
          encryptedUpstreamAuth = await encryptAuth(patch.auth);
        }
      }

      const updated = await deps.routes.updateRoute(id, {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(upstreamUrl !== undefined ? { upstreamUrl } : {}),
        ...(priceMicroUsdc !== undefined ? { priceMicroUsdc } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...(encryptedUpstreamAuth !== undefined
          ? { encryptedUpstreamAuth }
          : {}),
      });
      if (updated === null) {
        throw endpointError("ENDPOINT_NOT_FOUND");
      }
      return viewFromRow(updated);
    },

    /**
     * Retire semantics: soft-delete by disabling the route. The record is
     * preserved because it may later reference financial receipts.
     */
    async remove(
      developerId: string,
      id: string
    ): Promise<{ id: string; retired: boolean }> {
      const existing = await deps.routes.getRouteById(id);
      if (existing === null || existing.developerId !== developerId) {
        throw endpointError("ENDPOINT_NOT_FOUND");
      }
      await deps.routes.updateRoute(id, { isActive: false });
      return { id, retired: true };
    },
  };
}

/** Maps any service error to a safe HTTP response shape. */
export function toEndpointErrorResponse(error: unknown): {
  status: number;
  payload: { error: string };
} {
  if (error instanceof EndpointServiceError) {
    return { status: error.status, payload: { error: error.code } };
  }
  return { status: 500, payload: { error: "INTERNAL_ERROR" } };
}
