"use client"

import Link from "next/link"
import { AlertTriangle, Filter, ReceiptText } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { EmptyState, StatusBadge } from "@/components/metron"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth/use-auth"
import { formatEndpointDate } from "@/lib/endpoints/client"
import type { TransactionView } from "@/lib/dashboard/types"

type TransactionsResponse = {
  transactions: TransactionView[]
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

async function fetchTransactions(): Promise<TransactionsResponse> {
  const res = await fetch("/api/transactions")
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
      errorBody === "UNAUTHENTICATED"
        ? "UNAUTHENTICATED"
        : errorBody === "NOT_FOUND"
          ? "NOT_FOUND"
          : "INTERNAL_ERROR"
    throw new TransactionClientError(code, res.status)
  }

  const transactions =
    body && typeof body === "object" && "transactions" in body
      ? (body as TransactionsResponse).transactions
      : null
  if (!Array.isArray(transactions)) {
    throw new TransactionClientError("INTERNAL_ERROR", res.status)
  }
  return { transactions }
}

const FILTERS: ReadonlyArray<{ key: FilterKey; statuses: readonly string[] | null }> = [
  { key: "all", statuses: null },
  { key: "settled", statuses: ["SETTLED"] },
  { key: "review", statuses: ["SETTLEMENT_PENDING", "VERIFIED"] },
  { key: "failed", statuses: ["UPSTREAM_FAILED", "SETTLEMENT_FAILED"] },
]

type FilterKey = "all" | "settled" | "review" | "failed"

/** Truthful badge color per persisted payment status; unknown statuses stay neutral. */
function statusVariant(status: string): "verified" | "review" | "failed" | "neutral" {
  if (status === "SETTLED") return "verified"
  if (status === "VERIFIED" || status === "SETTLEMENT_PENDING") return "review"
  if (status === "UPSTREAM_FAILED" || status === "SETTLEMENT_FAILED") return "failed"
  return "neutral"
}

function shortTx(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

function ReceiptEvidenceLink({ transaction }: { transaction: TransactionView }) {
  if (transaction.x402TxHash === null) {
    return <span className="font-metadata text-sm text-muted-ink">—</span>
  }
  // Links come only from the server-derived explorer URL; never fabricated.
  if (transaction.explorerUrl !== null) {
    return (
      <a
        href={transaction.explorerUrl}
        target="_blank"
        rel="noreferrer"
        title={transaction.x402TxHash}
        className="font-metadata text-sm font-semibold text-blueprint underline underline-offset-2 hover:text-ink focus-visible:shadow-focus focus-visible:outline-none"
      >
        {shortTx(transaction.x402TxHash)}
      </a>
    )
  }
  return (
    <span className="font-metadata text-sm text-muted-ink" title={transaction.x402TxHash}>
      {shortTx(transaction.x402TxHash)}
    </span>
  )
}

function TransactionsList() {
  const { refresh: refreshAuth } = useAuth()
  const { data, isPending, isError, error, refetch } = useQuery<TransactionsResponse>({
    queryKey: ["transactions"],
    queryFn: fetchTransactions,
    staleTime: 30_000,
  })
  const [filter, setFilter] = useState<FilterKey>("all")

  const unauthenticated =
    error instanceof TransactionClientError && error.code === "UNAUTHENTICATED"

  const activeFilter = FILTERS.find((candidate) => candidate.key === filter) ?? FILTERS[0]
  const transactions = data?.transactions ?? []
  const statuses = activeFilter.statuses
  const filtered =
    statuses === null
      ? transactions
      : transactions.filter((transaction) => statuses.includes(transaction.paymentStatus))

  return (
    <section className="relative mt-10 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-magenta min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2"><Filter className="size-4 text-blueprint" aria-hidden="true" /><p className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Local filters</p></div>
        <div role="group" className="flex flex-wrap gap-2" aria-label="Transaction status filter">
          {FILTERS.map((option) => (
            <Button key={option.key} type="button" variant={filter === option.key ? "default" : "outline"} className="min-h-11 rounded-pill border-2 border-ink px-4 font-bold capitalize" onClick={() => setFilter(option.key)} aria-pressed={filter === option.key}>{option.key}</Button>
          ))}
        </div>
      </div>

      {isPending ? (
        <div aria-live="polite" aria-label="Loading transactions" className="mt-6 space-y-3">
          <Skeleton className="h-14 w-full bg-cream" />
          <Skeleton className="h-14 w-full bg-cream" />
          <Skeleton className="h-14 w-full bg-cream" />
        </div>
      ) : isError || data === undefined ? (
        <EmptyState
          className="mt-6"
          title={unauthenticated ? "Your session has expired" : "Transaction records are unavailable"}
          description={unauthenticated ? "Sign in again to view your call receipts." : "Real call receipts could not be loaded. Try again in a moment."}
          icon={<AlertTriangle aria-hidden="true" />}
          action={<Button type="button" onClick={() => { if (unauthenticated) refreshAuth(); void refetch() }} className="min-h-11 rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover">Try again</Button>}
        />
      ) : transactions.length === 0 ? (
        <>
          <Table className="mt-6 hidden min-[600px]:table">
            <TableHeader><TableRow><TableHead>Call</TableHead><TableHead>Route</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead><TableHead>Receipt evidence</TableHead></TableRow></TableHeader>
            <TableBody />
          </Table>
          <EmptyState
            className="mt-4"
            title="No paid calls yet"
            description="Once a connected route receives a payment and responds, its receipt appears here. No transactions are fabricated."
            icon={<ReceiptText aria-hidden="true" />}
          />
        </>
      ) : filtered.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={`No ${activeFilter.key} transactions`}
          description={`No calls are currently in ${(activeFilter.statuses ?? []).join(" or ")}.`}
          icon={<ReceiptText aria-hidden="true" />}
        />
      ) : (
        <>
          <ul className="mt-6 grid gap-4 min-[600px]:hidden" aria-label="Transactions">
            {filtered.map((transaction) => (
              <li key={transaction.id} className="rounded-mobile-card border-2 border-ink bg-mobile-surface p-4 shadow-[6px_6px_0_#141414]">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-metadata text-xs font-bold tracking-[0.08em] tabular-nums text-muted-ink">{formatEndpointDate(transaction.createdAt)}</p>
                  <StatusBadge variant={statusVariant(transaction.paymentStatus)}>{transaction.paymentStatus}</StatusBadge>
                </div>
                <Link href={`/dashboard/transactions/${transaction.id}`} className="mt-3 block min-w-0 focus-visible:shadow-focus focus-visible:outline-none">
                  <span className="block truncate font-heading text-sm font-semibold text-ink underline-offset-4 hover:underline">{transaction.routeName}</span>
                </Link>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                  <p className="font-display text-lg font-bold tracking-[-0.02em] tabular-nums">{transaction.amountUsdc} USDC</p>
                  <ReceiptEvidenceLink transaction={transaction} />
                </div>
              </li>
            ))}
          </ul>
          <Table className="mt-6 hidden min-[600px]:table">
            <TableHeader>
              <TableRow>
                <TableHead>Call</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Receipt evidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-metadata text-sm whitespace-nowrap tabular-nums text-muted-ink">{formatEndpointDate(transaction.createdAt)}</TableCell>
                  <TableCell className="max-w-56">
                    <Link href={`/dashboard/transactions/${transaction.id}`} className="block min-h-11 min-w-0 py-1.5 focus-visible:shadow-focus focus-visible:outline-none">
                      <span className="block truncate font-heading text-sm font-semibold text-ink underline-offset-4 hover:underline">{transaction.routeName}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="font-metadata text-sm font-bold whitespace-nowrap tabular-nums text-ink">{transaction.amountUsdc} USDC</TableCell>
                  <TableCell><StatusBadge variant={statusVariant(transaction.paymentStatus)}>{transaction.paymentStatus}</StatusBadge></TableCell>
                  <TableCell><ReceiptEvidenceLink transaction={transaction} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </section>
  )
}

export { TransactionsList }
