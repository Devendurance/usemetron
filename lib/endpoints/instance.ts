/**
 * Production wiring for the endpoint service (server-only).
 */

import "server-only";

import { loadUpstreamEncryptionKey } from "../crypto/upstream-secrets";
import { getServerEnv } from "../env/server";
import {
  getRouteById,
  insertRoute,
  listRoutesByDeveloper,
  routeSlugExists,
  updateRoute,
} from "../db/routes";
import { createEndpointService } from "./service";

function buildEndpointService() {
  const env = getServerEnv();
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is required to start the endpoint service");
  }
  const encryptionKey = loadUpstreamEncryptionKey(
    env.UPSTREAM_SECRET_ENCRYPTION_KEY ?? ""
  );

  return createEndpointService({
    appUrl,
    encryptionKey,
    routes: {
      insertRoute,
      listRoutesByDeveloper,
      getRouteById,
      routeSlugExists,
      updateRoute,
    },
  });
}

type EndpointServiceSingleton = ReturnType<typeof createEndpointService>;

const globalForEndpoints = globalThis as unknown as {
  metronEndpointService?: EndpointServiceSingleton;
};

/** Shared endpoint service singleton (hot-reload safe). */
export const endpointService: EndpointServiceSingleton =
  globalForEndpoints.metronEndpointService ??
  (globalForEndpoints.metronEndpointService = buildEndpointService());
