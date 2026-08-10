/**
 * Server-side SIWE (EIP-4361) message construction and validation.
 *
 * The SIWE message is always built SERVER-SIDE from the validated
 * `NEXT_PUBLIC_APP_URL`; a client-supplied message is only ever parsed and
 * verified against the expected domain/uri/chain/nonce/expiry.
 *
 * NOTE: deliberately NO `server-only` import (same rationale as
 * `lib/redis/keys.ts`): unit tests import this module under plain Node,
 * where the `server-only` marker package throws at import time. The only
 * production entry point is `lib/auth/service.ts`, which IS server-only
 * and wires this module to the validated server environment.
 */

import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  isHex,
  type HttpTransport,
} from "viem";
import { celo } from "viem/chains";
import {
  createSiweMessage,
  parseSiweMessage,
  verifySiweMessage as viemVerifySiweMessage,
} from "viem/siwe";

import { CELO_CHAIN_ID } from "../celo/config";

export const SIWE_STATEMENT = "Sign in to Metron.";
export const SIWE_EXPIRATION_MINUTES = 5;

export type SiweContext = {
  /** RFC 3986 authority requesting the signing (e.g. `app.metron.dev`). */
  domain: string;
  /** Origin URI that is the subject of the signing. */
  uri: string;
};

/**
 * Derives the SIWE domain/uri from `NEXT_PUBLIC_APP_URL`.
 *
 * `source` is injectable for tests; production reads `process.env`. Throws
 * a clear error when the URL is missing or unparsable (fail-closed).
 */
export function getSiweContext(
  source: Record<string, string | undefined> = process.env
): SiweContext {
  const rawAppUrl = source.NEXT_PUBLIC_APP_URL;
  if (!rawAppUrl) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not configured; cannot derive the SIWE domain/uri"
    );
  }
  let url: URL;
  try {
    url = new URL(rawAppUrl);
  } catch {
    throw new Error(`NEXT_PUBLIC_APP_URL is not a valid URL: "${rawAppUrl}"`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(
      `NEXT_PUBLIC_APP_URL must be an http(s) URL, got: "${rawAppUrl}"`
    );
  }
  return { domain: url.hostname, uri: url.origin };
}

export type BuildSiweMessageParams = {
  address: `0x${string}`;
  nonce: string;
  issuedAt?: Date;
  /** Injectable context; defaults to the validated server environment. */
  context?: SiweContext;
};

/**
 * Builds the EIP-4361 message the wallet must sign. Uses the fresh
 * server-side nonce and expires `issuedAt + 5 minutes`.
 */
export function buildSiweMessage({
  address,
  nonce,
  issuedAt = new Date(),
  context,
}: BuildSiweMessageParams): string {
  const { domain, uri } = context ?? getSiweContext();
  return createSiweMessage({
    domain,
    address,
    statement: SIWE_STATEMENT,
    uri,
    version: "1",
    chainId: CELO_CHAIN_ID,
    nonce,
    issuedAt,
    expirationTime: new Date(
      issuedAt.getTime() + SIWE_EXPIRATION_MINUTES * 60_000
    ),
  });
}

/** A single field-level validation problem. */
export type SiweFieldIssue = {
  field: string;
  reason: string;
};

/** Fields the server expects the submitted message to match. */
export type SiweExpectedFields = {
  domain: string;
  uri: string;
  chainId: number;
  nonce?: string;
  /** Overridable clock for tests; defaults to the server's current time. */
  now?: Date;
};

/** Parsed message shape returned by viem's `parseSiweMessage` (all optional). */
export type ParsedSiweMessage = Awaited<ReturnType<typeof parseSiweMessage>>;

export type SiweValidationResult =
  | { ok: true; parsed: ParsedSiweMessage }
  | { ok: false; issues: SiweFieldIssue[] };

/**
 * Parses and validates a submitted SIWE message against the expected
 * domain/uri/chainId/nonce. Checks run in order and every failing field is
 * reported; a missing `expirationTime` is REJECTED (no implicit expiry).
 */
export function validateSiweMessageFields(
  message: string,
  expected: SiweExpectedFields
): SiweValidationResult {
  if (typeof message !== "string" || message.length === 0) {
    return {
      ok: false,
      issues: [{ field: "address", reason: "message is missing or not a string" }],
    };
  }

  const issues: SiweFieldIssue[] = [];
  const parsed = parseSiweMessage(message);

  // 1. Parseable and address present + viem-valid.
  if (!parsed.address || !isAddress(parsed.address)) {
    issues.push({
      field: "address",
      reason: "message does not contain a valid Ethereum address",
    });
  }
  // 2. Domain must match the app's host.
  if (parsed.domain !== expected.domain) {
    issues.push({ field: "domain", reason: `expected domain "${expected.domain}"` });
  }
  // 3. URI must match the app's origin.
  if (parsed.uri !== expected.uri) {
    issues.push({ field: "uri", reason: `expected uri "${expected.uri}"` });
  }
  // 4. SIWE version must be "1".
  if (parsed.version !== "1") {
    issues.push({ field: "version", reason: 'expected version "1"' });
  }
  // 5. Chain id must be Celo Mainnet.
  if (parsed.chainId !== expected.chainId) {
    issues.push({
      field: "chainId",
      reason: `expected chain id ${expected.chainId}`,
    });
  }
  // 6. Nonce must match the expected challenge nonce when known (the auth
  //    flow learns the nonce by parsing, so presence is enforced via the
  //    atomic Redis consume instead).
  if (expected.nonce !== undefined && parsed.nonce !== expected.nonce) {
    issues.push({ field: "nonce", reason: "nonce does not match the challenge" });
  }
  // 7. Expiration must exist and be in the future (server time).
  const now = expected.now ?? new Date();
  if (!parsed.expirationTime) {
    issues.push({ field: "expirationTime", reason: "message has no expiration time" });
  } else if (parsed.expirationTime.getTime() <= now.getTime()) {
    issues.push({ field: "expirationTime", reason: "message has expired" });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, parsed };
}

/** Thrown when on-chain signature verification cannot complete (transport). */
export class SiweVerificationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SiweVerificationError";
  }
}

export type SiweSignatureVerifier = (params: {
  message: string;
  signature: `0x${string}`;
  address: `0x${string}`;
}) => Promise<boolean>;

/** Exact type of the lazily-created Celo Mainnet public client. */
type CeloPublicClient = ReturnType<
  typeof createPublicClient<HttpTransport, typeof celo>
>;

let celoPublicClient: CeloPublicClient | undefined;

function getCeloPublicClient(): CeloPublicClient {
  if (celoPublicClient !== undefined) {
    return celoPublicClient;
  }
  if (celo.id !== CELO_CHAIN_ID) {
    throw new Error(
      `viem "celo" chain id mismatch: expected ${CELO_CHAIN_ID}, got ${celo.id}`
    );
  }
  // CELO_RPC_URL is validated server-side; fall back to the canonical
  // public RPC when unset. Read lazily so unit tests never need it.
  const rpcUrl = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
  celoPublicClient = createPublicClient({ chain: celo, transport: http(rpcUrl) });
  return celoPublicClient;
}

/**
 * Default verifier: viem `verifySiweMessage` against the Celo public
 * client. Supports EOAs and smart wallets via ERC-6492. Invalid signatures
 * return `false`; transport/RPC failures throw `SiweVerificationError`.
 */
const defaultVerifier: SiweSignatureVerifier = async ({
  message,
  signature,
  address,
}) => {
  if (!isHex(signature)) {
    return false;
  }
  try {
    return await viemVerifySiweMessage(getCeloPublicClient(), {
      message,
      signature,
      address,
    });
  } catch (error) {
    throw new SiweVerificationError(
      "SIWE signature verification failed",
      { cause: error }
    );
  }
};

/**
 * Verifies the signature over the message against the address embedded in
 * the message. The verifier is injectable so tests can use a pure EOA-only
 * implementation without any RPC.
 */
export async function verifySiweSignature(
  message: string,
  signature: `0x${string}`,
  verifier: SiweSignatureVerifier = defaultVerifier
): Promise<boolean> {
  const parsed = parseSiweMessage(message);
  if (!parsed.address) {
    return false;
  }
  let address: `0x${string}`;
  try {
    address = getAddress(parsed.address);
  } catch {
    return false;
  }
  return verifier({ message, signature, address });
}
