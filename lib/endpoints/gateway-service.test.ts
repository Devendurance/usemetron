import { encodePaymentSignatureHeader } from "@x402/core/http";
import { describe, expect, it, vi } from "vitest";

import { CELO_NETWORK, METRON_SETTLEMENT_WALLET, USDC_ADDRESS, X402_SCHEME } from "../celo/config";
import { buildPaymentRequirements } from "../x402/requirements";
import {
  createGatewayService,
  type GatewayServiceDeps,
  type VerifiedRouteContext,
} from "./gateway-service";
import type { PaymentPayload, VerifyRequest, VerifyResponse } from "../x402/types";

const ROUTE: VerifiedRouteContext = {
  id: "route-1",
  developerId: "dev-1",
  slug: "abc123",
  priceMicroUsdc: 5000,
  isActive: true,
};

const RESOURCE_URL = "http://localhost:3126/p/abc123/translate?q=en";

const VALID_AUTHORIZATION = {
  from: "0xAaE584e729EDa3D3bB2eCb3b6Fb8C1dC4a9E5f7B",
  to: METRON_SETTLEMENT_WALLET,
  value: "5000",
  validAfter: "0",
  validBefore: "9999999999",
  nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
};

const REQUIREMENTS = buildPaymentRequirements({ priceMicroUsdc: 5000, resourceUrl: RESOURCE_URL });

function makePayload(nonce = VALID_AUTHORIZATION.nonce): PaymentPayload {
  return {
    x402Version: 2,
    resource: { url: RESOURCE_URL },
    accepted: { ...REQUIREMENTS },
    payload: { authorization: { ...VALID_AUTHORIZATION, nonce } } as never,
  };
}

function signatureFor(nonce = VALID_AUTHORIZATION.nonce): string {
  return encodePaymentSignatureHeader(makePayload(nonce));
}

type Mock = ReturnType<typeof vi.fn>;

function makeDeps(overrides: Partial<GatewayServiceDeps> = {}) {
  const verify = overrides.verify as Mock | undefined ?? vi.fn(async (): Promise<VerifyResponse> => ({ isValid: true }));
  const insertVerified =
    (overrides.receipts?.insertVerified as Mock | undefined) ??
    vi.fn(async () => ({ id: "receipt-1" }));
  const findByPaymentIdentifier =
    (overrides.receipts?.findByPaymentIdentifier as Mock | undefined) ??
    vi.fn(async () => null);
  // Stateful default lock: an identifier can be acquired only once until
  // released, mirroring Redis SET NX semantics.
  const held = new Set<string>();
  const acquire =
    (overrides.replayLock?.acquire as Mock | undefined) ??
    vi.fn(async (identifier: string) => {
      if (held.has(identifier)) return false;
      held.add(identifier);
      return true;
    });
  const release =
    (overrides.replayLock?.release as Mock | undefined) ??
    vi.fn(async (identifier: string) => {
      held.delete(identifier);
    });
  const deps = {
    verify,
    insertVerified,
    findByPaymentIdentifier,
    acquire,
    release,
    replayLock: { acquire, release },
    receipts: { insertVerified, findByPaymentIdentifier },
  };
  return deps as unknown as GatewayServiceDeps & {
    verify: Mock;
    insertVerified: Mock;
    findByPaymentIdentifier: Mock;
    acquire: Mock;
    release: Mock;
  };
}

describe("gateway service — payload rejection", () => {
  it("rejects a malformed PAYMENT-SIGNATURE before any verify call", async () => {
    const deps = makeDeps();
    const service = createGatewayService(deps);

    const result = await service.processSignedRequest({
      route: ROUTE,
      resourceUrl: RESOURCE_URL,
      signatureHeader: "!!!not-base64!!!",
    });

    expect(result).toEqual({ kind: "invalid", reason: "MALFORMED_PAYMENT_SIGNATURE" });
    expect(deps.verify).not.toHaveBeenCalled();
    expect(deps.insertVerified).not.toHaveBeenCalled();
  });

  it("rejects a payload whose amount was changed by the caller", async () => {
    const deps = makeDeps();
    const service = createGatewayService(deps);
    const tampered = makePayload();
    tampered.accepted.amount = "1";

    const result = await service.processSignedRequest({
      route: ROUTE,
      resourceUrl: RESOURCE_URL,
      signatureHeader: encodePaymentSignatureHeader(tampered),
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.reason).toContain("amount");
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it("rejects a payload bound to a different resource", async () => {
    const deps = makeDeps();
    const service = createGatewayService(deps);
    const tampered = makePayload();
    tampered.resource = { url: "http://localhost:3126/p/OTHERROUTE" };

    const result = await service.processSignedRequest({
      route: ROUTE,
      resourceUrl: RESOURCE_URL,
      signatureHeader: encodePaymentSignatureHeader(tampered),
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.reason).toContain("resource");
    expect(deps.verify).not.toHaveBeenCalled();
  });
});

describe("gateway service — facilitator verification", () => {
  it("posts the exact official VerifyRequest shape", async () => {
    const deps = makeDeps();
    const service = createGatewayService(deps);
    const signature = signatureFor();

    await service.processSignedRequest({ route: ROUTE, resourceUrl: RESOURCE_URL, signatureHeader: signature });

    const [request] = deps.verify.mock.calls[0] as [VerifyRequest];
    expect(request.x402Version).toBe(2);
    expect(request.paymentPayload).toEqual(makePayload());
    expect(request.paymentRequirements).toEqual(REQUIREMENTS);
  });

  it("returns invalid (fresh challenge) when the facilitator rejects", async () => {
    const deps = makeDeps({
      verify: vi.fn(async (): Promise<VerifyResponse> => ({
        isValid: false,
        invalidReason: "insufficient_balance",
      })),
    });
    const service = createGatewayService(deps);

    const result = await service.processSignedRequest({
      route: ROUTE,
      resourceUrl: RESOURCE_URL,
      signatureHeader: signatureFor(),
    });

    expect(result).toEqual({ kind: "invalid", reason: "FACILITATOR_REJECTED" });
    expect(deps.insertVerified).not.toHaveBeenCalled();
  });

  it("surfaces facilitator transport failures as verification_unavailable", async () => {
    const networkError = Object.assign(new Error("network"), { status: 0 });
    const timeoutError = Object.assign(new Error("timeout"), { status: 0 });
    const serverError = Object.assign(new Error("boom"), { status: 500 });

    for (const error of [networkError, timeoutError, serverError]) {
      const deps = makeDeps({ verify: vi.fn(async () => { throw error; }) });
      const service = createGatewayService(deps);
      const result = await service.processSignedRequest({
        route: ROUTE,
        resourceUrl: RESOURCE_URL,
        signatureHeader: signatureFor(),
      });
      expect(result.kind).toBe("verification_unavailable");
      expect(deps.insertVerified).not.toHaveBeenCalled();
    }
  });

  it("a valid response means VERIFIED, not settled (no settle anywhere)", async () => {
    const deps = makeDeps();
    const service = createGatewayService(deps);

    const result = await service.processSignedRequest({
      route: ROUTE,
      resourceUrl: RESOURCE_URL,
      signatureHeader: signatureFor(),
    });

    expect(result.kind).toBe("verified");
    // The only outbound call is /verify; nothing else is referenced.
    expect(deps.verify).toHaveBeenCalledTimes(1);
  });
});

describe("gateway service — replay protection", () => {
  it("rejects the same authorization a second time", async () => {
    const deps = makeDeps();
    const service = createGatewayService(deps);
    const signature = signatureFor();

    const first = await service.processSignedRequest({ route: ROUTE, resourceUrl: RESOURCE_URL, signatureHeader: signature });
    expect(first.kind).toBe("verified");

    const second = await service.processSignedRequest({ route: ROUTE, resourceUrl: RESOURCE_URL, signatureHeader: signature });
    expect(second.kind).toBe("replay");
    expect(deps.insertVerified).toHaveBeenCalledTimes(1);
  });

  it("creates exactly one receipt under concurrent identical requests", async () => {
    const deps = makeDeps();
    let held = false;
    deps.replayLock.acquire = vi.fn(async () => {
      if (held) return false;
      held = true;
      return true;
    });
    deps.replayLock.release = vi.fn(async () => {
      held = false;
    });
    const service = createGatewayService(deps);
    const signature = signatureFor();

    const [a, b] = await Promise.all([
      service.processSignedRequest({ route: ROUTE, resourceUrl: RESOURCE_URL, signatureHeader: signature }),
      service.processSignedRequest({ route: ROUTE, resourceUrl: RESOURCE_URL, signatureHeader: signature }),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["replay", "verified"]);
    expect(deps.insertVerified).toHaveBeenCalledTimes(1);
  });

  it("treats a Postgres unique violation as a replay and releases the lock", async () => {
    const deps = makeDeps();
    deps.receipts.insertVerified = vi.fn(async () => null);
    const service = createGatewayService(deps);

    const result = await service.processSignedRequest({
      route: ROUTE,
      resourceUrl: RESOURCE_URL,
      signatureHeader: signatureFor(),
    });

    expect(result).toEqual({ kind: "replay" });
    expect(deps.release).toHaveBeenCalledTimes(1);
  });

  it("accepts different authorizations independently", async () => {
    const deps = makeDeps();
    const service = createGatewayService(deps);

    const a = await service.processSignedRequest({ route: ROUTE, resourceUrl: RESOURCE_URL, signatureHeader: signatureFor("0x0000000000000000000000000000000000000000000000000000000000000001") });
    const b = await service.processSignedRequest({ route: ROUTE, resourceUrl: RESOURCE_URL, signatureHeader: signatureFor("0x0000000000000000000000000000000000000000000000000000000000000002") });

    expect(a.kind).toBe("verified");
    expect(b.kind).toBe("verified");
    expect(deps.insertVerified).toHaveBeenCalledTimes(2);
    const ids = deps.insertVerified.mock.calls.map((c) => c[0].paymentIdentifier);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("never creates a receipt when verification fails", async () => {
    const deps = makeDeps({
      verify: vi.fn(async () => { throw new Error("facilitator down"); }),
    });
    const service = createGatewayService(deps);

    await service.processSignedRequest({ route: ROUTE, resourceUrl: RESOURCE_URL, signatureHeader: signatureFor() });
    expect(deps.insertVerified).not.toHaveBeenCalled();
  });
});

describe("gateway service — durable receipt", () => {
  it("persists exactly one VERIFIED receipt with the canonical fields", async () => {
    const deps = makeDeps();
    const service = createGatewayService(deps);

    const result = await service.processSignedRequest({
      route: ROUTE,
      resourceUrl: RESOURCE_URL,
      signatureHeader: signatureFor(),
    });

    expect(result.kind).toBe("verified");
    if (result.kind === "verified") {
      expect(result.receiptId).toBe("receipt-1");
      expect(result.payer).toBe(VALID_AUTHORIZATION.from.toLowerCase());
    }
    const data = deps.insertVerified.mock.calls[0]?.[0];
    expect(data).toMatchObject({
      routeId: "route-1",
      developerId: "dev-1",
      callerWallet: VALID_AUTHORIZATION.from.toLowerCase(),
      amountMicroUsdc: 5000,
      asset: USDC_ADDRESS,
      network: CELO_NETWORK,
      scheme: X402_SCHEME,
      payTo: METRON_SETTLEMENT_WALLET,
    });
    expect(data.paymentIdentifier).toMatch(/^0x[0-9a-f]{64}$/);
    expect(data.verifiedAt).toBeInstanceOf(Date);
  });
});

describe("gateway service — route isolation", () => {
  it("route A's price cannot affect route B's verification", async () => {
    const deps = makeDeps();
    const service = createGatewayService(deps);
    const routeB: VerifiedRouteContext = { ...ROUTE, id: "route-2", priceMicroUsdc: 10000 };

    // A payload authorized for 5000 must be rejected against route B (10000).
    const result = await service.processSignedRequest({
      route: routeB,
      resourceUrl: "http://localhost:3126/p/abc456",
      signatureHeader: signatureFor(),
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.reason).toContain("amount");
    expect(deps.verify).not.toHaveBeenCalled();
  });
});

describe("gateway service — facilitator 4xx rejection handling", () => {
  it("maps a facilitator 400 + isValid:false to invalid (fresh challenge), not an outage", async () => {
    const rejected = Object.assign(new Error("facilitator rejected"), {
      status: 400,
      body: { isValid: false, invalidReason: "insufficient_balance" },
    });
    const deps = makeDeps({
      verify: vi.fn(async () => {
        throw rejected;
      }),
    });
    const service = createGatewayService(deps);

    const result = await service.processSignedRequest({
      route: ROUTE,
      resourceUrl: RESOURCE_URL,
      signatureHeader: signatureFor(),
    });

    expect(result).toEqual({ kind: "invalid", reason: "FACILITATOR_REJECTED" });
    expect(deps.insertVerified).not.toHaveBeenCalled();
  });

  it("still surfaces genuine 5xx/transport failures as verification_unavailable", async () => {
    const serverError = Object.assign(new Error("boom"), { status: 500, body: {} });
    const deps = makeDeps({ verify: vi.fn(async () => { throw serverError; }) });
    const service = createGatewayService(deps);

    const result = await service.processSignedRequest({
      route: ROUTE,
      resourceUrl: RESOURCE_URL,
      signatureHeader: signatureFor(),
    });

    expect(result.kind).toBe("verification_unavailable");
  });
});

describe("gateway service — settlement handoff", () => {
  it("verified result carries the exact payload+requirements for /settle reuse", async () => {
    const deps = makeDeps();
    const service = createGatewayService(deps);
    const signature = signatureFor();

    const result = await service.processSignedRequest({
      route: ROUTE,
      resourceUrl: RESOURCE_URL,
      signatureHeader: signature,
    });

    expect(result.kind).toBe("verified");
    if (result.kind === "verified") {
      expect(result.paymentPayload).toEqual(makePayload());
      expect(result.paymentRequirements).toEqual(REQUIREMENTS);
      expect(result.paymentIdentifier).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });
});

describe("gateway service — durable replay precheck (M6.1)", () => {
  it.each(["VERIFIED", "UPSTREAM_FAILED", "SETTLEMENT_FAILED", "SETTLEMENT_PENDING", "SETTLED"])(
    "rejects a known %s identifier with 409 BEFORE /verify",
    async (paymentStatus) => {
      const deps = makeDeps({
        receipts: {
          insertVerified: vi.fn(async () => ({ id: "receipt-1" })),
          findByPaymentIdentifier: vi.fn(async () => ({ id: "existing" })),
        },
      });
      const service = createGatewayService(deps);

      const result = await service.processSignedRequest({
        route: ROUTE,
        resourceUrl: RESOURCE_URL,
        signatureHeader: signatureFor(),
      });

      expect(result).toEqual({ kind: "replay" });
      expect(deps.verify).not.toHaveBeenCalled();
      expect(deps.insertVerified).not.toHaveBeenCalled();
      expect(deps.acquire).not.toHaveBeenCalled();
      void paymentStatus;
    }
  );

  it("the replay precheck never mutates the existing receipt", async () => {
    const deps = makeDeps({
      receipts: {
        insertVerified: vi.fn(async () => ({ id: "receipt-1" })),
        findByPaymentIdentifier: vi.fn(async () => ({ id: "existing" })),
      },
    });
    const service = createGatewayService(deps);

    await service.processSignedRequest({
      route: ROUTE,
      resourceUrl: RESOURCE_URL,
      signatureHeader: signatureFor(),
    });

    // Only the read happened; nothing was written or updated.
    expect(deps.insertVerified).not.toHaveBeenCalled();
  });

  it("an unknown identifier continues the normal /verify flow", async () => {
    const deps = makeDeps();
    const service = createGatewayService(deps);

    const result = await service.processSignedRequest({
      route: ROUTE,
      resourceUrl: RESOURCE_URL,
      signatureHeader: signatureFor(),
    });

    expect(result.kind).toBe("verified");
    expect(deps.verify).toHaveBeenCalledTimes(1);
  });

  it("concurrent first-use of an unknown identifier remains protected", async () => {
    const deps = makeDeps();
    const service = createGatewayService(deps);
    const signature = signatureFor();

    const [a, b] = await Promise.all([
      service.processSignedRequest({ route: ROUTE, resourceUrl: RESOURCE_URL, signatureHeader: signature }),
      service.processSignedRequest({ route: ROUTE, resourceUrl: RESOURCE_URL, signatureHeader: signature }),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["replay", "verified"]);
    expect(deps.insertVerified).toHaveBeenCalledTimes(1);
  });
});
