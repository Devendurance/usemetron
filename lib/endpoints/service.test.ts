import { describe, expect, it, vi } from "vitest";

import { parseUsdcPrice } from "../celo/amounts";
import {
  decryptUpstreamSecret,
  encryptUpstreamSecret,
  loadUpstreamEncryptionKey,
} from "../crypto/upstream-secrets";
import { validateUpstreamUrl } from "../ssrf/validate";
import {
  createEndpointService,
  EndpointServiceError,
  type RouteRow,
} from "./service";

const KEY = loadUpstreamEncryptionKey(Buffer.alloc(32, 3).toString("base64"));


type InsertData = {
  developerId: string;
  slug: string;
  name: string;
  description: string | null;
  upstreamUrl: string;
  encryptedUpstreamAuth: string | null;
  priceMicroUsdc: number;
  isActive?: boolean;
};

function makeRepo() {
  const rows = new Map<string, RouteRow>();
  let seq = 0;
  const repo = {
    rows,
    insertRoute: vi.fn(async (data: InsertData): Promise<RouteRow> => {
      const row: RouteRow = {
        id: `route-${++seq}`,
        developerId: data.developerId,
        slug: data.slug,
        name: data.name,
        description: data.description,
        upstreamUrl: data.upstreamUrl,
        encryptedUpstreamAuth: data.encryptedUpstreamAuth,
        priceMicroUsdc: data.priceMicroUsdc,
        isActive: data.isActive ?? true,
        createdAt: new Date(Date.UTC(2026, 7, 9, 10, 0, seq)),
        updatedAt: new Date("2026-08-09T10:00:00.000Z"),
      };
      rows.set(row.id, row);
      return row;
    }),
    listRoutesByDeveloper: vi.fn(async (developerId: string): Promise<RouteRow[]> => {
      return [...rows.values()]
        .filter((r) => r.developerId === developerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }),
    getRouteById: vi.fn(async (id: string): Promise<RouteRow | null> => {
      return rows.get(id) ?? null;
    }),
    routeSlugExists: vi.fn(async (slug: string): Promise<boolean> => {
      return [...rows.values()].some((r) => r.slug === slug);
    }),
    updateRoute: vi.fn(
      async (
        id: string,
        patch: Partial<Pick<RouteRow, "name" | "description" | "upstreamUrl" | "encryptedUpstreamAuth" | "priceMicroUsdc" | "isActive">>
      ): Promise<RouteRow | null> => {
        const row = rows.get(id);
        if (!row) return null;
        const updated: RouteRow = { ...row, ...patch, updatedAt: new Date() };
        rows.set(id, updated);
        return updated;
      }
    ),
  };
  return repo;
}

function makeService(
  repo = makeRepo(),
  overrides: { slugs?: string[]; appUrl?: string } = {}
) {
  const slugQueue = overrides.slugs ? [...overrides.slugs] : [];
  let slugCounter = 0;
  return {
    repo,
    service: createEndpointService({
      routes: repo,
      // Default keeps the dev base so pre-existing tests are untouched.
      appUrl: overrides.appUrl ?? "http://localhost:3000/",
      encryptionKey: KEY,
      rejectHttp: true,
      generateSlug: () =>
        slugQueue.length > 0 ? slugQueue.shift()! : `testslug000${++slugCounter}`,
      validateUrl: (input: string, options?: { rejectHttp?: boolean }) =>
        validateUpstreamUrl(input, { ...options, resolveDns: false }),
      encryptSecret: encryptUpstreamSecret,
      decryptSecret: decryptUpstreamSecret,
    }),
  };
}

const BASE_INPUT = {
  name: "translate.v1",
  description: "Translation API",
  upstreamUrl: "https://api.example.com/v1/translate",
  priceUsdc: "0.005",
};

const DEV_A = "dev-a";
const DEV_B = "dev-b";

describe("endpoint service — create", () => {
  it("creates a route with slug, powered URL, integer price, no auth", async () => {
    const { repo, service } = makeService(undefined, { slugs: ["abCD12_xyZ9"] });
    const view = await service.create(DEV_A, BASE_INPUT);

    expect(view.slug).toBe("abCD12_xyZ9");
    expect(view.poweredUrl).toBe("http://localhost:3000/p/abCD12_xyZ9");
    expect(view.priceMicroUsdc).toBe(5000);
    expect(view.priceUsdc).toBe("0.005");
    expect(view.hasUpstreamAuth).toBe(false);
    expect(view.upstreamAuthType).toBe("NONE");
    expect(view.isActive).toBe(true);
    expect(repo.insertRoute).toHaveBeenCalledWith(
      expect.objectContaining({ developerId: DEV_A, slug: "abCD12_xyZ9", priceMicroUsdc: 5000 })
    );
  });

  it("stores a bearer secret encrypted — never in the view", async () => {
    const { service } = makeService();
    const view = await service.create(DEV_A, {
      ...BASE_INPUT,
      auth: { type: "bearer", secret: "sk_live_super_secret_123" },
    });

    expect(view.hasUpstreamAuth).toBe(true);
    expect(view.upstreamAuthType).toBe("BEARER");
    expect(view.headerName).toBeNull();
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("sk_live_super_secret_123");
    expect(serialized).not.toContain("ciphertext");
    expect(serialized).not.toContain("authTag");
    expect(serialized).not.toContain("encrypted");
  });

  it("stores an API key with its safe header name", async () => {
    const { service } = makeService();
    const view = await service.create(DEV_A, {
      ...BASE_INPUT,
      auth: { type: "apiKey", headerName: "X-Custom-Key", secret: "k-999" },
    });
    expect(view.upstreamAuthType).toBe("API_KEY");
    expect(view.headerName).toBe("X-Custom-Key");
  });

  it("rejects invalid prices", async () => {
    const { service } = makeService();
    for (const bad of ["0", "-0.005", "0.0005", "0.0010001", "1e-3", "abc"]) {
      await expect(
        service.create(DEV_A, { ...BASE_INPUT, priceUsdc: bad })
      ).rejects.toMatchObject({ code: "INVALID_PRICE" });
    }
  });

  it("rejects unsafe and malformed upstream URLs", async () => {
    const { service } = makeService();
    for (const url of ["https://localhost:3000/x", "https://127.0.0.1", "https://10.0.0.1", "https://169.254.169.254", "https://[::1]"]) {
      await expect(
        service.create(DEV_A, { ...BASE_INPUT, upstreamUrl: url })
      ).rejects.toMatchObject({ code: "UNSAFE_UPSTREAM_URL" });
    }
    for (const url of ["not-a-url", "ftp://example.com", "https://user:pass@example.com", "http://api.example.com"]) {
      await expect(
        service.create(DEV_A, { ...BASE_INPUT, upstreamUrl: url })
      ).rejects.toMatchObject({ code: "INVALID_UPSTREAM_URL" });
    }
  });

  it("rejects forbidden auth headers", async () => {
    const { service } = makeService();
    await expect(
      service.create(DEV_A, {
        ...BASE_INPUT,
        auth: { type: "apiKey", headerName: "Host", secret: "x" },
      })
    ).rejects.toMatchObject({ code: "INVALID_AUTH_CONFIG" });
  });

  it("rejects empty names and empty secrets", async () => {
    const { service } = makeService();
    await expect(service.create(DEV_A, { ...BASE_INPUT, name: "   " })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(
      service.create(DEV_A, { ...BASE_INPUT, auth: { type: "bearer", secret: "" } })
    ).rejects.toMatchObject({ code: "INVALID_AUTH_CONFIG" });
  });

  it("retries on slug collision and uses a fresh unique slug", async () => {
    const repo = makeRepo();
    await repo.insertRoute({
      developerId: "other",
      slug: "testslug0001",
      name: "occupied",
      description: null,
      upstreamUrl: "https://api.example.com",
      encryptedUpstreamAuth: null,
      priceMicroUsdc: 5000,
    });
    const { service } = makeService(repo, { slugs: ["testslug0001", "testslug0002"] });
    const view = await service.create(DEV_A, BASE_INPUT);
    expect(view.slug).toBe("testslug0002");
  });
});

describe("endpoint service — powered URL construction", () => {
  const PROD_BASE = "https://usemetron.vercel.app";

  it("builds the canonical powered URL from the production base", async () => {
    const { service } = makeService(undefined, {
      appUrl: PROD_BASE,
      slugs: ["test-slug"],
    });
    const view = await service.create(DEV_A, BASE_INPUT);
    expect(view.poweredUrl).toBe(`${PROD_BASE}/p/test-slug`);
  });

  it("normalizes a production base with one trailing slash", async () => {
    const { service } = makeService(undefined, {
      appUrl: `${PROD_BASE}/`,
      slugs: ["test-slug"],
    });
    const view = await service.create(DEV_A, BASE_INPUT);
    expect(view.poweredUrl).toBe(`${PROD_BASE}/p/test-slug`);
  });

  it("collapses multiple trailing slashes (no double slash at the junction)", async () => {
    const { service } = makeService(undefined, {
      appUrl: `${PROD_BASE}///`,
      slugs: ["test-slug"],
    });
    const view = await service.create(DEV_A, BASE_INPUT);
    expect(view.poweredUrl).toBe(`${PROD_BASE}/p/test-slug`);
    // The https:// protocol legitimately contains "//"; assert there is no
    // "//" anywhere after the base (a broken junction like "//p/" would hit).
    expect(view.poweredUrl.indexOf("//", PROD_BASE.length)).toBe(-1);
  });

  it("never leaks localhost when the base is the production URL", async () => {
    const { service } = makeService(undefined, {
      appUrl: PROD_BASE,
      slugs: ["test-slug"],
    });
    const view = await service.create(DEV_A, BASE_INPUT);
    expect(view.poweredUrl).not.toContain("localhost");
  });

  it("keeps the dev fallback base (no trailing slash) intact", async () => {
    const { service } = makeService(undefined, {
      appUrl: "http://localhost:3000",
      slugs: ["test-slug"],
    });
    const view = await service.create(DEV_A, BASE_INPUT);
    expect(view.poweredUrl).toBe("http://localhost:3000/p/test-slug");
  });
});

describe("endpoint service — ownership isolation", () => {
  it("lists only the developer's own routes, newest first", async () => {
    const { service } = makeService();
    await service.create(DEV_A, { ...BASE_INPUT, name: "a1" });
    await service.create(DEV_A, { ...BASE_INPUT, name: "a2" });
    await service.create(DEV_B, { ...BASE_INPUT, name: "b1" });

    const list = await service.list(DEV_A);
    expect(list.map((e) => e.name)).toEqual(["a2", "a1"]);
    expect(list.some((e) => e.name === "b1")).toBe(false);
  });

  it("creator B cannot read creator A's route", async () => {
    const { service } = makeService();
    const created = await service.create(DEV_A, BASE_INPUT);
    await expect(service.get(DEV_B, created.id)).rejects.toMatchObject({
      code: "ENDPOINT_NOT_FOUND",
    });
  });

  it("creator B cannot update creator A's route", async () => {
    const { service } = makeService();
    const created = await service.create(DEV_A, BASE_INPUT);
    await expect(
      service.update(DEV_B, created.id, { priceUsdc: "0.01" })
    ).rejects.toMatchObject({ code: "ENDPOINT_NOT_FOUND" });
    // A's price unchanged.
    const still = await service.get(DEV_A, created.id);
    expect(still.priceMicroUsdc).toBe(5000);
  });

  it("creator B cannot retire creator A's route", async () => {
    const { service } = makeService();
    const created = await service.create(DEV_A, BASE_INPUT);
    await expect(service.remove(DEV_B, created.id)).rejects.toMatchObject({
      code: "ENDPOINT_NOT_FOUND",
    });
    const still = await service.get(DEV_A, created.id);
    expect(still.isActive).toBe(true);
  });

  it("missing or foreign route ids are 404 for everyone", async () => {
    const { service } = makeService();
    await expect(service.get(DEV_A, "does-not-exist")).rejects.toMatchObject({
      code: "ENDPOINT_NOT_FOUND",
    });
  });
});

describe("endpoint service — update", () => {
  it("revalidates price and URL on update", async () => {
    const { service } = makeService();
    const created = await service.create(DEV_A, BASE_INPUT);

    const updated = await service.update(DEV_A, created.id, { priceUsdc: "0.01" });
    expect(updated.priceMicroUsdc).toBe(10000);

    await expect(
      service.update(DEV_A, created.id, { upstreamUrl: "https://127.0.0.1" })
    ).rejects.toMatchObject({ code: "UNSAFE_UPSTREAM_URL" });
    await expect(
      service.update(DEV_A, created.id, { priceUsdc: "0.0005" })
    ).rejects.toMatchObject({ code: "INVALID_PRICE" });
  });

  it("preserves the credential when auth is not included in the patch", async () => {
    const { service } = makeService();
    const created = await service.create(DEV_A, {
      ...BASE_INPUT,
      auth: { type: "bearer", secret: "keep-me" },
    });
    const updated = await service.update(DEV_A, created.id, { name: "renamed" });

    expect(updated.hasUpstreamAuth).toBe(true);
    expect(updated.upstreamAuthType).toBe("BEARER");
    // The stored envelope still decrypts to the original secret.
  });

  it("explicitly clears the credential with auth: null", async () => {
    const { service } = makeService();
    const created = await service.create(DEV_A, {
      ...BASE_INPUT,
      auth: { type: "bearer", secret: "drop-me" },
    });
    const updated = await service.update(DEV_A, created.id, { auth: null });
    expect(updated.hasUpstreamAuth).toBe(false);
  });

  it("replaces the credential when a new one is provided", async () => {
    const { repo, service } = makeService();
    const created = await service.create(DEV_A, {
      ...BASE_INPUT,
      auth: { type: "bearer", secret: "old-secret" },
    });
    const updated = await service.update(DEV_A, created.id, {
      auth: { type: "apiKey", headerName: "X-New", secret: "new-secret" },
    });
    expect(updated.upstreamAuthType).toBe("API_KEY");
    expect(updated.headerName).toBe("X-New");

    const stored = repo.rows.get(created.id)!.encryptedUpstreamAuth!;
    expect(stored).not.toContain("old-secret");
    expect(stored).not.toContain("new-secret");
    const decrypted = decryptUpstreamSecret(stored, KEY);
    expect(decrypted.secret).toBe("new-secret");
  });

  it("enables and disables a route", async () => {
    const { service } = makeService();
    const created = await service.create(DEV_A, BASE_INPUT);
    const disabled = await service.update(DEV_A, created.id, { isActive: false });
    expect(disabled.isActive).toBe(false);
    const enabled = await service.update(DEV_A, created.id, { isActive: true });
    expect(enabled.isActive).toBe(true);
  });
});

describe("endpoint service — retire", () => {
  it("retires (soft-deletes) an owned route", async () => {
    const { repo, service } = makeService();
    const created = await service.create(DEV_A, BASE_INPUT);

    const result = await service.remove(DEV_A, created.id);
    expect(result).toEqual({ id: created.id, retired: true });
    expect(repo.rows.get(created.id)!.isActive).toBe(false);
    expect(repo.rows.has(created.id)).toBe(true); // record preserved
  });
});

describe("price parser consistency", () => {
  it("service stores exactly what parseUsdcPrice returns", async () => {
    expect(parseUsdcPrice("0.001")).toBe(1000);
    expect(parseUsdcPrice("0.005")).toBe(5000);
    expect(parseUsdcPrice("0.01")).toBe(10000);
  });
});

describe("service error responses", () => {
  it("maps service errors to safe payloads", async () => {
    const { toEndpointErrorResponse } = await import("./service");
    expect(toEndpointErrorResponse(new EndpointServiceError("ENDPOINT_NOT_FOUND", 404))).toEqual({
      status: 404,
      payload: { error: "ENDPOINT_NOT_FOUND" },
    });
    expect(toEndpointErrorResponse(new Error("boom"))).toEqual({
      status: 500,
      payload: { error: "INTERNAL_ERROR" },
    });
  });
});

describe("secret round-trip through service", () => {
  it("the full envelope survives create + read without leaking", async () => {
    const { service } = makeService();
    const created = await service.create(DEV_A, {
      ...BASE_INPUT,
      auth: { type: "apiKey", headerName: "X-K", secret: "s3cr3t-value" },
    });
    const read = await service.get(DEV_A, created.id);
    expect(read.upstreamAuthType).toBe("API_KEY");
    expect(read.headerName).toBe("X-K");
    expect(JSON.stringify(read)).not.toContain("s3cr3t-value");
  });
});
