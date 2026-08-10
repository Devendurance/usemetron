"use client"

import { ReceiptText } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { EmptyState } from "@/components/metron"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth/use-auth"
import { cn } from "@/lib/utils"
import type { DashboardSummary } from "@/lib/dashboard/types"

type DashboardResponse = {
  summary: DashboardSummary
}

type SummaryErrorCode = "UNAUTHENTICATED" | "INTERNAL_ERROR"

class SummaryClientError extends Error {
  readonly code: SummaryErrorCode
  readonly status: number

  constructor(code: SummaryErrorCode, status: number) {
    super(`Dashboard summary request failed with ${code}`)
    this.name = "SummaryClientError"
    this.code = code
    this.status = status
  }
}

async function fetchDashboardSummary(): Promise<DashboardResponse> {
  const res = await fetch("/api/dashboard")
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
    const code: SummaryErrorCode =
      errorBody === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "INTERNAL_ERROR"
    throw new SummaryClientError(code, res.status)
  }

  const summary =
    body && typeof body === "object" && "summary" in body
      ? (body as DashboardResponse).summary
      : null
  if (summary === null || typeof summary !== "object") {
    throw new SummaryClientError("INTERNAL_ERROR", res.status)
  }
  return { summary }
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

function ProductSummary() {
  const { refresh: refreshAuth } = useAuth()
  const { data, isPending, isError, error, refetch } = useQuery<DashboardResponse>({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardSummary,
    staleTime: 30_000,
  })

  const unauthenticated =
    error instanceof SummaryClientError && error.code === "UNAUTHENTICATED"

  if (isPending) {
    return (
      <section aria-label="Product summary loading" className="mt-8 grid gap-4 sm:grid-cols-3">
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
      <section aria-label="Product summary unavailable" className="mt-8">
        <EmptyState
          title="Summary is unavailable"
          description="Real product counts could not be loaded. Try again in a moment."
          icon={<ReceiptText aria-hidden="true" />}
          action={
            <button
              type="button"
              onClick={() => { if (unauthenticated) refreshAuth(); void refetch() }}
              className="inline-flex min-h-11 items-center rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none"
            >
              Retry
            </button>
          }
        />
      </section>
    )
  }

  const { summary } = data

  return (
    <>
      <section aria-label="Product summary" className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Published endpoints" value={String(summary.publishedEndpoints)} detail="Endpoints published with a per-request price." />
        <StatCard label="Active endpoints" value={String(summary.activeEndpoints)} detail="Published endpoints currently accepting calls." />
        <StatCard label="Settled calls" value={String(summary.settledCalls)} detail="Paid calls settled on Celo." emphasis />
      </section>
      <section aria-label="Call health" className="mt-8 grid gap-4 sm:grid-cols-2">
        <StatCard label="Upstream failures" value={String(summary.upstreamFailures)} detail="Verified calls whose upstream request failed." />
        <StatCard label="Settlement failures" value={String(summary.settlementFailures)} detail="Calls where on-chain settlement failed." />
      </section>
    </>
  )
}

export { ProductSummary }
