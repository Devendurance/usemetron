"use client"

import { ArrowLeft, ArrowRight, FlaskConical, ShieldCheck, Wand2 } from "lucide-react"
import { useState } from "react"

import { MethodBadge } from "@/components/dashboard/openapi/method-badge"
import { UpstreamTestConsole } from "@/components/dashboard/upstream-test-console"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { parsePriceMicroUsdc } from "@/lib/endpoints/client"
import type {
  DiscoveredOperation,
  PublishAuthInput,
  PublishOperationInput,
} from "@/lib/openapi/client"

export type ConfigureItem = {
  key: string
  op: DiscoveredOperation
  upstreamUrl: string
  defaultName: string
  defaultDescription?: string
}

type RowState = {
  key: string
  name: string
  priceUsdc: string
  auth: PublishAuthInput
}

type RowErrors = {
  name?: string
  price?: string
  auth?: string
}

type AuthType = "none" | "bearer" | "apiKey"

const EMPTY_AUTH: PublishAuthInput = { type: "none" }

/** Pre-selects the auth mode suggested by the spec's security hints (secrets always start empty). */
function initialAuthFor(op: DiscoveredOperation): PublishAuthInput {
  const hint = op.securityHints[0]
  if (hint?.type === "bearer") return { type: "bearer", secret: "" }
  if (hint?.type === "apiKey") {
    return { type: "apiKey", headerName: hint.headerName ?? "X-API-Key", secret: "" }
  }
  return EMPTY_AUTH
}

function AuthPicker({
  idPrefix,
  auth,
  onChange,
  error,
  disabled = false,
}: {
  idPrefix: string
  auth: PublishAuthInput
  onChange: (auth: PublishAuthInput) => void
  error?: string
  disabled?: boolean
}) {
  const options: Array<{ value: AuthType; label: string }> = [
    { value: "none", label: "None" },
    { value: "bearer", label: "Bearer token" },
    { value: "apiKey", label: "API key" },
  ]

  function changeType(next: AuthType) {
    if (next === "none") onChange({ type: "none" })
    else if (next === "bearer") onChange({ type: "bearer", secret: "" })
    else onChange({ type: "apiKey", headerName: "X-API-Key", secret: "" })
  }

  return (
    <Field data-invalid={error !== undefined}>
      <FieldLabel htmlFor={`${idPrefix}-auth-type`}>Upstream authentication</FieldLabel>
      <div role="group" aria-label="Upstream authentication type" className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={auth.type === option.value ? "default" : "outline"}
            disabled={disabled}
            onClick={() => changeType(option.value)}
            aria-pressed={auth.type === option.value}
            className="min-h-10 rounded-pill border-2 border-ink px-4 font-bold"
          >
            {option.label}
          </Button>
        ))}
      </div>

      {auth.type === "bearer" && (
        <div className="mt-4 w-full">
          <Input
            id={`${idPrefix}-bearer-secret`}
            type="password"
            autoComplete="off"
            value={auth.secret}
            disabled={disabled}
            onChange={(event) => onChange({ type: "bearer", secret: event.target.value })}
            aria-invalid={error !== undefined}
            aria-describedby={error !== undefined ? `${idPrefix}-auth-error` : `${idPrefix}-auth-help`}
            className="min-h-11 rounded-control border-2 border-ink bg-cream px-4"
            placeholder="Bearer token"
          />
          <FieldDescription id={`${idPrefix}-auth-help`}>
            Sent as an <span className="font-mono text-xs">Authorization: Bearer</span> header.
          </FieldDescription>
        </div>
      )}

      {auth.type === "apiKey" && (
        <div className="mt-4 grid w-full gap-4">
          <div>
            <Input
              id={`${idPrefix}-api-header`}
              value={auth.headerName}
              disabled={disabled}
              onChange={(event) =>
                onChange({ type: "apiKey", headerName: event.target.value, secret: auth.secret })
              }
              aria-invalid={error !== undefined}
              aria-describedby={error !== undefined ? `${idPrefix}-auth-error` : `${idPrefix}-auth-help`}
              className="min-h-11 rounded-control border-2 border-ink bg-cream px-4"
              placeholder="X-API-Key"
            />
          </div>
          <div>
            <Input
              id={`${idPrefix}-api-secret`}
              type="password"
              autoComplete="off"
              value={auth.secret}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  type: "apiKey",
                  headerName: auth.headerName,
                  secret: event.target.value,
                })
              }
              aria-invalid={error !== undefined}
              aria-describedby={error !== undefined ? `${idPrefix}-auth-error` : `${idPrefix}-auth-help`}
              className="min-h-11 rounded-control border-2 border-ink bg-cream px-4"
              placeholder="API key value"
            />
          </div>
          <FieldDescription id={`${idPrefix}-auth-help`}>
            Sent in your custom header. Never shown after publishing.
          </FieldDescription>
        </div>
      )}

      {error !== undefined && <FieldError id={`${idPrefix}-auth-error`}>{error}</FieldError>}
    </Field>
  )
}

function ImportConfigure({
  items,
  onBack,
  onProceed,
}: {
  items: ConfigureItem[]
  onBack: () => void
  onProceed: (payload: PublishOperationInput[]) => void
}) {
  const [batchPrice, setBatchPrice] = useState("")
  const [batchAuth, setBatchAuth] = useState<PublishAuthInput>(EMPTY_AUTH)
  const [batchErrors, setBatchErrors] = useState<{ price?: string; auth?: string }>({})
  const [rows, setRows] = useState<RowState[]>(() =>
    items.map((item) => ({
      key: item.key,
      name: item.defaultName,
      priceUsdc: "",
      auth: initialAuthFor(item.op),
    }))
  )
  const [rowErrors, setRowErrors] = useState<Record<string, RowErrors>>({})
  const [testOpen, setTestOpen] = useState<Record<string, boolean>>({})

  function updateRow(key: string, patch: Partial<RowState>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
    setRowErrors((current) => ({ ...current, [key]: {} }))
  }

  function applyBatch() {
    const errors: { price?: string; auth?: string } = {}
    const micros = parsePriceMicroUsdc(batchPrice)
    if (micros === null || micros <= 0) {
      errors.price = "Enter a batch price greater than zero."
    }
    const authError = authErrorFor(batchAuth)
    if (authError !== null) errors.auth = authError
    setBatchErrors(errors)
    if (Object.keys(errors).length > 0) return

    setRows((current) =>
      current.map((row) => ({
        ...row,
        priceUsdc: batchPrice.trim(),
        auth: { ...batchAuth },
      }))
    )
    setRowErrors({})
  }

  function validateRows(): boolean {
    const next: Record<string, RowErrors> = {}
    for (const row of rows) {
      const errors: RowErrors = {}
      if (row.name.trim() === "") errors.name = "Enter a route name."
      if (row.name.trim().length > 120) errors.name = "Keep the route name under 120 characters."
      const micros = parsePriceMicroUsdc(row.priceUsdc)
      if (micros === null || micros <= 0) {
        errors.price = "Enter a price greater than zero (minimum 0.001 USDC)."
      }
      const authError = authErrorFor(row.auth)
      if (authError !== null) errors.auth = authError
      if (Object.keys(errors).length > 0) next[row.key] = errors
    }
    setRowErrors(next)
    return Object.keys(next).length === 0
  }

  function proceed() {
    if (!validateRows()) return
    onProceed(
      rows.map((row) => {
        const item = items.find((candidate) => candidate.key === row.key)
        return {
          key: row.key,
          name: row.name.trim(),
          ...(item?.defaultDescription !== undefined
            ? { description: item.defaultDescription }
            : {}),
          upstreamUrl: item?.upstreamUrl ?? "",
          priceUsdc: row.priceUsdc.trim(),
          ...(row.auth.type !== "none" ? { auth: row.auth } : {}),
        }
      })
    )
  }

  const usesAuth = rows.some((row) => row.auth.type !== "none")

  return (
    <section className="relative mt-10 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      <h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">
        Configure {items.length} route{items.length === 1 ? "" : "s"}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-ink">
        Set a batch price and auth for everything, then adjust any route individually.
      </p>

      <div className="mt-6 rounded-control border border-border bg-cream p-5">
        <div className="flex items-center gap-2">
          <Wand2 className="size-4 text-blueprint" aria-hidden="true" />
          <h3 className="font-heading text-base font-semibold">Apply to all</h3>
        </div>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <Field data-invalid={batchErrors.price !== undefined}>
            <FieldLabel htmlFor="batch-price">Flat price per request (USDC)</FieldLabel>
            <Input
              id="batch-price"
              inputMode="decimal"
              value={batchPrice}
              onChange={(event) => {
                setBatchPrice(event.target.value)
                setBatchErrors((current) => ({ ...current, price: undefined }))
              }}
              aria-invalid={batchErrors.price !== undefined}
              aria-describedby={batchErrors.price !== undefined ? "batch-price-error" : "batch-price-help"}
              className="min-h-11 rounded-control border-2 border-ink bg-cream px-4"
              placeholder="0.005"
            />
            <FieldDescription id="batch-price-help">
              Minimum 0.001 USDC, up to 6 decimal places. Applies to every route until overridden.
            </FieldDescription>
            {batchErrors.price !== undefined && (
              <FieldError id="batch-price-error">{batchErrors.price}</FieldError>
            )}
          </Field>

          <div>
            <AuthPicker
              idPrefix="batch"
              auth={batchAuth}
              onChange={(auth) => {
                setBatchAuth(auth)
                setBatchErrors((current) => ({ ...current, auth: undefined }))
              }}
              error={batchErrors.auth}
            />
            {batchAuth.type !== "none" && (
              <p className="mt-2 text-xs text-muted-ink">
                Applying auth replaces each selected route&apos;s current auth value.
              </p>
            )}
          </div>
        </div>
        <Button
          type="button"
          onClick={applyBatch}
          className="mt-5 min-h-11 rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover"
        >
          <Wand2 className="size-4" aria-hidden="true" />
          Apply to all {items.length} route{items.length === 1 ? "" : "s"}
        </Button>
        <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-ink">
          <ShieldCheck className="size-4 shrink-0 text-settlement-green" aria-hidden="true" />
          Secrets are stored encrypted and are never shown again after publishing.
        </p>
      </div>

      <ul className="mt-8 space-y-6">
        {rows.map((row, index) => {
          const item = items.find((candidate) => candidate.key === row.key)
          const errors = rowErrors[row.key] ?? {}
          const insecureUpstream = (item?.upstreamUrl ?? "").startsWith("http://")
          const idPrefix = `row-${index}-${row.key.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`
          return (
            <li
              key={row.key}
              className="rounded-control border-2 border-border bg-clear-paper p-5 data-[invalid=true]:border-failure-red/40"
              data-invalid={Object.keys(errors).length > 0}
            >
              <div className="flex flex-wrap items-center gap-3">
                <MethodBadge method={item?.op.method ?? ""} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={item?.op.path}>
                  {item?.op.path}
                </span>
              </div>
              <div className="mt-2 break-all font-mono text-xs text-muted-ink">
                {item?.upstreamUrl}
              </div>
              {item?.op.callerPathTemplate !== null && (
                <div className="mt-1 break-all font-mono text-xs text-review-bronze">
                  Caller path: {item?.op.callerPathTemplate}
                </div>
              )}
              {insecureUpstream && (
                <p className="mt-2 rounded-control border border-review-bronze/30 bg-review-bronze/10 px-3 py-2 text-xs text-review-bronze">
                  Plain http upstream — may be rejected at publish in production.
                </p>
              )}

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <Field data-invalid={errors.name !== undefined}>
                  <FieldLabel htmlFor={`${idPrefix}-name`}>Route name</FieldLabel>
                  <Input
                    id={`${idPrefix}-name`}
                    value={row.name}
                    onChange={(event) => updateRow(row.key, { name: event.target.value })}
                    aria-invalid={errors.name !== undefined}
                    aria-describedby={errors.name !== undefined ? `${idPrefix}-name-error` : undefined}
                    className="min-h-11 rounded-control border-2 border-ink bg-cream px-4"
                    placeholder="For example, prices.v1"
                  />
                  {errors.name !== undefined && (
                    <FieldError id={`${idPrefix}-name-error`}>{errors.name}</FieldError>
                  )}
                </Field>

                <Field data-invalid={errors.price !== undefined}>
                  <FieldLabel htmlFor={`${idPrefix}-price`}>Price per request (USDC)</FieldLabel>
                  <Input
                    id={`${idPrefix}-price`}
                    inputMode="decimal"
                    value={row.priceUsdc}
                    onChange={(event) => updateRow(row.key, { priceUsdc: event.target.value })}
                    aria-invalid={errors.price !== undefined}
                    aria-describedby={errors.price !== undefined ? `${idPrefix}-price-error` : undefined}
                    className="min-h-11 rounded-control border-2 border-ink bg-cream px-4"
                    placeholder="0.005"
                  />
                  {errors.price !== undefined && (
                    <FieldError id={`${idPrefix}-price-error`}>{errors.price}</FieldError>
                  )}
                </Field>
              </div>

              <div className="mt-5">
                <AuthPicker
                  idPrefix={idPrefix}
                  auth={row.auth}
                  onChange={(auth) => updateRow(row.key, { auth })}
                  error={errors.auth}
                />
              </div>

              <div className="mt-5 flex flex-col gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setTestOpen((current) => ({ ...current, [row.key]: !current[row.key] }))
                  }
                  aria-expanded={Boolean(testOpen[row.key])}
                  className="w-fit min-h-10 rounded-pill border-2 border-ink bg-clear-paper px-4 font-bold text-ink hover:bg-cream"
                >
                  <FlaskConical className="size-4" aria-hidden="true" />
                  {testOpen[row.key] ? "Hide test console" : "Test upstream"}
                </Button>
                {testOpen[row.key] && (
                  <UpstreamTestConsole
                    mode="draft"
                    draft={() => ({ upstreamUrl: item?.upstreamUrl ?? "", auth: row.auth })}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="min-h-11 rounded-pill border-2 border-ink bg-clear-paper px-5 font-bold text-ink hover:bg-cream"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to review
        </Button>
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            onClick={proceed}
            className="min-h-12 rounded-pill border-2 border-ink bg-lime px-6 font-bold text-ink hover:bg-lime-hover"
          >
            Review &amp; publish {rows.length} route{rows.length === 1 ? "" : "s"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
          {usesAuth && (
            <p className="flex items-center gap-1.5 text-xs text-muted-ink">
              <ShieldCheck className="size-3.5 shrink-0 text-settlement-green" aria-hidden="true" />
              Secrets are stored encrypted and never shown after publishing.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function authErrorFor(auth: PublishAuthInput): string | null {
  if (auth.type === "bearer" && auth.secret.trim() === "") {
    return "Enter the bearer token to send to your upstream."
  }
  if (auth.type === "apiKey") {
    if (auth.headerName.trim() === "") return "Enter the header name to send your key in."
    if (auth.secret.trim() === "") return "Enter the API key value."
  }
  return null
}

export { ImportConfigure }
