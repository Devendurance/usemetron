"use client"

import { AlertTriangle, Copy, PenLine, Save } from "lucide-react"
import { FormEvent, useState } from "react"

import { CallLine, CopyButton, EmptyState, MetronReceipt } from "@/components/metron"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function EndpointDetail() {
  const [route, setRoute] = useState("")
  const [price, setPrice] = useState("")
  const [editNotice, setEditNotice] = useState(false)

  function saveRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEditNotice(true)
  }

  return (
    <div className="grid min-w-0 max-w-full gap-8">
      <Alert className="min-w-0 max-w-full border-review-bronze/30 bg-review-bronze/10 text-ink">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Route record not found</AlertTitle>
        <AlertDescription className="text-muted-ink">No endpoint is connected to this route yet. The route identifier is intentionally not shown as endpoint or account data.</AlertDescription>
      </Alert>

      <section className="relative mt-3 min-w-0 max-w-full rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:mt-0 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
        <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-metadata text-xs font-bold tracking-[0.1em] text-blueprint uppercase">Route detail</p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.035em]">Unconnected route</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-ink">Set up a route when publishing becomes available. The structural fields remain deliberately blank.</p>
          </div>
          <CopyButton value="" disabled label="Copy route" copiedLabel="Copied route" className="min-h-11 border-2 border-ink" />
        </div>
        <div className="mt-6 min-w-0 max-w-full"><CallLine /></div>
      </section>

      <div className="grid min-w-0 max-w-full gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,.9fr)]">
        <form onSubmit={saveRoute} className="relative mt-3 min-w-0 max-w-full rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-magenta min-[600px]:mt-0 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-control bg-coral"><PenLine className="size-5" aria-hidden="true" /></span>
            <div><h2 className="font-heading text-xl font-semibold">Route and price</h2><p className="mt-1 text-sm text-muted-ink">Local editor only — changes are not saved.</p></div>
          </div>
          <FieldGroup className="mt-6">
            <Field>
              <FieldLabel htmlFor="route-path">Route path</FieldLabel>
              <Input id="route-path" value={route} onChange={(event) => setRoute(event.target.value)} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="No route path available" />
              <FieldDescription>No powered route exists while this endpoint is unconnected.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="route-price">Price per request</FieldLabel>
              <Input id="route-price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="—" />
              <FieldDescription>Currency and settlement policy have not been configured.</FieldDescription>
            </Field>
          </FieldGroup>
          {editNotice && <p role="status" className="mt-4 text-sm text-review-bronze">This edit is local only — publishing integration is unavailable.</p>}
          <Button type="submit" className="mt-6 min-h-11 rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover"><Save className="size-4" aria-hidden="true" />Review local edits</Button>
        </form>

        <MetronReceipt className="mt-3 min-w-0 max-w-full rounded-mobile-card border-2 border-ink bg-mobile-surface shadow-[6px_6px_0_#141414] min-[600px]:mt-0 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:shadow-none" callId="—" route="—" price="—" network="Celo — unavailable" status="—" response="—" creator="—" transaction="—" />
      </div>

      <section className="relative mt-3 min-w-0 max-w-full rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:mt-0 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
        <div className="flex flex-col gap-2 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="font-heading text-xl font-semibold">SDK call</h2><p className="mt-1 text-sm leading-relaxed text-muted-ink">No route value exists to generate a request. Copy controls remain disabled.</p></div>
          <CopyButton value="" disabled label="Copy snippet" copiedLabel="Copied snippet" className="min-h-11 border-2 border-ink" />
        </div>
        <Tabs defaultValue="curl" className="mt-6">
          <TabsList variant="line" aria-label="SDK language">
            <TabsTrigger value="curl" className="min-h-11 px-4 font-bold">cURL</TabsTrigger>
            <TabsTrigger value="typescript" className="min-h-11 px-4 font-bold">TypeScript</TabsTrigger>
            <TabsTrigger value="python" className="min-h-11 px-4 font-bold">Python</TabsTrigger>
          </TabsList>
          {["curl", "typescript", "python"].map((language) => (
            <TabsContent key={language} value={language} className="mt-5 rounded-control border border-dashed border-border bg-cream p-5 font-mono text-sm leading-relaxed text-muted-ink">
              <span className="sr-only">{language} request snippet: </span>—
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <EmptyState className="min-w-0 max-w-full" title="No endpoint is connected to this route yet" description="Return to Endpoints to publish a new API when the integration is available." icon={<Copy aria-hidden="true" />} />
    </div>
  )
}

export { EndpointDetail }
