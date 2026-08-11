"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  PenLine,
  Power,
  ReceiptText,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { FormEvent, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { EmptyState } from "@/components/metron"
import { CopyButton } from "@/components/metron/copy-button"
import { StatusBadge } from "@/components/metron/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/auth/use-auth"
import type { TransactionView } from "@/lib/dashboard/types"
import {
  EndpointClientError,
  endpointErrorMessage,
  endpointQueryKeys,
  fetchEndpoint,
  formatEndpointDate,
  parsePriceMicroUsdc,
  parseUpstreamUrl,
  retireEndpoint,
  updateEndpoint,
  type EndpointAuthInput,
  type EndpointView,
  type UpdateEndpointPatch,
} from "@/lib/endpoints/client"
import { cn } from "@/lib/utils"

type AuthType = "none" | "bearer" | "apiKey"

type EditValues = {
  name: string
  description: string
  upstreamUrl: string
  priceUsdc: string
  authType: AuthType
  bearerSecret: string
  apiHeaderName: string
  apiSecret: string
}
type EditErrors = Partial<Record<keyof EditValues, string>>

const EDIT_AUTH_OPTIONS: Array<{ value: AuthType; label: string }> = [
  { value: "none", label: "None" },
  { value: "bearer", label: "Bearer token" },
  { value: "apiKey", label: "API key" },
]

function authLabel(endpoint: EndpointView): string {
  if (!endpoint.hasUpstreamAuth || endpoint.upstreamAuthType === "NONE") {
    return "None"
  }
  if (endpoint.upstreamAuthType === "BEARER") {
    return "Bearer token"
  }
  if (endpoint.upstreamAuthType === "API_KEY") {
    return `API key · ${endpoint.headerName ?? "custom header"}`
  }
  return "None"
}

type RouteTransactionsResponse = {
  transactions: TransactionView[]
}

type RouteTransactionErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INTERNAL_ERROR"

class RouteTransactionClientError extends Error {
  readonly code: RouteTransactionErrorCode
  readonly status: number

  constructor(code: RouteTransactionErrorCode, status: number) {
    super(`Route transaction request failed with ${code}`)
    this.name = "RouteTransactionClientError"
    this.code = code
    this.status = status
  }
}

async function fetchRouteTransactions(
  routeId: string
): Promise<RouteTransactionsResponse> {
  const res = await fetch(`/api/transactions?routeId=${encodeURIComponent(routeId)}`)
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
    const code: RouteTransactionErrorCode =
      errorBody === "UNAUTHENTICATED"
        ? "UNAUTHENTICATED"
        : errorBody === "NOT_FOUND"
          ? "NOT_FOUND"
          : errorBody === "INVALID_INPUT"
            ? "INVALID_INPUT"
            : "INTERNAL_ERROR"
    throw new RouteTransactionClientError(code, res.status)
  }

  const transactions =
    body && typeof body === "object" && "transactions" in body
      ? (body as RouteTransactionsResponse).transactions
      : null
  if (!Array.isArray(transactions)) {
    throw new RouteTransactionClientError("INTERNAL_ERROR", res.status)
  }
  return { transactions }
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

const RECENT_CALLS_LIMIT = 5

function RecentPaidCalls({ id }: { id: string }) {
  const { refresh: refreshAuth } = useAuth()
  const { data, isPending, isError, error, refetch } = useQuery<RouteTransactionsResponse>({
    queryKey: ["transactions", "route", id],
    queryFn: () => fetchRouteTransactions(id),
    staleTime: 30_000,
  })

  const notFound =
    error instanceof RouteTransactionClientError && error.code === "NOT_FOUND"
  const unauthenticated =
    error instanceof RouteTransactionClientError && error.code === "UNAUTHENTICATED"

  return (
    <section className="relative rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-magenta min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-coral" aria-hidden="true">
          <ReceiptText className="size-5" />
        </span>
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">Recent paid calls</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-ink">The newest paid calls on this route, straight from the ledger.</p>
        </div>
      </div>

      {isPending ? (
        <div aria-live="polite" aria-label="Loading recent paid calls" className="mt-6 space-y-3">
          <Skeleton className="h-14 w-full bg-cream" />
          <Skeleton className="h-14 w-full bg-cream" />
          <Skeleton className="h-14 w-full bg-cream" />
        </div>
      ) : isError || data === undefined ? (
        notFound ? (
          <EmptyState
            className="mt-6"
            title="No paid calls on this route yet."
            description="Once a caller pays for a request and this route responds, its receipt appears here. Nothing is fabricated."
            icon={<ReceiptText aria-hidden="true" />}
          />
        ) : (
          <EmptyState
            className="mt-6"
            title={unauthenticated ? "Your session has expired" : "Recent paid calls are unavailable"}
            description={unauthenticated ? "Sign in again to view call receipts for this route." : "Real call records for this route could not be loaded. Try again in a moment."}
            icon={<ReceiptText aria-hidden="true" />}
            action={
              <Button type="button" onClick={() => { if (unauthenticated) refreshAuth(); void refetch() }} className="min-h-11 rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover">Try again</Button>
            }
          />
        )
      ) : data.transactions.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No paid calls on this route yet."
          description="Once a caller pays for a request and this route responds, its receipt appears here. Nothing is fabricated."
          icon={<ReceiptText aria-hidden="true" />}
        />
      ) : (
        <ul className="mt-6 divide-y divide-border" aria-label="Recent paid calls">
          {data.transactions.slice(0, RECENT_CALLS_LIMIT).map((transaction) => (
            <li key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <Link href={`/dashboard/transactions/${transaction.id}`} className="block min-w-0 focus-visible:shadow-focus focus-visible:outline-none">
                  <span className="block truncate font-heading text-sm font-semibold text-ink underline-offset-4 hover:underline">{formatEndpointDate(transaction.createdAt)}</span>
                </Link>
                {transaction.x402TxHash !== null && transaction.explorerUrl !== null ? (
                  <a
                    href={transaction.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={transaction.x402TxHash}
                    className="mt-1 inline-block font-metadata text-xs text-blueprint underline underline-offset-2 hover:text-ink focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    {shortTx(transaction.x402TxHash)}
                  </a>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-display text-lg font-bold tracking-[-0.02em] tabular-nums">{transaction.amountUsdc} USDC</p>
                <StatusBadge variant={statusVariant(transaction.paymentStatus)}>{transaction.paymentStatus}</StatusBadge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EndpointDetail({ id }: { id: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { refresh: refreshAuth } = useAuth()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<EditValues | null>(null)
  const [draftErrors, setDraftErrors] = useState<EditErrors>({})
  const [confirmingRetire, setConfirmingRetire] = useState(false)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: endpointQueryKeys.detail(id),
    queryFn: () => fetchEndpoint(id),
  })

  const endpoint = data?.endpoint

  const updateMutation = useMutation({
    mutationFn: (patch: UpdateEndpointPatch) => updateEndpoint(id, patch),
    onSuccess: ({ endpoint: updated }) => {
      queryClient.setQueryData(endpointQueryKeys.detail(id), { endpoint: updated })
      // Keep the list view consistent with the latest name/status.
      void queryClient.invalidateQueries({ queryKey: endpointQueryKeys.list })
    },
  })

  const retireMutation = useMutation({
    mutationFn: () => retireEndpoint(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: endpointQueryKeys.list })
      router.push("/dashboard/endpoints")
    },
    onError: () => {
      // Require a fresh two-click confirmation after a failed retire.
      setConfirmingRetire(false)
    },
  })

  function startEditing() {
    if (!endpoint) return
    setDraft({
      name: endpoint.name,
      description: endpoint.description ?? "",
      upstreamUrl: endpoint.upstreamUrl,
      priceUsdc: endpoint.priceUsdc,
      authType:
        endpoint.upstreamAuthType === "BEARER"
          ? "bearer"
          : endpoint.upstreamAuthType === "API_KEY"
            ? "apiKey"
            : "none",
      // Secrets are never re-populated from the stored endpoint; the form
      // only ever shows the configured state, never the secret itself.
      bearerSecret: "",
      apiHeaderName: endpoint.headerName ?? "",
      apiSecret: "",
    })
    setDraftErrors({})
    setEditing(true)
  }

  function cancelEditing() {
    setDraft(null)
    setDraftErrors({})
    setEditing(false)
  }

  function updateDraft(field: Exclude<keyof EditValues, "authType">, value: string) {
    setDraft((current) => (current ? { ...current, [field]: value } : current))
    setDraftErrors((current) => ({ ...current, [field]: undefined }))
  }

  function changeEditAuthType(next: AuthType) {
    setDraft((current) => (current ? { ...current, authType: next } : current))
    setDraftErrors((current) => ({
      ...current,
      bearerSecret: undefined,
      apiHeaderName: undefined,
      apiSecret: undefined,
    }))
  }

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || !endpoint) return
    const nextErrors: EditErrors = {}
    if (!draft.name.trim()) nextErrors.name = "Enter a name for this endpoint."
    if (!parseUpstreamUrl(draft.upstreamUrl)) {
      nextErrors.upstreamUrl = "Enter a valid HTTP or HTTPS upstream URL."
    }
    const micros = parsePriceMicroUsdc(draft.priceUsdc)
    if (micros === null || micros <= 0) {
      nextErrors.priceUsdc = "Enter a price greater than zero."
    }

    // Auth patch semantics mirror the PATCH contract in service.update:
    // undefined = preserve, null = clear, object = replace.
    const currentType = endpoint.upstreamAuthType
    const sameMode =
      draft.authType ===
      (currentType === "BEARER" ? "bearer" : currentType === "API_KEY" ? "apiKey" : "none")
    const currentHasAuth = endpoint.hasUpstreamAuth && currentType !== "NONE"

    let auth: EndpointAuthInput | null | undefined
    if (draft.authType === "none") {
      // Clear only when there is something to clear; otherwise omit.
      auth = currentHasAuth ? null : undefined
    } else if (draft.authType === "bearer") {
      if (sameMode && !draft.bearerSecret.trim()) {
        // Same mode with a blank secret: keep the existing credential.
        auth = undefined
      } else {
        if (!draft.bearerSecret.trim()) {
          nextErrors.bearerSecret = "Enter the bearer token to send to your upstream."
        }
        auth = { type: "bearer", secret: draft.bearerSecret.trim() }
      }
    } else {
      const headerName = draft.apiHeaderName.trim()
      if (sameMode && !draft.apiSecret.trim()) {
        if (headerName.toLowerCase() === (endpoint.headerName ?? "").toLowerCase()) {
          // Same mode, same header, blank secret: keep the existing key.
          auth = undefined
        } else {
          // Changing the header name requires the key too, so the change is
          // never silently dropped.
          nextErrors.apiSecret = "Enter the API key value to change the header name."
        }
      } else {
        if (!headerName) {
          nextErrors.apiHeaderName = "Enter the header name to send your key in."
        }
        if (!draft.apiSecret.trim()) {
          nextErrors.apiSecret = "Enter the API key value."
        }
        auth = { type: "apiKey", headerName, secret: draft.apiSecret.trim() }
      }
    }

    setDraftErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    updateMutation.mutate(
      {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        upstreamUrl: draft.upstreamUrl.trim(),
        priceUsdc: draft.priceUsdc.trim(),
        ...(auth !== undefined ? { auth } : {}),
      },
      { onSuccess: cancelEditing }
    )
  }

  function toggleActive() {
    if (!endpoint) return
    const nextActive = !endpoint.isActive
    // Optimistic update for an instant toggle; refetch on failure to resync.
    const previous = endpoint
    queryClient.setQueryData(endpointQueryKeys.detail(id), {
      endpoint: { ...endpoint, isActive: nextActive },
    })
    updateMutation.mutate(
      { isActive: nextActive },
      {
        onError: () => {
          queryClient.setQueryData(endpointQueryKeys.detail(id), {
            endpoint: previous,
          })
        },
      }
    )
  }

  function handleRetireClick() {
    if (confirmingRetire) {
      retireMutation.mutate()
    } else {
      setConfirmingRetire(true)
    }
  }

  const endpointError = error
    ? error instanceof EndpointClientError
      ? error
      : null
    : null
  const notFound =
    endpointError?.code === "ENDPOINT_NOT_FOUND"
  const unauthenticated = endpointError?.code === "UNAUTHENTICATED"

  const updateFailedMessage =
    updateMutation.isError &&
    updateMutation.error instanceof EndpointClientError
      ? endpointErrorMessage(updateMutation.error.code)
      : null
  const retireFailedMessage =
    retireMutation.isError &&
    retireMutation.error instanceof EndpointClientError
      ? endpointErrorMessage(retireMutation.error.code)
      : null

  if (isPending) {
    return <div aria-live="polite" aria-label="Loading endpoint" className="space-y-3"><div className="flex items-center gap-2 text-sm text-muted-ink"><Spinner className="size-4 text-blueprint" />Loading endpoint…</div><Skeleton className="h-40 w-full bg-cream" /></div>
  }

  if (isError || !endpoint) {
    return (
      <EmptyState
        className="mt-3 min-w-0 max-w-full"
        title={notFound ? "Endpoint not found" : unauthenticated ? "Your session has expired" : "Endpoint unavailable"}
        description={notFound ? "This powered route no longer exists or was retired." : unauthenticated ? "Sign in again to view this endpoint." : endpointError ? endpointErrorMessage(endpointError.code) : "The endpoint could not be loaded."}
        icon={<AlertTriangle aria-hidden="true" />}
        action={(() => {
          if (notFound) {
            return <Link href="/dashboard/endpoints" className="inline-flex min-h-11 items-center gap-2 rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none"><ArrowLeft className="size-4" aria-hidden="true" />Back to endpoints</Link>
          }
          return <Button type="button" onClick={() => { if (unauthenticated) refreshAuth(); void refetch() }} className="min-h-11 rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover">Try again</Button>
        })()}
      />
    )
  }

  return (
    <div className="grid min-w-0 max-w-full gap-8">
      {(updateFailedMessage || retireFailedMessage) && (
        <Alert className="border-failure-red/30 bg-failure-red/10 text-ink">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Could not save changes</AlertTitle>
          <AlertDescription className="text-muted-ink">{updateFailedMessage ?? retireFailedMessage}</AlertDescription>
        </Alert>
      )}

      <section className="relative mt-3 min-w-0 max-w-full rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:mt-0 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
        <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-metadata text-xs font-bold tracking-[0.1em] text-blueprint uppercase">Endpoint detail</p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.035em] break-words">{endpoint.name}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-ink">{endpoint.description || "—"}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {endpoint.isActive ? <StatusBadge variant="verified">Active</StatusBadge> : <StatusBadge variant="neutral">Disabled</StatusBadge>}
              <span className="font-mono text-xs font-bold tracking-[0.04em] text-muted-ink">/{endpoint.slug}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {editing ? (
              <Button type="button" variant="outline" onClick={cancelEditing} className="min-h-11 rounded-pill border-2 border-ink px-5 font-bold">Cancel</Button>
            ) : (
              <Button type="button" variant="outline" onClick={startEditing} className="min-h-11 rounded-pill border-2 border-ink px-5 font-bold"><PenLine className="size-4" aria-hidden="true" />Edit</Button>
            )}
            <Button type="button" variant="outline" disabled={updateMutation.isPending} onClick={toggleActive} className={cn("min-h-11 rounded-pill border-2 border-ink px-5 font-bold", endpoint.isActive ? "bg-clear-paper text-ink hover:bg-cream" : "bg-lime text-ink hover:bg-lime-hover")}>
              {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Power className="size-4" aria-hidden="true" />}
              {endpoint.isActive ? "Disable" : "Enable"}
            </Button>
            <Button type="button" variant="outline" disabled={retireMutation.isPending} onClick={handleRetireClick} className={cn("min-h-11 rounded-pill border-2 border-ink px-5 font-bold", confirmingRetire ? "bg-failure-red/15 text-failure-red" : "bg-clear-paper text-ink hover:bg-cream")}>
              {retireMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
              {retireMutation.isPending ? "Retiring…" : confirmingRetire ? "Confirm retire?" : "Retire endpoint"}
            </Button>
          </div>
        </div>

        {editing ? (
          <form noValidate onSubmit={saveEdit} className="mt-6 grid gap-6">
            <FieldGroup>
              <Field data-invalid={Boolean(draftErrors.name)}>
                <FieldLabel htmlFor="edit-endpoint-name">Endpoint name <span aria-hidden="true">*</span><span className="sr-only"> required</span></FieldLabel>
                <Input id="edit-endpoint-name" required value={draft?.name ?? ""} onChange={(event) => updateDraft("name", event.target.value)} aria-invalid={Boolean(draftErrors.name)} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" />
                {draftErrors.name && <FieldError id="edit-endpoint-name-error">{draftErrors.name}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-endpoint-description">Description</FieldLabel>
                <textarea id="edit-endpoint-description" value={draft?.description ?? ""} onChange={(event) => updateDraft("description", event.target.value)} className="min-h-11 w-full rounded-control border-2 border-ink bg-cream px-4 py-3 text-base outline-none focus-visible:shadow-focus placeholder:text-muted-ink md:text-sm" rows={3} />
              </Field>
              <Field data-invalid={Boolean(draftErrors.upstreamUrl)}>
                <FieldLabel htmlFor="edit-upstream-url">Upstream URL <span aria-hidden="true">*</span><span className="sr-only"> required</span></FieldLabel>
                <Input id="edit-upstream-url" required type="url" value={draft?.upstreamUrl ?? ""} onChange={(event) => updateDraft("upstreamUrl", event.target.value)} aria-invalid={Boolean(draftErrors.upstreamUrl)} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" />
                {draftErrors.upstreamUrl && <FieldError id="edit-upstream-url-error">{draftErrors.upstreamUrl}</FieldError>}
              </Field>
              <Field data-invalid={Boolean(draftErrors.priceUsdc)}>
                <FieldLabel htmlFor="edit-price">Flat price per request <span aria-hidden="true">*</span><span className="sr-only"> required</span></FieldLabel>
                <Input id="edit-price" required inputMode="decimal" value={draft?.priceUsdc ?? ""} onChange={(event) => updateDraft("priceUsdc", event.target.value)} aria-invalid={Boolean(draftErrors.priceUsdc)} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="0.005" />
                {draftErrors.priceUsdc && <FieldError id="edit-price-error">{draftErrors.priceUsdc}</FieldError>}
              </Field>
              <Field data-invalid={Boolean(draftErrors.bearerSecret || draftErrors.apiHeaderName || draftErrors.apiSecret)}>
                <FieldLabel htmlFor="edit-upstream-auth">Upstream authentication</FieldLabel>
                <div id="edit-upstream-auth" role="group" aria-label="Upstream authentication type" className="flex flex-wrap gap-2">
                  {EDIT_AUTH_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={draft?.authType === option.value ? "default" : "outline"}
                      className="min-h-11 rounded-pill border-2 border-ink px-4 font-bold"
                      onClick={() => changeEditAuthType(option.value)}
                      aria-pressed={draft?.authType === option.value}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>

                {draft?.authType === "bearer" && (
                  <div className="mt-4 w-full">
                    <Input id="edit-bearer-secret" type="password" autoComplete="off" value={draft.bearerSecret} onChange={(event) => updateDraft("bearerSecret", event.target.value)} aria-invalid={Boolean(draftErrors.bearerSecret)} aria-describedby={draftErrors.bearerSecret ? "edit-bearer-secret-error" : "edit-bearer-secret-help"} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="Bearer token" />
                    <FieldDescription id="edit-bearer-secret-help">
                      {endpoint.upstreamAuthType === "BEARER"
                        ? "Bearer token configured. Leave blank to keep existing token."
                        : "Sent as an Authorization: Bearer header. Never shown after saving."}
                    </FieldDescription>
                    {draftErrors.bearerSecret && <FieldError id="edit-bearer-secret-error">{draftErrors.bearerSecret}</FieldError>}
                  </div>
                )}

                {draft?.authType === "apiKey" && (
                  <div className="mt-4 grid w-full gap-4">
                    <div>
                      <Input id="edit-api-header-name" value={draft.apiHeaderName} onChange={(event) => updateDraft("apiHeaderName", event.target.value)} aria-invalid={Boolean(draftErrors.apiHeaderName)} aria-describedby={draftErrors.apiHeaderName ? "edit-api-header-name-error" : "edit-api-header-name-help"} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="X-API-Key" />
                      <FieldDescription id="edit-api-header-name-help">Protocol-reserved names like Host, Cookie, and PAYMENT-REQUIRED are blocked.</FieldDescription>
                      {draftErrors.apiHeaderName && <FieldError id="edit-api-header-name-error">{draftErrors.apiHeaderName}</FieldError>}
                    </div>
                    <div>
                      <Input id="edit-api-secret" type="password" autoComplete="off" value={draft.apiSecret} onChange={(event) => updateDraft("apiSecret", event.target.value)} aria-invalid={Boolean(draftErrors.apiSecret)} aria-describedby={draftErrors.apiSecret ? "edit-api-secret-error" : "edit-api-secret-help"} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="API key value" />
                      <FieldDescription id="edit-api-secret-help">
                        {endpoint.upstreamAuthType === "API_KEY"
                          ? "API key configured. Leave blank to keep existing key."
                          : "Sent in your custom header. Never shown after saving."}
                      </FieldDescription>
                      {draftErrors.apiSecret && <FieldError id="edit-api-secret-error">{draftErrors.apiSecret}</FieldError>}
                    </div>
                  </div>
                )}

                {draft?.authType !== "none" && (
                  <FieldDescription className="mt-3 flex items-center gap-1.5">
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    Stored encrypted and only used by Metron when forwarding calls.
                  </FieldDescription>
                )}
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={updateMutation.isPending} className="min-h-11 w-fit rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover">
              {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        ) : (
          <dl className="mt-6 grid min-w-0 max-w-full gap-5">
            <div className="min-w-0">
              <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Upstream URL</dt>
              <dd className="mt-2 flex min-w-0 flex-wrap items-center gap-3">
                <code className="min-w-0 max-w-full truncate rounded-control border border-border bg-cream px-3 py-2 font-mono text-sm text-ink">{endpoint.upstreamUrl}</code>
                <CopyButton value={endpoint.upstreamUrl} label="Copy upstream URL" copiedLabel="Copied" className="min-h-11 border-2 border-ink" />
              </dd>
            </div>
            <div>
              <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Price per request</dt>
              <dd className="mt-2 font-display text-2xl font-bold tracking-[-0.02em] tabular-nums text-ink">{endpoint.priceUsdc} USDC</dd>
            </div>
            <div className="min-w-0">
              <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Powered URL</dt>
              <dd className="mt-2 flex min-w-0 flex-wrap items-center gap-3">
                <code className="min-w-0 max-w-full truncate rounded-control border border-border bg-cream px-3 py-2 font-mono text-sm text-ink">{endpoint.poweredUrl}</code>
                <CopyButton value={endpoint.poweredUrl} label="Copy powered URL" copiedLabel="Copied" className="min-h-11 border-2 border-ink" />
              </dd>
              <dd className="mt-2 text-sm leading-relaxed text-muted-ink">Payment requirement live — callers receive a real x402 challenge here. Paid execution is not enabled yet.</dd>
            </div>
            <div>
              <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Upstream auth</dt>
              <dd className="mt-2 text-sm font-medium text-ink">{authLabel(endpoint)}</dd>
            </div>
            <div>
              <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Created</dt>
              <dd className="mt-2 text-sm font-medium text-ink">{formatEndpointDate(endpoint.createdAt)}</dd>
            </div>
          </dl>
        )}
      </section>

      <RecentPaidCalls id={id} />
    </div>
  )
}

export { EndpointDetail }
