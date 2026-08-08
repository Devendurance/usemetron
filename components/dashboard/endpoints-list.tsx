"use client"

import Link from "next/link"
import { AlertTriangle, Loader2, Plus, Route } from "lucide-react"
import { useState } from "react"

import { EmptyState } from "@/components/metron"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Presentation = "empty" | "loading" | "error"

function EndpointsList() {
  const [presentation, setPresentation] = useState<Presentation>("empty")
  const [localOnly, setLocalOnly] = useState(false)

  return (
    <section className="relative mt-10 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      <div className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" className="flex flex-wrap items-center gap-2" aria-label="Endpoint presentation controls">
          {(["empty", "loading", "error"] as const).map((state) => (
            <Button
              key={state}
              type="button"
              variant={presentation === state ? "default" : "outline"}
              className="min-h-11 rounded-pill border-2 border-ink px-4 font-bold capitalize"
              onClick={() => setPresentation(state)}
              aria-pressed={presentation === state}
            >
              {state}
            </Button>
          ))}
        </div>
        <label htmlFor="show-local-routes-only" className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <Switch id="show-local-routes-only" checked={localOnly} onCheckedChange={setLocalOnly} className="scale-125" />
          Show local routes only
        </label>
      </div>

      <div className="mt-6">
        {presentation === "loading" && (
          <div aria-live="polite" aria-label="Loading endpoints" className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-ink"><Loader2 className="size-4 animate-spin" aria-hidden="true" />Checking route records — no records are shown.</div>
            <Skeleton className="h-14 w-full bg-cream" />
            <Skeleton className="h-14 w-full bg-cream" />
          </div>
        )}
        {presentation === "error" && (
          <EmptyState
            title="Endpoint records are unavailable"
            description="This is a local error presentation — no endpoint data was requested or changed. Return to the empty state to continue."
            icon={<AlertTriangle aria-hidden="true" />}
            action={<Button type="button" onClick={() => setPresentation("empty")} className="min-h-11 rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover">Show empty state</Button>}
          />
        )}
        {presentation === "empty" && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody />
            </Table>
            <EmptyState
              className="mt-4"
              title={localOnly ? "No local routes are available" : "No paid routes yet"}
              description="Publish an existing endpoint to define its route and per-request price. No endpoint records are seeded in this Console."
              icon={<Route aria-hidden="true" />}
              action={<Link href="/dashboard/endpoints/new" className="inline-flex min-h-11 items-center gap-2 rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none"><Plus className="size-4" aria-hidden="true" />Publish an API</Link>}
            />
          </>
        )}
      </div>
    </section>
  )
}

export { EndpointsList }
