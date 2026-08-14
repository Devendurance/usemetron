"use client"

import {
  AlertTriangle,
  FlaskConical,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { useRef, useState, type ReactNode } from "react"
import { useMutation } from "@tanstack/react-query"

import { StatusBadge } from "@/components/metron/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { EndpointAuthInput } from "@/lib/endpoints/client"
import {
  runEndpointTest,
  testConsoleErrorMessage,
  type RunEndpointTestInput,
  type TestConsoleClientError,
  type TestConsoleErrorCode,
  type TestRequestInput,
  type TestResult,
} from "@/lib/testconsole/client"
import { cn } from "@/lib/utils"

/**
 * Shared "Test upstream" console.
 *
 * Sends one live request through the REAL hardened gateway
 * (`POST /api/endpoints/test`) with no payment side effects. In "existing"
 * mode it tests with the stored credential (endpointId); in "draft" mode it
 * reads the current parent form state via the `draft` accessor. The console
 * never reads or renders auth secret values — the draft auth object is
 * forwarded to the API untouched and only the server-side `TestResult`
 * (which never contains credentials) is displayed.
 */

export type UpstreamTestConsoleProps = {
  className?: string
} & (
  | { mode: "draft"; draft: () => { upstreamUrl: string; auth: EndpointAuthInput } }
  | { mode: "existing"; endpointId: string }
)

const METHODS = ["GET", "POST"] as const

const MAX_CALLER_BODY_BYTES = 1024 * 1024
const MAX_PATH_SUFFIX_LENGTH = 2048
const MAX_PAIR_ENTRIES = 64
const MAX_PAIR_KEY_LENGTH = 64
const MAX_PAIR_VALUE_LENGTH = 2048

type PairRow = { id: number; key: string; value: string }

type ConsoleErrors = Partial<Record<"path" | "query" | "headers" | "body", string>>

/** Reason labels shared by invalid_config and ssrf_blocked results. */
const CONFIG_REASON_LABELS: Record<string, string> = {
  url_empty: "The upstream URL is empty.",
  url_malformed: "The upstream URL is not a valid URL.",
  url_unsupported_scheme: "The upstream URL must use http or https.",
  url_http_not_allowed: "Plain http upstreams are blocked in production.",
  url_embedded_credentials: "The upstream URL must not contain credentials.",
  url_blocked_hostname:
    "That hostname is not allowed (private or unsafe destinations are blocked).",
  url_blocked_ip:
    "That address is not allowed (private or loopback IPs are blocked).",
  url_resolves_to_blocked_ip:
    "That server resolves to a private address and is blocked.",
  url_dns_resolution_failed: "The upstream hostname could not be resolved.",
  request_body_too_large: "The request body exceeds the 1 MiB limit.",
  secret_encryption_failed:
    "The upstream credential could not be prepared. Try again.",
  invalid_auth_config: "The upstream authentication settings are invalid.",
  empty_secret: "The upstream credential is empty.",
  secret_too_long: "The upstream credential is too long (max 4096 characters).",
  secret_contains_newline: "The upstream credential must not contain newlines.",
  invalid_header_name: "The custom header name is invalid.",
  forbidden_header_name: "That header name is reserved and cannot be used.",
}

/** Labels for upstream_failed / non_2xx error codes. */
const UPSTREAM_ERROR_LABELS: Record<string, string> = {
  UPSTREAM_EXECUTION_FAILED: "The upstream request could not be executed.",
  UPSTREAM_UNREACHABLE: "The upstream server could not be reached.",
  UPSTREAM_RESPONSE_TOO_LARGE: "The upstream response exceeded the 5 MiB cap.",
  UPSTREAM_UNSAFE_DESTINATION: "The destination was blocked by safety checks.",
  UPSTREAM_INVALID_RESPONSE: "The upstream response was not valid HTTP.",
  UPSTREAM_RESPONSE_DECODE_FAILED:
    "The upstream response could not be decoded.",
  UPSTREAM_NON_2XX: "The upstream returned a non-2xx status.",
}

function configReasonLabel(reason: string): string {
  return CONFIG_REASON_LABELS[reason] ?? "The test configuration was not accepted."
}

function upstreamErrorLabel(errorCode: string): string {
  return UPSTREAM_ERROR_LABELS[errorCode] ?? "The upstream request failed."
}

function splitSegments(raw: string): string[] {
  return raw.split("/").filter((segment) => segment !== "")
}

/**
 * Client mirror of the gateway's path guard (lib/gateway/upstream-url.ts):
 * dot segments, backslashes and encoded dots are rejected. The server
 * remains authoritative — this only avoids a wasted round trip.
 */
function normalizePathSuffix(
  raw: string
): { ok: true; path: string } | { ok: false; reason: string } {
  const trimmed = raw.trim()
  if (trimmed === "") return { ok: true, path: "" }
  if (trimmed.length > MAX_PATH_SUFFIX_LENGTH) {
    return { ok: false, reason: "Path suffix is too long (max 2048 characters)." }
  }
  for (const segment of splitSegments(trimmed)) {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      decoded = segment
    }
    if (
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("\\") ||
      decoded.toLowerCase().includes("%2e")
    ) {
      return {
        ok: false,
        reason: "Path traversal is not allowed — . and .. segments are blocked.",
      }
    }
  }
  return { ok: true, path: splitSegments(trimmed).join("/") }
}

function rowsToRecord(rows: PairRow[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (key === "") continue
    record[key] = row.value
  }
  return record
}

function pairRowError(rows: PairRow[], label: string): string | null {
  let filledCount = 0
  for (const row of rows) {
    const key = row.key.trim()
    if (key === "") continue
    filledCount += 1
    if (key.length > MAX_PAIR_KEY_LENGTH) {
      return `${label} names must be ${MAX_PAIR_KEY_LENGTH} characters or fewer.`
    }
    if (row.value.length > MAX_PAIR_VALUE_LENGTH) {
      return `${label} values must be ${MAX_PAIR_VALUE_LENGTH} characters or fewer.`
    }
  }
  if (filledCount > MAX_PAIR_ENTRIES) {
    return `At most ${MAX_PAIR_ENTRIES} ${label.toLowerCase()}s.`
  }
  return null
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length
}

function formatLatency(latencyMs: number): string {
  return `${Math.round(latencyMs)} ms`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KiB`
}

/** Display-only target preview; never includes auth material. */
function displayTarget(baseUrl: string, suffix: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "")
  if (base === "") return "… (upstream URL not filled in yet)"
  const segments = splitSegments(suffix)
  return `${base}${segments.length > 0 ? `/${segments.join("/")}` : ""}`
}

function KeyValueRows({
  idPrefix,
  rows,
  onAdd,
  onRemove,
  onChange,
  keyLabel,
  valueLabel,
  help,
  error,
}: {
  idPrefix: string
  rows: PairRow[]
  onAdd: () => void
  onRemove: (id: number) => void
  onChange: (id: number, patch: Partial<PairRow>) => void
  keyLabel: string
  valueLabel: string
  help?: ReactNode
  error?: string
}) {
  return (
    <Field data-invalid={error !== undefined}>
      <div className="flex items-center justify-between gap-2">
        <FieldTitle>{keyLabel} / {valueLabel}</FieldTitle>
        <Button
          type="button"
          variant="outline"
          onClick={onAdd}
          className="min-h-10 rounded-pill border-2 border-ink bg-clear-paper px-4 font-bold text-ink hover:bg-cream"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add
        </Button>
      </div>
      <ul className="space-y-2">
        {rows.length === 0 ? (
          <li className="rounded-control border border-dashed border-border px-3 py-4 text-center text-sm text-muted-ink">
            No {valueLabel.toLowerCase()}s yet — add one to include it in the test.
          </li>
        ) : (
          rows.map((row, index) => (
            <li key={row.id} className="flex items-start gap-2">
              <Input
                id={`${idPrefix}-key-${index}`}
                value={row.key}
                onChange={(event) => onChange(row.id, { key: event.target.value })}
                aria-label={`${keyLabel} name`}
                className="min-h-11 w-2/5 min-w-24 rounded-control border-2 border-ink bg-cream px-3 font-mono text-sm"
                placeholder={keyLabel}
              />
              <Input
                value={row.value}
                onChange={(event) => onChange(row.id, { value: event.target.value })}
                aria-label={`${valueLabel} value`}
                className="min-h-11 min-w-0 flex-1 rounded-control border-2 border-ink bg-cream px-3 font-mono text-sm"
                placeholder={valueLabel}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => onRemove(row.id)}
                aria-label={`Remove ${keyLabel} row`}
                className="min-h-11 min-w-11 rounded-control border-2 border-ink bg-clear-paper text-ink hover:bg-cream"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))
        )}
      </ul>
      {help !== undefined && <FieldDescription>{help}</FieldDescription>}
      {error !== undefined && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function ResultPanel({
  result,
  errorCode,
  isPending,
}: {
  result: TestResult | null
  errorCode: TestConsoleErrorCode | null
  isPending: boolean
}) {
  if (isPending) {
    return (
      <div className="flex items-center gap-2 rounded-control border border-border bg-clear-paper px-4 py-3 text-sm text-muted-ink">
        <Loader2 className="size-4 animate-spin text-blueprint" aria-hidden="true" />
        Running the test request…
      </div>
    )
  }

  if (errorCode !== null) {
    return (
      <Alert className="border-failure-red/30 bg-failure-red/10 text-ink">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Test could not run</AlertTitle>
        <AlertDescription className="text-muted-ink">
          {testConsoleErrorMessage(errorCode)}
        </AlertDescription>
      </Alert>
    )
  }

  if (result === null) return null

  if (result.kind === "success") {
    return (
      <div className="rounded-control border-2 border-ink bg-clear-paper p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge variant="verified">Success</StatusBadge>
          <span className="font-display text-2xl font-bold tracking-[-0.02em] tabular-nums text-ink">
            {result.status}
          </span>
          <span className="font-metadata text-xs font-bold tracking-[0.04em] tabular-nums text-muted-ink">
            {formatLatency(result.latencyMs)}
          </span>
          {result.contentType !== null && (
            <span
              className="max-w-64 truncate font-mono text-xs text-muted-ink"
              title={result.contentType}
            >
              {result.contentType}
            </span>
          )}
          <span className="font-metadata text-xs font-bold tracking-[0.04em] tabular-nums text-muted-ink">
            {formatBytes(result.bodyBytes)}
          </span>
        </div>
        <pre className="mt-3 max-h-72 overflow-auto rounded-control border border-border bg-cream p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-ink">
          {result.bodyPreview}
        </pre>
        {result.previewTruncated && (
          <p className="mt-2 text-xs font-medium text-review-bronze">
            Preview truncated at 64 KiB — the full response was larger.
          </p>
        )}
      </div>
    )
  }

  if (result.kind === "non_2xx") {
    return (
      <div className="rounded-control border-2 border-ink bg-clear-paper p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge variant="review">Upstream responded {result.status}</StatusBadge>
          <span className="font-metadata text-xs font-bold tracking-[0.04em] tabular-nums text-muted-ink">
            {formatLatency(result.latencyMs)}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-ink">
          {upstreamErrorLabel(result.errorCode)}
        </p>
      </div>
    )
  }

  if (result.kind === "upstream_failed") {
    return (
      <div className="rounded-control border-2 border-ink bg-clear-paper p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge variant="failed">Upstream failed</StatusBadge>
          <span className="font-metadata text-xs font-bold tracking-[0.04em] tabular-nums text-muted-ink">
            {formatLatency(result.latencyMs)}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-ink">
          {upstreamErrorLabel(result.errorCode)}
        </p>
      </div>
    )
  }

  if (result.kind === "ssrf_blocked") {
    return (
      <div className="rounded-control border-2 border-ink bg-clear-paper p-4">
        <StatusBadge variant="failed">Blocked by safety checks</StatusBadge>
        <p className="mt-2 text-sm leading-relaxed text-muted-ink">
          {configReasonLabel(result.reason)}
        </p>
      </div>
    )
  }

  if (result.kind === "invalid_config") {
    return (
      <div className="rounded-control border-2 border-ink bg-clear-paper p-4">
        <StatusBadge variant="review">Invalid configuration</StatusBadge>
        <p className="mt-2 text-sm leading-relaxed text-muted-ink">
          {configReasonLabel(result.reason)}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-control border-2 border-ink bg-clear-paper p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge variant="review">Timed out</StatusBadge>
        <span className="font-metadata text-xs font-bold tracking-[0.04em] tabular-nums text-muted-ink">
          {formatLatency(result.latencyMs)}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-ink">
        No response within the gateway timeout.
      </p>
    </div>
  )
}

function UpstreamTestConsole(props: UpstreamTestConsoleProps) {
  const { className } = props
  const draft = props.mode === "draft" ? props.draft : null
  const endpointId = props.mode === "existing" ? props.endpointId : null

  const [method, setMethod] = useState<"GET" | "POST">("GET")
  const [pathSuffix, setPathSuffix] = useState("")
  const [body, setBody] = useState("")
  const [queryRows, setQueryRows] = useState<PairRow[]>([])
  const [headerRows, setHeaderRows] = useState<PairRow[]>([])
  const [errors, setErrors] = useState<ConsoleErrors>({})
  const [result, setResult] = useState<TestResult | null>(null)
  const [errorCode, setErrorCode] = useState<TestConsoleErrorCode | null>(null)
  const idCounter = useRef(0)

  const mutation = useMutation<
    { result: TestResult },
    TestConsoleClientError,
    RunEndpointTestInput
  >({
    mutationFn: (input) => runEndpointTest(input),
    onSuccess: ({ result: nextResult }) => {
      setResult(nextResult)
      setErrorCode(null)
    },
    onError: (error) => {
      setResult(null)
      setErrorCode(error.code)
    },
  })

  function makeRow(): PairRow {
    idCounter.current += 1
    return { id: idCounter.current, key: "", value: "" }
  }

  function submit() {
    const pathCheck = normalizePathSuffix(pathSuffix)
    const query = rowsToRecord(queryRows)
    const headers = rowsToRecord(headerRows)
    const nextErrors: ConsoleErrors = {}
    if (!pathCheck.ok) nextErrors.path = pathCheck.reason
    const queryError = pairRowError(queryRows, "Query parameter")
    if (queryError !== null) nextErrors.query = queryError
    const headerError = pairRowError(headerRows, "Header")
    if (headerError !== null) nextErrors.headers = headerError
    if (
      method === "POST" &&
      body !== "" &&
      byteLengthUtf8(body) > MAX_CALLER_BODY_BYTES
    ) {
      nextErrors.body = "Request body must be 1 MiB or smaller."
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const request: TestRequestInput = { method }
    if (pathCheck.ok && pathCheck.path !== "") request.path = pathCheck.path
    if (Object.keys(query).length > 0) request.query = query
    if (Object.keys(headers).length > 0) request.headers = headers
    if (method === "POST" && body.trim() !== "") request.body = body

    // Draft mode reads the parent's current form values at submit time; the
    // auth object (which may contain a secret) is forwarded untouched and is
    // never stored in console state or rendered.
    const input: RunEndpointTestInput =
      draft !== null
        ? { draft: { upstreamUrl: draft().upstreamUrl.trim(), auth: draft().auth }, request }
        : { endpointId: endpointId ?? "", request }

    mutation.mutate(input)
  }

  const targetUrl = draft !== null ? displayTarget(draft().upstreamUrl, pathSuffix) : null

  return (
    <div className={cn("rounded-control border-2 border-ink bg-cream p-5", className)}>
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 text-blueprint" aria-hidden="true" />
        <h3 className="font-heading text-base font-semibold">Test upstream</h3>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted-ink">
        Sends one real request through the same hardened gateway the paid route
        uses. Nothing is charged and nothing is settled.
      </p>
      {props.mode === "existing" && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-ink">
          <ShieldCheck className="size-4 shrink-0 text-settlement-green" aria-hidden="true" />
          Uses the stored credential for this route. The secret is never shown.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
        <Field className="sm:w-44">
          <FieldTitle>Method</FieldTitle>
          <div role="group" aria-label="HTTP method" className="flex gap-2">
            {METHODS.map((candidate) => (
              <Button
                key={candidate}
                type="button"
                variant={method === candidate ? "default" : "outline"}
                aria-pressed={method === candidate}
                onClick={() => setMethod(candidate)}
                className="min-h-11 rounded-pill border-2 border-ink px-4 font-bold"
              >
                {candidate}
              </Button>
            ))}
          </div>
        </Field>
        <Field className="min-w-0 flex-1" data-invalid={Boolean(errors.path)}>
          <FieldLabel htmlFor="test-console-path">Path suffix</FieldLabel>
          <Input
            id="test-console-path"
            value={pathSuffix}
            onChange={(event) => {
              setPathSuffix(event.target.value)
              setErrors((current) => ({ ...current, path: undefined }))
            }}
            aria-invalid={Boolean(errors.path)}
            className="min-h-11 rounded-control border-2 border-ink bg-cream px-4 font-mono text-sm"
            placeholder="prices/bitcoin"
          />
          <FieldDescription>
            Segments after the /p/{"{slug}"} part. Traversal is rejected.
          </FieldDescription>
          {errors.path !== undefined && <FieldError>{errors.path}</FieldError>}
        </Field>
      </div>

      {targetUrl !== null && (
        <p className="mt-3 truncate font-mono text-xs text-muted-ink" title={targetUrl}>
          Target: {targetUrl}
        </p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <KeyValueRows
          idPrefix="test-console-query"
          rows={queryRows}
          onAdd={() => setQueryRows((current) => [...current, makeRow()])}
          onRemove={(id) => setQueryRows((current) => current.filter((row) => row.id !== id))}
          onChange={(id, patch) =>
            setQueryRows((current) =>
              current.map((row) => (row.id === id ? { ...row, ...patch } : row))
            )
          }
          keyLabel="Query"
          valueLabel="Value"
          error={errors.query}
        />
        <KeyValueRows
          idPrefix="test-console-header"
          rows={headerRows}
          onAdd={() => setHeaderRows((current) => [...current, makeRow()])}
          onRemove={(id) => setHeaderRows((current) => current.filter((row) => row.id !== id))}
          onChange={(id, patch) =>
            setHeaderRows((current) =>
              current.map((row) => (row.id === id ? { ...row, ...patch } : row))
            )
          }
          keyLabel="Header"
          valueLabel="Value"
          help="Only allowlisted headers pass — the gateway filters everything else."
          error={errors.headers}
        />
      </div>

      {method === "POST" && (
        <Field className="mt-5" data-invalid={Boolean(errors.body)}>
          <FieldLabel htmlFor="test-console-body">Request body (JSON)</FieldLabel>
          <textarea
            id="test-console-body"
            value={body}
            onChange={(event) => {
              setBody(event.target.value)
              setErrors((current) => ({ ...current, body: undefined }))
            }}
            rows={6}
            aria-invalid={Boolean(errors.body)}
            className="min-h-11 w-full rounded-control border-2 border-ink bg-cream px-4 py-3 font-mono text-sm outline-none focus-visible:shadow-focus placeholder:text-muted-ink"
            placeholder='{"amount": 1, "currency": "usd"}'
          />
          <FieldDescription>Sent with the POST request. Max 1 MiB.</FieldDescription>
          {errors.body !== undefined && <FieldError>{errors.body}</FieldError>}
        </Field>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={submit}
          disabled={mutation.isPending}
          className="min-h-11 rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover"
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : result !== null || errorCode !== null ? (
            <RefreshCw className="size-4" aria-hidden="true" />
          ) : (
            <FlaskConical className="size-4" aria-hidden="true" />
          )}
          {mutation.isPending
            ? "Testing…"
            : result !== null || errorCode !== null
              ? "Run again"
              : "Run test"}
        </Button>
      </div>

      <div aria-live="polite" className="mt-5">
        <ResultPanel result={result} errorCode={errorCode} isPending={mutation.isPending} />
      </div>
    </div>
  )
}

export { UpstreamTestConsole }
