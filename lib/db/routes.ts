/**
 * Drizzle repository for proxy_routes (server-only).
 *
 * Routes are creator-owned: every query is scoped by developer id at the
 * service layer; this module only provides primitives keyed by id/slug.
 */

import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "./client";
import { proxyRoutes } from "./schema";

type ProxyRoute = typeof proxyRoutes.$inferSelect;

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

function mapRow(row: ProxyRoute): RouteRow {
  return {
    id: row.id,
    developerId: row.developer_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    upstreamUrl: row.upstream_url,
    encryptedUpstreamAuth: row.encrypted_upstream_auth,
    priceMicroUsdc: row.price_micro_usdc,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type InsertRouteData = {
  developerId: string;
  slug: string;
  name: string;
  description: string | null;
  upstreamUrl: string;
  encryptedUpstreamAuth: string | null;
  priceMicroUsdc: number;
  isActive?: boolean;
};

export async function insertRoute(data: InsertRouteData): Promise<RouteRow> {
  const [row] = await db
    .insert(proxyRoutes)
    .values({
      developer_id: data.developerId,
      slug: data.slug,
      name: data.name,
      description: data.description,
      upstream_url: data.upstreamUrl,
      encrypted_upstream_auth: data.encryptedUpstreamAuth,
      price_micro_usdc: data.priceMicroUsdc,
      is_active: data.isActive ?? true,
    })
    .returning();
  return mapRow(row!);
}

export async function listRoutesByDeveloper(
  developerId: string
): Promise<RouteRow[]> {
  const rows = await db
    .select()
    .from(proxyRoutes)
    .where(eq(proxyRoutes.developer_id, developerId))
    .orderBy(desc(proxyRoutes.created_at));
  return rows.map(mapRow);
}

export async function getRouteById(id: string): Promise<RouteRow | null> {
  const [row] = await db
    .select()
    .from(proxyRoutes)
    .where(eq(proxyRoutes.id, id))
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function getRouteBySlug(slug: string): Promise<RouteRow | null> {
  const [row] = await db
    .select()
    .from(proxyRoutes)
    .where(eq(proxyRoutes.slug, slug))
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function routeSlugExists(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: proxyRoutes.id })
    .from(proxyRoutes)
    .where(eq(proxyRoutes.slug, slug))
    .limit(1);
  return row !== undefined;
}

export type UpdateRoutePatch = {
  name?: string;
  description?: string | null;
  upstreamUrl?: string;
  encryptedUpstreamAuth?: string | null;
  priceMicroUsdc?: number;
  isActive?: boolean;
};

export async function updateRoute(
  id: string,
  patch: UpdateRoutePatch
): Promise<RouteRow | null> {
  const [row] = await db
    .update(proxyRoutes)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.upstreamUrl !== undefined ? { upstream_url: patch.upstreamUrl } : {}),
      ...(patch.encryptedUpstreamAuth !== undefined
        ? { encrypted_upstream_auth: patch.encryptedUpstreamAuth }
        : {}),
      ...(patch.priceMicroUsdc !== undefined
        ? { price_micro_usdc: patch.priceMicroUsdc }
        : {}),
      ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
    })
    .where(eq(proxyRoutes.id, id))
    .returning();
  return row ? mapRow(row) : null;
}
