"use client"

import Link from "next/link"
import { AlertTriangle, Plus, Route } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { EmptyState } from "@/components/metron"
import { CopyButton } from "@/components/metron/copy-button"
import { StatusBadge } from "@/components/metron/status-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  EndpointClientError,
  endpointErrorMessage,
  endpointQueryKeys,
  fetchEndpoints,
  formatEndpointDate,
  type EndpointView,
} from "@/lib/endpoints/client"
import { useAuth } from "@/lib/auth/use-auth"

function EndpointsList() {
  const { refresh: refreshAuth } = useAuth()
  const { data, isPending, error, refetch } = useQuery({
    queryKey: endpointQueryKeys.list,
    queryFn: fetchEndpoints,
  })

  const unauthenticated =
    error instanceof EndpointClientError && error.code === "UNAUTHENTICATED"

  function retry() {
    if (unauthenticated) refreshAuth()
    void refetch()
  }

  return (
    <section className="relative mt-10 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      {isPending ? (
        <div aria-live="polite" aria-label="Loading endpoints" className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-ink"><Spinner className="size-4 text-blueprint" />Checking your published routes…</div>
          <Skeleton className="h-14 w-full bg-cream" />
          <Skeleton className="h-14 w-full bg-cream" />
          <Skeleton className="h-14 w-full bg-cream" />
        </div>
      ) : data && data.endpoints.length === 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Powered URL</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody />
          </Table>
          <EmptyState
            className="mt-4"
            title="No paid routes yet"
            description="Publish an existing endpoint to define its route and per-request price. Your published endpoints will appear here."
            icon={<Route aria-hidden="true" />}
            action={<Link href="/dashboard/endpoints/new" className="inline-flex min-h-11 items-center gap-2 rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none"><Plus className="size-4" aria-hidden="true" />Publish an API</Link>}
          />
        </>
      ) : data && data.endpoints.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Endpoint</TableHead>
              <TableHead>Powered URL</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.endpoints.map((endpoint: EndpointView) => (
              <TableRow key={endpoint.id}>
                <TableCell className="max-w-56">
                  <Link href={`/dashboard/endpoints/${endpoint.id}`} className="block min-h-11 min-w-0 py-1.5 focus-visible:shadow-focus focus-visible:outline-none">
                    <span className="block truncate font-heading text-sm font-semibold text-ink underline-offset-4 hover:underline">{endpoint.name}</span>
                    <span className="block truncate font-mono text-xs text-muted-ink">{endpoint.slug}</span>
                  </Link>
                </TableCell>
                <TableCell className="max-w-56">
                  <div className="flex min-h-11 min-w-0 items-center gap-2">
                    <span className="block max-w-44 truncate font-mono text-xs text-muted-ink lg:max-w-56" title={endpoint.poweredUrl}>{endpoint.poweredUrl}</span>
                    <CopyButton value={endpoint.poweredUrl} label="Copy" copiedLabel="Copied" className="min-h-11 min-w-11 border-2 border-ink bg-clear-paper px-2.5" />
                  </div>
                </TableCell>
                <TableCell className="font-metadata text-sm font-bold whitespace-nowrap tabular-nums text-ink">{endpoint.priceUsdc} USDC</TableCell>
                <TableCell>
                  {endpoint.isActive ? <StatusBadge variant="verified">Active</StatusBadge> : <StatusBadge variant="neutral">Disabled</StatusBadge>}
                </TableCell>
                <TableCell className="text-muted-ink whitespace-nowrap">{formatEndpointDate(endpoint.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          title={unauthenticated ? "Your session has expired" : "Route records are unavailable"}
          description={unauthenticated ? "Sign in again to view your published endpoints." : endpointErrorMessage(error instanceof EndpointClientError ? error.code : "INTERNAL_ERROR")}
          icon={<AlertTriangle aria-hidden="true" />}
          action={<Button type="button" onClick={retry} className="min-h-11 rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover">Try again</Button>}
        />
      )}
    </section>
  )
}

export { EndpointsList }
