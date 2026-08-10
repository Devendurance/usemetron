"use client"

import Link from "next/link"
import { AlertTriangle, ArrowLeft } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { CopyButton, EmptyState, MetronReceipt, StatusBadge } from "@/components/metron"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/auth/use-auth"
import { formatEndpointDate } from "@/lib/endpoints/client"
import type { PayoutEvidenceView, TransactionDetailView } from "@/lib/dashboard/types"

type TransactionDetailResponse = {
  transaction: TransactionDetailView
}

type TransactionErrorCode = "UNAUTHENTICATED" | "NOT_FOUND" | "INTERNAL_ERROR"

class TransactionClientError extends Error {
  readonly code: TransactionErrorCode
  readonly status: number

  constructor(code: TransactionErrorCode, status: number) {
    super(`Transaction request failed with ${code}`)
    this.name = "TransactionClientError"
    this.code = code
    this.status = status
  }
}

async function fetchTransaction(id: string): Promise<TransactionDetailResponse> {
  const res = await fetch(`/api/transactions/${encodeURIComponent(id)}`)
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }

  if (!res.ok) {
    const errorBody =
      body && typeof body === "object" && "error" in body
        ? (body as { error?: unknown }).error
        : null
    const code: TransactionErrorCode =
      errorBody === "NOT_FOUND"
        ? "NOT_FOUND"
        : errorBody === "UNAUTHENTICATED"
          ? "UNAUTHENTICATED"
          : "INTERNAL_ERROR"
    throw new TransactionClientError(code, res.status)
  }

  const transaction =
    body && typeof body === "object" && "transaction" in body
      ? (body as TransactionDetailResponse).transaction
      : null
  if (transaction === null || typeof transaction !== "object") {
    throw new TransactionClientError("INTERNAL_ERROR", res.status)
  }
  return { transaction }
}

/** Truthful badge color per persisted payment status; unknown statuses stay neutral. */
function statusVariant(status: string): "verified" | "review" | "failed" | "neutral" {
  if (status === "SETTLED") return "verified"
  if (status === "VERIFIED" || status === "SETTLEMENT_PENDING") return "review"
  if (status === "UPSTREAM_FAILED" || status === "SETTLEMENT_FAILED") return "failed"
  return "neutral"
}

/** Truthful badge color per persisted payout status; unknown statuses stay neutral. */
function payoutStatusVariant(status: string): "verified" | "review" | "failed" | "neutral" {
  if (status === "CONFIRMED") return "verified"
  if (status === "SUBMITTED" || status === "PENDING") return "review"
  if (status === "FAILED" || status === "PENDING_RETRY") return "failed"
  return "neutral"
}

function shortTx(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

function EvidenceRow({
  label,
  value,
  copyValue,
  copyLabel,
}: {
  label: string
  value: string
  copyValue: string
  copyLabel: string
}) {
  return (
    <div className="min-w-0">
      <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">{label}</dt>
      <dd className="mt-2 flex min-w-0 flex-wrap items-center gap-3">
        <code className="min-w-0 max-w-full truncate rounded-control border border-border bg-cream px-3 py-2 font-mono text-sm text-ink">{value}</code>
        <CopyButton value={copyValue} label={copyLabel} copiedLabel="Copied" className="min-h-11 border-2 border-ink" />
      </dd>
    </div>
  )
}

function PayoutEvidence({ payout }: { payout: PayoutEvidenceView }) {
  return (
    <dl className="mt-4 grid min-w-0 max-w-full gap-5">
      <div className="min-w-0">
        <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Amount</dt>
        <dd className="mt-2 font-display text-2xl font-bold tracking-[-0.02em] tabular-nums text-ink">{payout.amountUsdc} USDC</dd>
      </div>
      <div>
        <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Status</dt>
        <dd className="mt-2"><StatusBadge variant={payoutStatusVariant(payout.status)}>{payout.status}</StatusBadge></dd>
      </div>
      <div className="min-w-0">
        <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Destination</dt>
        <dd className="mt-2 flex min-w-0 flex-wrap items-center gap-3">
          <code className="min-w-0 max-w-full break-all rounded-control border border-border bg-cream px-3 py-2 font-mono text-sm text-ink">{payout.toWallet}</code>
          <CopyButton value={payout.toWallet} label="Copy destination" copiedLabel="Copied" className="min-h-11 border-2 border-ink" />
        </dd>
      </div>
      <div>
        <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Submitted</dt>
        <dd className="mt-2 font-metadata text-sm font-semibold text-ink">{payout.submittedAt !== null ? formatEndpointDate(payout.submittedAt) : "—"}</dd>
      </div>
      <div>
        <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Confirmed</dt>
        <dd className="mt-2 font-metadata text-sm font-semibold text-ink">{payout.confirmedAt !== null ? formatEndpointDate(payout.confirmedAt) : "—"}</dd>
      </div>
      {payout.attributionTag !== null && (
        <div>
          <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Attribution tag</dt>
          <dd className="mt-2 font-metadata text-sm font-semibold text-ink">{payout.attributionTag}</dd>
        </div>
      )}
      {payout.txHash !== null ? (
        <div className="min-w-0">
          <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Transaction hash</dt>
          <dd className="mt-2 flex min-w-0 flex-wrap items-center gap-3">
            <code className="min-w-0 max-w-full truncate rounded-control border border-border bg-cream px-3 py-2 font-mono text-sm text-ink">{payout.txHash}</code>
            <CopyButton value={payout.txHash} label="Copy payout hash" copiedLabel="Copied" className="min-h-11 border-2 border-ink" />
            {payout.explorerUrl !== null && (
              <a href={payout.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-bold text-blueprint underline underline-offset-2 hover:text-ink focus-visible:shadow-focus focus-visible:outline-none">View on explorer</a>
            )}
          </dd>
        </div>
      ) : (
        <div>
          <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Transaction hash</dt>
          <dd className="mt-2 font-metadata text-sm font-semibold text-ink">—</dd>
        </div>
      )}
    </dl>
  )
}

function TransactionDetail({ id }: { id: string }) {
  const { refresh: refreshAuth } = useAuth()
  const { data, isPending, isError, error, refetch } = useQuery<TransactionDetailResponse>({
    queryKey: ["transactions", id],
    queryFn: () => fetchTransaction(id),
    staleTime: 30_000,
  })

  const transaction = data?.transaction
  const clientError = error instanceof TransactionClientError ? error : null
  const notFound = clientError?.code === "NOT_FOUND"
  const unauthenticated = clientError?.code === "UNAUTHENTICATED"

  if (isPending) {
    return (
      <div aria-live="polite" aria-label="Loading transaction" className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-ink"><Spinner className="size-4 text-blueprint" />Loading call receipt…</div>
        <Skeleton className="h-40 w-full bg-cream" />
        <Skeleton className="h-40 w-full bg-cream" />
      </div>
    )
  }

  if (isError || !transaction) {
    return (
      <EmptyState
        className="mt-3 min-w-0 max-w-full"
        title={notFound ? "Transaction not found" : unauthenticated ? "Your session has expired" : "Transaction unavailable"}
        description={notFound ? "This call receipt does not exist or is no longer available." : unauthenticated ? "Sign in again to view this call receipt." : "The call receipt could not be loaded. Try again in a moment."}
        icon={<AlertTriangle aria-hidden="true" />}
        action={notFound ? (
          <Link href="/dashboard/transactions" className="inline-flex min-h-11 items-center gap-2 rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none"><ArrowLeft className="size-4" aria-hidden="true" />Back to transactions</Link>
        ) : (
          <Button type="button" onClick={() => { if (unauthenticated) refreshAuth(); void refetch() }} className="min-h-11 rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover">Try again</Button>
        )}
      />
    )
  }

  const receiptTransaction =
    transaction.x402TxHash !== null ? (
      transaction.explorerUrl !== null ? (
        <a href={transaction.explorerUrl} target="_blank" rel="noreferrer" title={transaction.x402TxHash} className="underline underline-offset-2 hover:text-ink focus-visible:shadow-focus focus-visible:outline-none">{shortTx(transaction.x402TxHash)}</a>
      ) : (
        <span title={transaction.x402TxHash}>{shortTx(transaction.x402TxHash)}</span>
      )
    ) : null

  return (
    <section className="relative mt-3 min-w-0 max-w-full rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:mt-0 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <p className="font-metadata text-xs font-bold tracking-[0.1em] text-blueprint uppercase">Transaction detail</p>
        <h1 className="font-display text-3xl font-bold tracking-[-0.035em] break-words">{transaction.routeName}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge variant={statusVariant(transaction.paymentStatus)}>{transaction.paymentStatus}</StatusBadge>
          <span className="font-metadata text-xs font-bold tracking-[0.04em] tabular-nums text-muted-ink">{transaction.amountUsdc} USDC · {formatEndpointDate(transaction.createdAt)}</span>
        </div>
      </div>

      <MetronReceipt
        className="mt-6"
        callId={transaction.id.length > 16 ? shortTx(transaction.id) : transaction.id}
        route={transaction.routeName}
        price={`${transaction.amountUsdc} USDC`}
        network="Celo"
        status={transaction.paymentStatus}
        response={transaction.upstreamStatusCode !== null ? `${transaction.upstreamStatusCode}` : "—"}
        creator={transaction.callerWallet !== null ? shortTx(transaction.callerWallet) : "—"}
        transaction={receiptTransaction}
      />

      <dl className="mt-6 grid min-w-0 max-w-full gap-5">
        <EvidenceRow label="Call ID" value={transaction.id} copyValue={transaction.id} copyLabel="Copy call ID" />
        {transaction.x402TxHash !== null && (
          <EvidenceRow label="Transaction hash" value={transaction.x402TxHash} copyValue={transaction.x402TxHash} copyLabel="Copy transaction hash" />
        )}
      </dl>

      <div className="mt-8 border-t border-border pt-6">
        <h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">Creator payout</h2>
        {transaction.payout !== null ? (
          <PayoutEvidence payout={transaction.payout} />
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-muted-ink">No payout is linked to this call.</p>
        )}
      </div>
    </section>
  )
}

export { TransactionDetail }
