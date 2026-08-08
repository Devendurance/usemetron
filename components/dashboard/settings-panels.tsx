"use client"

import { AlertCircle, CheckCircle2, LoaderCircle, WalletCards } from "lucide-react"
import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type ConnectionState = "disconnected" | "connecting" | "connected-preview" | "error"

const copy: Record<ConnectionState, { title: string; description: string }> = {
  disconnected: { title: "Wallet disconnected", description: "No wallet address or account value is available. Provider integration is not connected." },
  connecting: { title: "Connection waiting", description: "This is a local presentation state. No wallet prompt or provider request was opened." },
  "connected-preview": { title: "Connected preview", description: "Preview only — no wallet identity, balance, or provider session is displayed." },
  error: { title: "Connection unavailable", description: "This local error state does not indicate a wallet or network failure." },
}

function SettingsPanels() {
  const [connection, setConnection] = useState<ConnectionState>("disconnected")
  const current = copy[connection]

  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-2">
      <section className="relative rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
        <div className="flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-coral"><WalletCards className="size-5" aria-hidden="true" /></span><div><h2 className="font-heading text-xl font-semibold">Wallet and account</h2><p className="mt-1 text-sm leading-relaxed text-muted-ink">Use these presentation states to inspect the Console before a real wallet provider is wired in.</p></div></div>
        <Alert className="mt-6 border-border bg-cream text-ink">
          {connection === "connected-preview" ? <CheckCircle2 aria-hidden="true" /> : connection === "connecting" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
          <AlertTitle>{current.title}</AlertTitle><AlertDescription className="text-muted-ink">{current.description}</AlertDescription>
        </Alert>
        <div role="group" className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Wallet presentation controls">
          {(["disconnected", "connecting", "connected-preview", "error"] as const).map((state) => <Button key={state} type="button" variant={connection === state ? "default" : "outline"} onClick={() => setConnection(state)} aria-pressed={connection === state} className="min-h-11 rounded-control border-2 border-ink px-3 text-xs font-bold leading-tight capitalize">{state.replace("-", " ")}</Button>)}
        </div>
      </section>

      <section className="relative mt-3 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-magenta min-[600px]:mt-0 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
        <div><p className="font-metadata text-xs font-bold tracking-[0.1em] text-blueprint uppercase">Celo attribution</p><h2 className="mt-3 font-heading text-xl font-semibold">Attribution and settlement settings</h2><p className="mt-1 text-sm leading-relaxed text-muted-ink">Integration is not connected. Values are intentionally not prefilled or saved.</p></div>
        <FieldGroup className="mt-6">
          <Field><FieldLabel htmlFor="attribution">Attribution identifier</FieldLabel><Input id="attribution" className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="Not configured" /><FieldDescription>Configure an attribution identifier when the Celo integration is available.</FieldDescription></Field>
          <Field><FieldLabel htmlFor="pay-to">Settlement wallet</FieldLabel><Input id="pay-to" className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="Not connected" /><FieldDescription>No account address is displayed, stored, or inferred in this preview.</FieldDescription></Field>
        </FieldGroup>
        <Button type="button" disabled className="mt-6 min-h-11 rounded-pill border-2 border-ink px-5 font-bold">Save unavailable</Button>
      </section>
    </div>
  )
}

export { SettingsPanels }
