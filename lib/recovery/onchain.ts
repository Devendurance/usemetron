/**
 * Read-only onchain evidence fetch for settlement recovery (M7.2).
 *
 * Fetches the EIP-3009 AuthorizationUsed event, the consuming transaction
 * receipt (status + USDC Transfer logs in the same tx), and the decoded
 * authorization calldata, then delegates the fail-closed verdict to the
 * pure `assessSettlementEvidence`. Never sends transactions.
 */

import { createPublicClient, http, type Address, type Hex } from "viem";
import { celo } from "viem/chains";
import { eip3009ABI } from "@x402/evm";

import { USDC_ADDRESS } from "../celo/config";
import { assessSettlementEvidence, type EvidenceAssessment, type TransferLog } from "./evidence";

/** Standard EIP-3009 events (FiatToken-compatible). */
export const authorizationUsedAbi = [
  {
    type: "event",
    name: "AuthorizationUsed",
    inputs: [
      { name: "authorizer", type: "address", indexed: true },
      { name: "nonce", type: "bytes32", indexed: true },
    ],
  },
] as const;

/** Standard ERC-20 Transfer event. */
export const transferEventAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

/**
 * EIP-3009 authorization call selectors. Celo USDC (FiatToken) uses the
 * split-signature form:
 *   transferWithAuthorization(address,address,uint256,uint256,uint256,
 *     bytes32,uint8,bytes32,bytes32) = 0xe3ee160e
 * as well as the single-signature variant (0xeb46e437). Both are decoded
 * via the official @x402/evm eip3009ABI.
 */
export const TRANSFER_WITH_AUTHORIZATION_SELECTORS = new Set([
  "0xeb46e437", // (…, bytes32 nonce)  — single signature
  "0xe3ee160e", // (…, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)
  "0xcc562dfb", // receiveWithAuthorization (single signature)
]);

export type RecoveryEvidenceResolver = (params: {
  asset: string;
  payer: string;
  nonceHex: string;
  to: string;
  valueMicroUsdc: bigint;
}) => Promise<EvidenceAssessment>;

export type OnchainEvidenceDeps = {
  rpcUrl: string;
  resolver?: RecoveryEvidenceResolver;
};

export type TransactionEvidence = {
  status: "success" | "reverted";
  authUsedLogs: Array<{ authorizer: string; nonce: string; transactionHash: string }>;
  transferLogs: TransferLog[];
  calldata: {
    from: string;
    to: string;
    value: bigint;
    nonce: string;
  } | null;
};

/**
 * Fetches the transaction evidence for one tx: receipt status, USDC
 * Transfer logs, and decoded authorization calldata.
 */
export async function fetchTransactionEvidence(params: {
  client: {
    getTransactionReceipt(args: { hash: Hex }): Promise<{
      status: "success" | "reverted";
      logs: Array<{ address: string; topics: Hex[]; data: Hex }>;
    } | null>;
    getTransaction(args: { hash: Hex }): Promise<{ input: Hex }>;
  };
  txHash: Hex;
  payer: string;
  nonceHex: string;
}): Promise<TransactionEvidence | null> {
  const { client, txHash, payer, nonceHex } = params;

  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (receipt === null) return null;

  const authUsedLogs = (receipt.logs ?? [])
    .filter((log) => (log.address as string).toLowerCase() === USDC_ADDRESS.toLowerCase())
    .map((log) => {
      const topics = log.topics;
      const authorizer = topics[1] ? `0x${topics[1].slice(26)}` : "";
      const nonce = topics[2] ?? "";
      return { authorizer, nonce, transactionHash: txHash };
    })
    .filter(
      (l) =>
        l.authorizer.toLowerCase() === payer.toLowerCase() &&
        l.nonce.toLowerCase() === nonceHex.toLowerCase()
    );

  // Parse Transfer events from the receipt (only canonical USDC logs).
  const transferLogs: TransferLog[] = (receipt.logs ?? [])
    .filter((log) => (log.address as string).toLowerCase() === USDC_ADDRESS.toLowerCase())
    .map((log) => {
      const topics = log.topics;
      const data = log.data;
      const from = topics[1] ? `0x${topics[1].slice(26)}` : "";
      const to = topics[2] ? `0x${topics[2].slice(26)}` : "";
      const value = data === "0x" ? BigInt(0) : BigInt(data);
      return { from, to, value };
    });

  // Decode the authorization calldata when it is an EIP-3009 call.
  let calldata: TransactionEvidence["calldata"] = null;
  try {
    const tx = await client.getTransaction({ hash: txHash });
    const input = tx.input as Hex;
    if (TRANSFER_WITH_AUTHORIZATION_SELECTORS.has(input.slice(0, 10).toLowerCase())) {
      const { decodeFunctionData } = await import("viem");
      const { args } = decodeFunctionData({ abi: eip3009ABI, data: input });
      const decoded = args as unknown as
        | [Hex, Hex, bigint, bigint, bigint, Hex, ...unknown[]]
        | undefined;
      if (decoded && decoded.length >= 6) {
        const [from, to, value, , , nonce] = decoded;
        calldata = { from, to, value, nonce };
      }
    }
  } catch {
    // Undecodable calldata is acceptable; event evidence still applies.
    calldata = null;
  }

  return {
    status: receipt.status === "success" ? "success" : "reverted",
    authUsedLogs,
    transferLogs,
    calldata,
  };
}

/**
 * Production resolver: fetch + assess. Throws on RPC failure (callers
 * treat errors as "finality unknown").
 */
export function createOnchainEvidenceProvider(deps: OnchainEvidenceDeps) {
  const resolve: RecoveryEvidenceResolver = deps.resolver ?? (async (params) => {
    const client = createPublicClient({ chain: celo, transport: http(deps.rpcUrl) });

    const logs = await client.getLogs({
      address: USDC_ADDRESS as Address,
      event: authorizationUsedAbi[0],
      args: {
        authorizer: params.payer as Address,
        nonce: params.nonceHex as Hex,
      },
      fromBlock: BigInt(0),
      toBlock: "latest",
    });

    if (logs.length === 0) {
      return { status: "not_found" };
    }
    const log = logs[0]!;

    const evidence = await fetchTransactionEvidence({
      client,
      txHash: log.transactionHash,
      payer: params.payer,
      nonceHex: params.nonceHex,
    });
    if (evidence === null) {
      return { status: "conflict", reason: "receipt_unavailable" };
    }

    const authUsed = evidence.authUsedLogs[0] ?? null;
    return assessSettlementEvidence({
      expected: {
        asset: params.asset,
        payer: params.payer,
        payTo: params.to,
        valueMicroUsdc: params.valueMicroUsdc,
        nonceHex: params.nonceHex,
      },
      authUsed,
      transferLogs: evidence.transferLogs,
      txStatus: evidence.status,
      calldata: evidence.calldata,
    });
  });

  return { resolve };
}
