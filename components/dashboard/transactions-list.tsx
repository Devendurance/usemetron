"use client"

import { AlertTriangle, Filter, ReceiptText } from "lucide-react"
import { useState } from "react"

import { EmptyState } from "@/components/metron"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type State = "empty" | "error"

function TransactionsList() {
  const [status, setStatus] = useState("all")
  const [state, setState] = useState<State>("empty")

  return (
    <section className="relative mt-10 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-magenta min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2"><Filter className="size-4 text-blueprint" aria-hidden="true" /><p className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Local filters</p></div>
        <div role="group" className="flex flex-wrap gap-2" aria-label="Transaction status filter">
          {["all", "settled", "review", "failed"].map((option) => (
            <Button key={option} type="button" variant={status === option ? "default" : "outline"} className="min-h-11 rounded-pill border-2 border-ink px-4 font-bold capitalize" onClick={() => setStatus(option)} aria-pressed={status === option}>{option}</Button>
          ))}
          <Button type="button" variant={state === "error" ? "destructive" : "outline"} className="min-h-11 rounded-pill border-2 border-ink px-4 font-bold" onClick={() => setState((current) => current === "empty" ? "error" : "empty")}>{state === "empty" ? "Show error" : "Show empty"}</Button>
        </div>
      </div>
      {state === "error" ? (
        <EmptyState className="mt-6" title="Transaction records are unavailable" description="This local error presentation did not request transaction data. Reset it to view the empty activity state." icon={<AlertTriangle aria-hidden="true" />} action={<Button type="button" onClick={() => setState("empty")} className="min-h-11 rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover">Show empty state</Button>} />
      ) : (
        <>
          <Table className="mt-6">
            <TableHeader><TableRow><TableHead>Call</TableHead><TableHead>Route</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead><TableHead>Receipt evidence</TableHead></TableRow></TableHeader>
            <TableBody />
          </Table>
          <EmptyState className="mt-4" title={status === "all" ? "No transaction evidence yet" : `No ${status} transactions`} description="Calls will appear here only after a connected route receives a payment and response. No transaction rows, amounts, wallets, or timestamps are fabricated." icon={<ReceiptText aria-hidden="true" />} />
        </>
      )}
    </section>
  )
}

export { TransactionsList }
