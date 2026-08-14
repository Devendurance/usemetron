"use client"

import { ArrowLeft, ArrowRight, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { StatusBadge } from "@/components/metron/status-badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MethodBadge } from "@/components/dashboard/openapi/method-badge"
import {
  blockedReasonLabel,
  parsePublicHttpsUrl,
  type DiscoveredOperation,
} from "@/lib/openapi/client"
import { cn } from "@/lib/utils"

type MethodFilter = "all" | "get" | "post"

function OperationReview({
  operations,
  selectedKeys,
  onToggle,
  onToggleAllPublishable,
  onClearAll,
  baseUrlOverride,
  onBaseUrlOverrideChange,
  onBack,
  onContinue,
}: {
  operations: DiscoveredOperation[]
  selectedKeys: Set<string>
  onToggle: (key: string) => void
  onToggleAllPublishable: () => void
  onClearAll: () => void
  baseUrlOverride: string
  onBaseUrlOverrideChange: (value: string) => void
  onBack: () => void
  onContinue: () => void
}) {
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all")
  const [search, setSearch] = useState("")

  const baseUrl = parsePublicHttpsUrl(baseUrlOverride)
  const baseUrlValid = baseUrl !== null
  const baseUrlTouched = baseUrlOverride.trim() !== ""

  const publishableCount = useMemo(
    () =>
      operations.filter(
        (op) =>
          op.publishable ||
          (op.effectiveServerUrl === null && baseUrlValid)
      ).length,
    [operations, baseUrlValid]
  )

  const baseUrlAppliesTo = useMemo(
    () => operations.filter((op) => op.effectiveServerUrl === null).length,
    [operations]
  )

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return operations.filter((op) => {
      if (methodFilter !== "all" && op.method !== methodFilter) return false
      if (needle !== "") {
        const path = op.path.toLowerCase()
        const summary = (op.summary ?? "").toLowerCase()
        if (!path.includes(needle) && !summary.includes(needle)) return false
      }
      return true
    })
  }, [operations, methodFilter, search])

  const filterOptions: Array<{ value: MethodFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "get", label: "GET" },
    { value: "post", label: "POST" },
  ]

  function isPublishable(op: DiscoveredOperation): boolean {
    return op.publishable || (op.effectiveServerUrl === null && baseUrlValid)
  }

  return (
    <section className="relative mt-10 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">
            Review discovered operations
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-ink">
            {operations.length} operations found. Select the ones to publish —{" "}
            {publishableCount} are publishable now.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Filter by method" className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMethodFilter(option.value)}
                aria-pressed={methodFilter === option.value}
                className={cn(
                  "min-h-10 rounded-pill border-2 border-ink px-4 font-metadata text-xs font-bold tracking-[0.06em] focus-visible:shadow-focus focus-visible:outline-none",
                  methodFilter === option.value
                    ? "bg-lime text-ink"
                    : "bg-clear-paper text-muted-ink hover:bg-cream"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-52 flex-1 lg:flex-none">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-ink"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search operations by path or summary"
              placeholder="Search path or summary"
              className="min-h-10 rounded-pill border-2 border-ink bg-cream pr-4 pl-9"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-ink">
          <span className="font-bold text-ink">{selectedKeys.size}</span> of{" "}
          {operations.length} operations selected
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={onToggleAllPublishable}
            disabled={publishableCount === 0}
            className="min-h-11 text-sm font-bold text-blueprint underline underline-offset-4 focus-visible:shadow-focus focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
          >
            Select all publishable ({publishableCount})
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={selectedKeys.size === 0}
            className="min-h-11 text-sm font-bold text-blueprint underline underline-offset-4 focus-visible:shadow-focus focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
          >
            Clear all
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-control border border-dashed border-border bg-cream p-6 text-center text-sm text-muted-ink">
          No operations match this filter or search.
        </p>
      ) : (
        <Table className="mt-4 min-w-[52rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">Publish</span>
              </TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>Security</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((op) => {
              const key = `${op.method} ${op.path}`
              const publishable = isPublishable(op)
              const blocked = op.publishable ? null : op.blockedReason
              const statusLabel = op.publishable
                ? "Ready"
                : op.effectiveServerUrl === null && baseUrlValid
                  ? "Ready"
                  : op.effectiveServerUrl === null
                    ? "Needs base URL"
                    : "Blocked"
              return (
                <TableRow key={key} data-state={selectedKeys.has(key) ? "selected" : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(key)}
                      onChange={() => onToggle(key)}
                      disabled={!publishable}
                      aria-label={`Publish ${op.method.toUpperCase()} ${op.path}`}
                      title={publishable ? undefined : blockedReasonLabel(blocked)}
                      className="size-5 cursor-pointer accent-lime disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </TableCell>
                  <TableCell>
                    <MethodBadge method={op.method} />
                  </TableCell>
                  <TableCell className="max-w-56">
                    <span className="block truncate font-mono text-xs text-ink" title={op.path}>
                      {op.path}
                    </span>
                    {op.callerPathTemplate !== null && (
                      <span className="block font-metadata text-[11px] text-review-bronze">
                        path params
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-72">
                    <span className="block truncate text-sm text-ink" title={op.summary ?? undefined}>
                      {op.summary ?? "—"}
                    </span>
                    {op.operationId !== null && (
                      <span className="block truncate font-mono text-[11px] text-muted-ink" title={op.operationId}>
                        {op.operationId}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-40">
                    <span className="block truncate text-sm text-muted-ink" title={op.tags.join(", ")}>
                      {op.tags[0] ?? "—"}
                      {op.tags.length > 1 ? ` +${op.tags.length - 1}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-metadata text-xs font-bold text-muted-ink">
                      {securityHintLabel(op.securityHints)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-36 flex-col items-start gap-1">
                      <StatusBadge
                        variant={
                          op.publishable || (op.effectiveServerUrl === null && baseUrlValid)
                            ? "verified"
                            : op.effectiveServerUrl === null
                              ? "review"
                              : "failed"
                        }
                      >
                        {statusLabel}
                      </StatusBadge>
                      {!publishable && (
                        <span className="max-w-44 text-xs leading-snug text-muted-ink">
                          {blockedReasonLabel(blocked)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <div className="mt-8 rounded-control border border-border bg-cream p-5">
        <Field data-invalid={baseUrlTouched && !baseUrlValid}>
          <FieldLabel htmlFor="base-url-override">Base URL override</FieldLabel>
          <Input
            id="base-url-override"
            type="url"
            value={baseUrlOverride}
            onChange={(event) => onBaseUrlOverrideChange(event.target.value)}
            aria-invalid={baseUrlTouched && !baseUrlValid}
            aria-describedby={
              baseUrlTouched && !baseUrlValid
                ? "base-url-override-error base-url-override-help"
                : "base-url-override-help"
            }
            className="min-h-11 rounded-control border-2 border-ink bg-cream px-4"
            placeholder="https://api.example.com"
          />
          <FieldDescription id="base-url-override-help">
            {baseUrlAppliesTo > 0
              ? `${baseUrlAppliesTo} operation${baseUrlAppliesTo === 1 ? "" : "s"} have no server URL in the spec. Set a public https base URL to unblock ${baseUrlAppliesTo === 1 ? "it" : "them"}${baseUrlValid ? " — ready to apply" : ""}.`
              : "All operations have a server URL. An override is not needed."}
          </FieldDescription>
          {baseUrlTouched && !baseUrlValid && (
            <FieldError id="base-url-override-error">
              Enter a public https URL. localhost and private addresses are blocked.
            </FieldError>
          )}
        </Field>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="min-h-11 rounded-pill border-2 border-ink bg-clear-paper px-5 font-bold text-ink hover:bg-cream"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to spec
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={selectedKeys.size === 0}
          className="min-h-12 rounded-pill border-2 border-ink bg-lime px-6 font-bold text-ink hover:bg-lime-hover"
        >
          Continue with {selectedKeys.size} operation{selectedKeys.size === 1 ? "" : "s"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}

function securityHintLabel(hints: Array<{ type: string; headerName: string | null }>): string {
  if (hints.length === 0) return "None"
  const [first, ...rest] = hints
  const label =
    first.type === "bearer"
      ? "Bearer"
      : first.type === "apiKey"
        ? first.headerName !== null
          ? first.headerName
          : "API key"
        : first.type
  return rest.length > 0 ? `${label} +${rest.length}` : label
}

export { OperationReview }
