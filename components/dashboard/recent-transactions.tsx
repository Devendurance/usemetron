"use client"

import Link from "next/link"
import { ArrowRight, CircleDollarSign, ReceiptText } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { ConsoleCard } from "@/components/dashboard/dashboard-primitives"
import { EmptyState, MetronReceipt, StatusBadge } from "@/components/metron"
import { Skeleton } from "@/components/ui/skeleton"
import { formatEndpointDate } from "@/lib/endpoints/client"
import type { TransactionView } from "@/lib/dashboard/types"

type TransactionsResponse = {
  transactions: TransactionView[]
}

async function fetchTransactions(): Promise<TransactionsResponse> {
  const res = await fetch("/api/transactions")
  if (!res.ok) throw new Error("transactions unavailable")
  return (await res.json()) as TransactionsResponse
}

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

function RecentTransactions({ limit = 5 }: { limit?: number }) {
  const { data, isPending, isError, refetch } = useQuery<TransactionsResponse>({
    queryKey: ["transactions"],
    queryFn: fetchTransactions,
    staleTime: 30_000,
  })

  return (
    <section className="relative mt-10 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-coral" aria-hidden="true">
          <ReceiptText className="size-5" />
        </span>
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">Recent calls</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-ink">The newest call records, straight from the ledger.</p>
        </div>
      </div>

      {isPending ? (
        <div aria-live="polite" aria-label="Loading recent calls" className="mt-6 space-y-3">
          <Skeleton className="h-14 w-full bg-cream" />
          <Skeleton className="h-14 w-full bg-cream" />
          <Skeleton className="h-14 w-full bg-cream" />
        </div>
      ) : isError || data === undefined ? (
        <EmptyState
          className="mt-6"
          title="Recent calls are unavailable"
          description="Real call receipts could not be loaded. Try again in a moment."
          icon={<ReceiptText aria-hidden="true" />}
          action={
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex min-h-11 items-center rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none"
            >
              Retry
            </button>
          }
        />
      ) : data.transactions.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No paid calls yet"
          description="Once a connected route receives a payment and responds, its receipt appears here. No transactions are fabricated."
          icon={<ReceiptText aria-hidden="true" />}
        />
      ) : (
        <ul className="mt-6 divide-y divide-border" aria-label="Recent transactions">
          {data.transactions.slice(0, limit).map((transaction) => (
            <li key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <Link href={`/dashboard/transactions/${transaction.id}`} className="block min-w-0 focus-visible:shadow-focus focus-visible:outline-none">
                  <span className="block truncate font-heading text-sm font-semibold text-ink underline-offset-4 hover:underline">{transaction.routeName}</span>
                </Link>
                <p className="mt-1 font-metadata text-xs text-muted-ink">
                  {formatEndpointDate(transaction.createdAt)}
                  {transaction.x402TxHash !== null && transaction.explorerUrl !== null ? (
                    <>
                      {" · "}
                      <a
                        href={transaction.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={transaction.x402TxHash}
                        className="underline underline-offset-2 hover:text-ink focus-visible:shadow-focus focus-visible:outline-none"
                      >
                        {shortTx(transaction.x402TxHash)}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-display text-xl font-bold tracking-[-0.02em] tabular-nums">{transaction.amountUsdc} USDC</p>
                <StatusBadge variant={statusVariant(transaction.paymentStatus)}>{transaction.paymentStatus}</StatusBadge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function LatestCallEvidence() {
  const { data, isPending, isError, refetch } = useQuery<TransactionsResponse>({
    queryKey: ["transactions"],
    queryFn: fetchTransactions,
    staleTime: 30_000,
  })

  return (
    <ConsoleCard className="mt-8" title="Latest call evidence" description="The newest paid call and its on-chain record." icon={CircleDollarSign}>
      {isPending ? (
        <div aria-live="polite" aria-label="Loading latest call evidence">
          <Skeleton className="h-40 w-full bg-cream" />
        </div>
      ) : isError || data === undefined ? (
        <EmptyState
          title="Evidence is unavailable"
          description="The newest call receipt could not be loaded. Try again in a moment."
          icon={<ReceiptText aria-hidden="true" />}
          action={
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex min-h-11 items-center rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none"
            >
              Retry
            </button>
          }
        />
      ) : data.transactions.length === 0 ? (
        <EmptyState
          title="No receipt evidence yet"
          description="When a paid call settles, its receipt appears here with route, price, status, response, and transaction evidence. Nothing is fabricated."
          icon={<ReceiptText aria-hidden="true" />}
        />
      ) : (
        <>
          <MetronReceipt
            className="rounded-mobile-card border-2 border-ink bg-mobile-surface shadow-[6px_6px_0_#141414] min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:shadow-none"
            callId={data.transactions[0].id.length > 16 ? shortTx(data.transactions[0].id) : data.transactions[0].id}
            route={data.transactions[0].routeName}
            price={`${data.transactions[0].amountUsdc} USDC`}
            network="Celo"
            status={data.transactions[0].paymentStatus}
            response={data.transactions[0].upstreamStatusCode !== null ? `${data.transactions[0].upstreamStatusCode}` : undefined}
            creator={data.transactions[0].callerWallet !== null ? shortTx(data.transactions[0].callerWallet) : undefined}
            transaction={
              data.transactions[0].x402TxHash !== null ? (
                data.transactions[0].explorerUrl !== null ? (
                  <a href={data.transactions[0].explorerUrl} target="_blank" rel="noreferrer" title={data.transactions[0].x402TxHash} className="underline underline-offset-2 hover:text-ink focus-visible:shadow-focus focus-visible:outline-none">{shortTx(data.transactions[0].x402TxHash)}</a>
                ) : (
                  <span title={data.transactions[0].x402TxHash}>{shortTx(data.transactions[0].x402TxHash)}</span>
                )
              ) : null
            }
          />
          <Link
            href={`/dashboard/transactions/${data.transactions[0].id}`}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none"
          >
            View full call record <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </>
      )}
    </ConsoleCard>
  )
}

export { LatestCallEvidence, RecentTransactions }
