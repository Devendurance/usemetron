"use client"

import { CircleDollarSign, ReceiptText, Send } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { EmptyState } from "@/components/metron"
import { Skeleton } from "@/components/ui/skeleton"
import { explorerTxUrl } from "@/lib/dashboard/explorer"
import { cn } from "@/lib/utils"

type EarningsResponse = {
  earnedMicroUsdc: number
  paidMicroUsdc: number
  outstandingMicroUsdc: number
  availableToPayoutMicroUsdc: number
  reservedMicroUsdc: number
  earnedUsdc: string
  paidUsdc: string
  outstandingUsdc: string
  availableToPayoutUsdc: string
  recent: Array<{
    id: string
    routeId: string
    routeName: string
    receiptId: string
    amountMicroUsdc: number
    amountUsdc: string
    createdAt: string
    x402TxHash: string | null
  }>
}

type PayoutsResponse = {
  payouts: Array<{
    id: string
    routeName: string
    toWallet: string
    amountMicroUsdc: number
    amountUsdc: string
    status: string
    txHash: string | null
    lastError: string | null
    createdAt: string
    confirmedAt: string | null
  }>
}

function StatCard({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string
  value: string
  detail: string
  emphasis?: boolean
}) {
  return (
    <div
      className={cn(
        "relative rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-16 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-magenta min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-6 min-[600px]:shadow-none min-[600px]:before:hidden",
        emphasis && "min-[600px]:bg-lime"
      )}
    >
      <p className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">{label}</p>
      <p className="mt-5 font-display text-4xl font-bold tracking-[-0.04em] tabular-nums">{value}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-ink">{detail}</p>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function shortTx(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

function PayoutButton({ available }: { available: boolean }) {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payouts", { method: "POST" })
      const body = (await res.json()) as { error?: string; message?: string; payouts?: unknown[] }
      if (!res.ok) {
        if (body.error === "PAYOUTS_DISABLED") {
          throw new Error("Payouts are currently disabled on this deployment.")
        }
        if (body.error === "NOTHING_TO_PAYOUT") {
          throw new Error("No outstanding earnings are available.")
        }
        throw new Error(body.message ?? "Payout request failed.")
      }
      return body
    },
    onSuccess: () => {
      setNotice("Payout submitted.")
      void queryClient.invalidateQueries({ queryKey: ["earnings"] })
      void queryClient.invalidateQueries({ queryKey: ["payouts"] })
    },
    onError: (error: Error) => {
      setNotice(error.message)
    },
  })

  if (!available) {
    return (
      <span className="inline-flex min-h-11 items-center rounded-pill border-2 border-border px-5 text-sm font-bold text-muted-ink">
        Nothing to withdraw
      </span>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => void mutation.mutate()}
        className="inline-flex min-h-11 items-center gap-2 rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-60"
      >
        <Send className="size-4" aria-hidden="true" />
        {mutation.isPending ? "Withdrawing…" : "Withdraw outstanding"}
      </button>
      {notice !== null && (
        <p className="max-w-xs text-right text-xs leading-relaxed text-muted-ink" aria-live="polite">
          {notice}
        </p>
      )}
    </div>
  )
}

function PayoutHistory() {
  const { data, isPending, isError, refetch } = useQuery<PayoutsResponse>({
    queryKey: ["payouts"],
    queryFn: async () => {
      const res = await fetch("/api/payouts")
      if (!res.ok) throw new Error("payouts unavailable")
      return (await res.json()) as PayoutsResponse
    },
    staleTime: 30_000,
  })

  if (isPending) {
    return (
      <div className="mt-6" aria-label="Payout history loading">
        <Skeleton className="h-12 w-full bg-cream" />
      </div>
    )
  }

  if (isError || data === undefined) {
    return (
      <div className="mt-6">
        <EmptyState
          title="Payout history unavailable"
          description="Real payout records could not be loaded."
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
      </div>
    )
  }

  if (data.payouts.length === 0) {
    return (
      <p className="mt-6 text-sm leading-relaxed text-muted-ink">
        No payouts yet. Only real, confirmed payout transactions appear here.
      </p>
    )
  }

  return (
    <div className="mt-6">
      <p className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Payout history</p>
      <ul className="mt-3 divide-y divide-border">
        {data.payouts.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{p.amountUsdc} USDC · {p.routeName}</p>
              <p className="mt-0.5 font-metadata text-xs text-muted-ink">
                {formatDate(p.createdAt)}
                {p.txHash ? (
                  <>
                    {" · "}
                    <a
                      href={explorerTxUrl(p.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-ink"
                    >
                      {shortTx(p.txHash)}
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            <span
              className={cn(
                "rounded-pill border-2 px-3 py-1 font-metadata text-xs font-bold tracking-[0.06em]",
                p.status === "CONFIRMED" && "border-settlement-green bg-settlement-green/10 text-settlement-green",
                p.status === "SUBMITTED" && "border-review-bronze bg-review-bronze/10 text-review-bronze",
                (p.status === "FAILED" || p.status === "PENDING") && "border-failure-red bg-failure-red/10 text-failure-red"
              )}
            >
              {p.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EarningsOverview() {
  const { data, isPending, isError, refetch } = useQuery<EarningsResponse>({
    queryKey: ["earnings"],
    queryFn: async () => {
      const res = await fetch("/api/earnings")
      if (!res.ok) throw new Error("earnings unavailable")
      return (await res.json()) as EarningsResponse
    },
    staleTime: 30_000,
  })

  if (isPending) {
    return (
      <section aria-label="Earnings loading" className="mt-8 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-card bg-clear-paper p-6">
            <Skeleton className="h-4 w-24 bg-cream" />
            <Skeleton className="mt-5 h-10 w-28 bg-cream" />
          </div>
        ))}
      </section>
    )
  }

  if (isError || data === undefined) {
    return (
      <section aria-label="Earnings unavailable" className="mt-8">
        <EmptyState
          title="Earnings are unavailable"
          description="Real ledger data could not be loaded. Try again in a moment."
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
      </section>
    )
  }

  const hasEarnings = data.recent.length > 0

  return (
    <>
      <section aria-label="Creator earnings" className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total earned" value={`${data.earnedUsdc} USDC`} detail="Credited from settled paid calls." emphasis />
        <StatCard label="Paid" value={`${data.paidUsdc} USDC`} detail="Finalized payout amounts." />
        <StatCard label="Outstanding" value={`${data.outstandingUsdc} USDC`} detail="Earned but not yet paid out." />
      </section>

      <section className="mt-8 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-coral" aria-hidden="true">
              <CircleDollarSign className="size-5" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">Withdraw outstanding</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-ink">
                Available now: <span className="font-bold text-ink tabular-nums">{data.availableToPayoutUsdc} USDC</span>
                {Number(data.reservedMicroUsdc) > 0 ? ` (${data.availableToPayoutUsdc === "0" ? "all " : ""}reserved while a payout is in flight)` : ""}
              </p>
            </div>
          </div>
          <PayoutButton available={Number(data.availableToPayoutMicroUsdc) > 0} />
        </div>
        <PayoutHistory />
      </section>

      <section className="mt-8 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-coral" aria-hidden="true">
            <CircleDollarSign className="size-5" />
          </span>
          <div>
            <h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">Recent earnings</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-ink">Real ledger credits from settled calls only.</p>
          </div>
        </div>

        {!hasEarnings ? (
          <EmptyState
            className="mt-6"
            title="No earnings yet"
            description="Once a paid call settles, its credit appears here. No ledger entries are fabricated."
            icon={<ReceiptText aria-hidden="true" />}
          />
        ) : (
          <ul className="mt-6 divide-y divide-border">
            {data.recent.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{entry.routeName}</p>
                  <p className="mt-1 font-metadata text-xs text-muted-ink">
                    {formatDate(entry.createdAt)}
                    {entry.x402TxHash ? (
                      <>
                        {" · "}
                        <a
                          href={explorerTxUrl(entry.x402TxHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-ink"
                        >
                          {shortTx(entry.x402TxHash)}
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <p className="font-display text-xl font-bold tracking-[-0.02em] tabular-nums">{entry.amountUsdc} USDC</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

export { EarningsOverview }
