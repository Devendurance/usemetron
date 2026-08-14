"use client"

import Link from "next/link"
import { AlertCircle, ArrowRight, ExternalLink, Loader2, RefreshCw, Send } from "lucide-react"
import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"

import { MethodBadge } from "@/components/dashboard/openapi/method-badge"
import { CopyButton } from "@/components/metron/copy-button"
import { StatusBadge } from "@/components/metron/status-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  OpenApiClientError,
  publishOpenApiOperations,
  type DiscoveredOperation,
  type PublishOperationInput,
  type PublishOperationResult,
} from "@/lib/openapi/client"
import { endpointErrorMessage } from "@/lib/endpoints/client"

function ImportPublishResults({
  payload,
  operations,
  onReset,
}: {
  payload: PublishOperationInput[]
  operations: DiscoveredOperation[]
  onReset: () => void
}) {
  const [results, setResults] = useState<PublishOperationResult[] | null>(null)

  const publishMutation = useMutation({
    mutationFn: (ops: PublishOperationInput[]) => publishOpenApiOperations(ops),
    onSuccess: (data) => setResults(data.results),
  })

  const retryMutation = useMutation({
    mutationFn: (ops: PublishOperationInput[]) => publishOpenApiOperations(ops),
    onSuccess: (data) => {
      setResults((current) => {
        const byKey = new Map(data.results.map((result) => [result.key, result]))
        const retained = (current ?? []).filter((result) => !byKey.has(result.key))
        return [...retained, ...data.results]
      })
    },
  })

  const inFlight = publishMutation.isPending || retryMutation.isPending

  const operationsByKey = useMemo(
    () => new Map(operations.map((op) => [`${op.method} ${op.path}`, op])),
    [operations]
  )

  const failedKeys = useMemo(
    () =>
      (results ?? [])
        .filter((result): result is Extract<PublishOperationResult, { ok: false }> => !result.ok)
        .map((result) => result.key),
    [results]
  )

  const failedPayload = useMemo(
    () => payload.filter((entry) => failedKeys.includes(entry.key)),
    [payload, failedKeys]
  )

  const publishedCount = (results ?? []).filter((result) => result.ok).length
  const failedCount = failedKeys.length

  const activeError = publishMutation.error ?? retryMutation.error
  const topLevelError =
    activeError instanceof OpenApiClientError
      ? topLevelErrorText(activeError)
      : activeError !== null
        ? "Something went wrong on our side. Please try again."
        : null

  function runPublish() {
    publishMutation.mutate(payload)
  }

  function runRetry() {
    if (failedPayload.length === 0) return
    retryMutation.mutate(failedPayload)
  }

  return (
    <section className="relative mt-10 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      {results === null ? (
        <>
          <h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">
            Review and publish
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-ink">
            Publishing creates {payload.length} live paid route
            {payload.length === 1 ? "" : "s"}. Each route is created independently — a failure
            on one never stops the others, and failed routes can be retried afterwards.
          </p>

          {topLevelError !== null && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-3 rounded-control border border-failure-red/30 bg-failure-red/10 p-4"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-failure-red" aria-hidden="true" />
              <p className="text-sm text-muted-ink">{topLevelError}</p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button
              type="button"
              onClick={runPublish}
              disabled={inFlight}
              className="min-h-12 rounded-pill border-2 border-ink bg-lime px-6 font-bold text-ink hover:bg-lime-hover"
            >
              {publishMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              {publishMutation.isPending
                ? `Publishing ${payload.length} route${payload.length === 1 ? "" : "s"}…`
                : `Publish ${payload.length} route${payload.length === 1 ? "" : "s"}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              disabled={inFlight}
              className="min-h-11 rounded-pill border-2 border-ink bg-clear-paper px-5 font-bold text-ink hover:bg-cream"
            >
              Start a new import
            </Button>
          </div>

          {publishMutation.isPending && (
            <div aria-live="polite" aria-label="Publishing routes" className="mt-8 space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-ink">
                <Spinner className="size-4 text-blueprint" />
                Creating your paid routes…
              </div>
              <Skeleton className="h-14 w-full bg-cream" />
              <Skeleton className="h-14 w-full bg-cream" />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">
                Publish results
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge variant="verified">
                  {publishedCount} published
                </StatusBadge>
                {failedCount > 0 && (
                  <StatusBadge variant="failed">{failedCount} failed</StatusBadge>
                )}
              </div>
            </div>
            <Link
              href="/dashboard/endpoints"
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none"
            >
              View endpoints
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          {topLevelError !== null && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-3 rounded-control border border-failure-red/30 bg-failure-red/10 p-4"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-failure-red" aria-hidden="true" />
              <p className="text-sm text-muted-ink">{topLevelError}</p>
            </div>
          )}

          {retryMutation.isPending && (
            <div aria-live="polite" aria-label="Retrying failed routes" className="mt-8 space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-ink">
                <Spinner className="size-4 text-blueprint" />
                Retrying {failedPayload.length} failed route{failedPayload.length === 1 ? "" : "s"}…
              </div>
              <Skeleton className="h-14 w-full bg-cream" />
            </div>
          )}

          {!retryMutation.isPending && (
            <ul className="mt-8 space-y-4">
              {results.map((result) => {
                const entry = payload.find((candidate) => candidate.key === result.key)
                const op = operationsByKey.get(result.key)
                if (!result.ok) {
                  return (
                    <li
                      key={result.key}
                      className="rounded-control border border-failure-red/30 bg-failure-red/10 p-5"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <MethodBadge method={op?.method ?? ""} />
                        <span className="min-w-0 flex-1 truncate font-heading text-sm font-semibold text-ink">
                          {entry?.name ?? result.key}
                        </span>
                        <StatusBadge variant="failed">Failed</StatusBadge>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-muted-ink">
                        {endpointErrorMessage(result.error)}
                      </p>
                    </li>
                  )
                }
                const callerPath =
                  op?.callerPathTemplate !== null && op?.callerPathTemplate !== undefined
                    ? `${result.poweredUrl}${op.callerPathTemplate}`
                    : null
                return (
                  <li key={result.key} className="rounded-control border border-border bg-clear-paper p-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <MethodBadge method={op?.method ?? ""} />
                      <span className="min-w-0 flex-1 truncate font-heading text-sm font-semibold text-ink">
                        {entry?.name ?? result.key}
                      </span>
                      <Link
                        href={`/dashboard/endpoints/${result.id}`}
                        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-blueprint underline underline-offset-4 focus-visible:shadow-focus focus-visible:outline-none"
                      >
                        Open route
                        <ExternalLink className="size-4" aria-hidden="true" />
                      </Link>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="block max-w-full truncate font-mono text-xs text-muted-ink" title={result.poweredUrl}>
                          {result.poweredUrl}
                        </span>
                        <CopyButton
                          value={result.poweredUrl}
                          label="Copy"
                          copiedLabel="Copied"
                          className="min-h-10 min-w-10 border-2 border-ink bg-clear-paper px-2.5"
                        />
                      </div>
                      {callerPath !== null && (
                        <div>
                          <p className="font-metadata text-[11px] font-bold tracking-[0.08em] text-muted-ink uppercase">
                            Caller path
                          </p>
                          <p className="mt-1 block break-all font-mono text-xs text-ink" title={callerPath}>
                            {callerPath}
                          </p>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              disabled={inFlight}
              className="min-h-11 rounded-pill border-2 border-ink bg-clear-paper px-5 font-bold text-ink hover:bg-cream"
            >
              Start a new import
            </Button>
            {failedCount > 0 && (
              <Button
                type="button"
                onClick={runRetry}
                disabled={inFlight || failedPayload.length === 0}
                className="min-h-12 rounded-pill border-2 border-ink bg-lime px-6 font-bold text-ink hover:bg-lime-hover"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Retry {failedCount} failed route{failedCount === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function topLevelErrorText(error: OpenApiClientError | null): string {
  if (error === null) return "Something went wrong on our side. Please try again."
  switch (error.code) {
    case "UNAUTHENTICATED":
      return "Your session has expired. Sign in again to continue."
    case "INVALID_BODY":
      return "The publish request was not accepted. Go back and review the configuration."
    case "RATE_LIMITED":
      return "Too many publish requests. Wait a moment and try again."
    default:
      return "Something went wrong on our side. Please try again."
  }
}

export { ImportPublishResults }
