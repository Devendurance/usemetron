"use client"

import { AlertCircle, Loader2, Send, ShieldCheck } from "lucide-react"
import { FormEvent, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  EndpointClientError,
  createEndpoint,
  endpointErrorMessage,
  parsePriceMicroUsdc,
  parseUpstreamUrl,
  type CreateEndpointInput,
  type EndpointAuthInput,
} from "@/lib/endpoints/client"

type AuthType = "none" | "bearer" | "apiKey"

type FormValues = {
  name: string
  description: string
  upstreamUrl: string
  price: string
  bearerSecret: string
  apiHeaderName: string
  apiSecret: string
}

type FormErrors = Partial<Record<keyof FormValues, string>>

const EMPTY_VALUES: FormValues = {
  name: "",
  description: "",
  upstreamUrl: "",
  price: "",
  bearerSecret: "",
  apiHeaderName: "",
  apiSecret: "",
}

function PublishForm() {
  const router = useRouter()
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES)
  const [authType, setAuthType] = useState<AuthType>("none")
  const [errors, setErrors] = useState<FormErrors>({})
  const [serverMessage, setServerMessage] = useState<string | null>(null)

  function update(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setServerMessage(null)
  }

  function changeAuthType(next: AuthType) {
    setAuthType(next)
    setErrors((current) => ({
      ...current,
      bearerSecret: undefined,
      apiHeaderName: undefined,
      apiSecret: undefined,
    }))
    setServerMessage(null)
  }

  function validate(): FormErrors {
    const next: FormErrors = {}
    if (!values.name.trim()) next.name = "Enter a name for this endpoint."
    if (!parseUpstreamUrl(values.upstreamUrl)) {
      next.upstreamUrl = "Enter a valid HTTP or HTTPS upstream URL."
    }
    const micros = parsePriceMicroUsdc(values.price)
    if (micros === null || micros <= 0) {
      next.price = "Enter a price greater than zero."
    }
    if (authType === "bearer" && !values.bearerSecret.trim()) {
      next.bearerSecret = "Enter the bearer token to send to your upstream."
    }
    if (authType === "apiKey") {
      if (!values.apiHeaderName.trim()) {
        next.apiHeaderName = "Enter the header name to send your key in."
      }
      if (!values.apiSecret.trim()) {
        next.apiSecret = "Enter the API key value."
      }
    }
    return next
  }

  const mutation = useMutation({
    mutationFn: (input: CreateEndpointInput) => createEndpoint(input),
    onSuccess: ({ endpoint }) => {
      // Never re-render the typed secret after save: clear secrets (and
      // everything else) from local state before navigating away.
      setValues(EMPTY_VALUES)
      setErrors({})
      setServerMessage(null)
      router.push(`/dashboard/endpoints/${endpoint.id}`)
    },
    onError: (error: unknown) => {
      if (!(error instanceof EndpointClientError)) {
        setServerMessage(endpointErrorMessage("INTERNAL_ERROR"))
        return
      }
      setServerMessage(endpointErrorMessage(error.code))
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    setServerMessage(null)
    if (Object.keys(nextErrors).length > 0) return

    let auth: EndpointAuthInput = { type: "none" }
    if (authType === "bearer") {
      auth = { type: "bearer", secret: values.bearerSecret.trim() }
    } else if (authType === "apiKey") {
      auth = {
        type: "apiKey",
        headerName: values.apiHeaderName.trim(),
        secret: values.apiSecret.trim(),
      }
    }

    mutation.mutate({
      name: values.name.trim(),
      description: values.description.trim() || undefined,
      upstreamUrl: values.upstreamUrl.trim(),
      priceUsdc: values.price.trim(),
      auth,
    })
  }

  const authOptions: Array<{ value: AuthType; label: string }> = [
    { value: "none", label: "None" },
    { value: "bearer", label: "Bearer token" },
    { value: "apiKey", label: "API key" },
  ]

  return (
    <form noValidate onSubmit={submit} className="relative mt-10 grid gap-6 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-magenta min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      {serverMessage && (
        <Alert className="border-failure-red/30 bg-failure-red/10 text-ink">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Could not publish this endpoint</AlertTitle>
          <AlertDescription className="text-muted-ink">{serverMessage}</AlertDescription>
        </Alert>
      )}

      <p id="publish-required-help" className="text-sm font-medium text-ink">Required fields are marked with <span aria-hidden="true">*</span><span className="sr-only"> an asterisk</span>.</p>

      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="endpoint-name">Endpoint name <span aria-hidden="true">*</span><span className="sr-only"> required</span></FieldLabel>
          <Input id="endpoint-name" required value={values.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(errors.name)} aria-required="true" aria-describedby={errors.name ? "endpoint-name-error publish-required-help" : "endpoint-name-help publish-required-help"} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="For example, translate.v1" />
          <FieldDescription id="endpoint-name-help">Use a recognisable capability name that callers can find.</FieldDescription>
          {errors.name && <FieldError id="endpoint-name-error">{errors.name}</FieldError>}
        </Field>

        <Field data-invalid={Boolean(errors.description)}>
          <FieldLabel htmlFor="endpoint-description">Description</FieldLabel>
          <textarea id="endpoint-description" value={values.description} onChange={(event) => update("description", event.target.value)} aria-describedby={errors.description ? "endpoint-description-error" : "endpoint-description-help"} className="min-h-11 w-full rounded-control border-2 border-ink bg-cream px-4 py-3 text-base outline-none focus-visible:shadow-focus placeholder:text-muted-ink md:text-sm" placeholder="What does this endpoint do?" rows={3} />
          <FieldDescription id="endpoint-description-help">Optional. Shown on the endpoint detail page to your callers.</FieldDescription>
        </Field>

        <Field data-invalid={Boolean(errors.upstreamUrl)}>
          <FieldLabel htmlFor="upstream-url">Upstream URL <span aria-hidden="true">*</span><span className="sr-only"> required</span></FieldLabel>
          <Input id="upstream-url" required type="url" value={values.upstreamUrl} onChange={(event) => update("upstreamUrl", event.target.value)} aria-invalid={Boolean(errors.upstreamUrl)} aria-required="true" aria-describedby={errors.upstreamUrl ? "upstream-url-error publish-required-help" : "upstream-url-help publish-required-help"} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="https://api.example.com/route" />
          <FieldDescription id="upstream-url-help">This is the API Metron will forward a verified call to.</FieldDescription>
          {errors.upstreamUrl && <FieldError id="upstream-url-error">{errors.upstreamUrl}</FieldError>}
        </Field>

        <Field data-invalid={Boolean(errors.price)}>
          <FieldLabel htmlFor="per-request-price">Flat price per request <span aria-hidden="true">*</span><span className="sr-only"> required</span></FieldLabel>
          <Input id="per-request-price" required inputMode="decimal" value={values.price} onChange={(event) => update("price", event.target.value)} aria-invalid={Boolean(errors.price)} aria-required="true" aria-describedby={errors.price ? "per-request-price-error publish-required-help" : "per-request-price-help publish-required-help"} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="0.005" />
          <FieldDescription id="per-request-price-help">Set a flat price in USDC for each call. Minimum 0.001 USDC.</FieldDescription>
          {errors.price && <FieldError id="per-request-price-error">{errors.price}</FieldError>}
        </Field>

        <Field data-invalid={Boolean(errors.bearerSecret || errors.apiHeaderName || errors.apiSecret)}>
          <FieldLabel htmlFor="upstream-auth">Upstream authentication</FieldLabel>
          <div role="group" aria-label="Upstream authentication type" className="flex flex-wrap gap-2">
            {authOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={authType === option.value ? "default" : "outline"}
                className="min-h-11 rounded-pill border-2 border-ink px-4 font-bold"
                onClick={() => changeAuthType(option.value)}
                aria-pressed={authType === option.value}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {authType === "bearer" && (
            <div className="mt-4 w-full">
              <Input id="bearer-secret" type="password" autoComplete="off" value={values.bearerSecret} onChange={(event) => update("bearerSecret", event.target.value)} aria-invalid={Boolean(errors.bearerSecret)} aria-describedby={errors.bearerSecret ? "bearer-secret-error" : "bearer-secret-help"} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="Bearer token" />
              <FieldDescription id="bearer-secret-help">Sent as an <span className="font-mono text-xs">Authorization: Bearer</span> header. Never shown after saving.</FieldDescription>
              {errors.bearerSecret && <FieldError id="bearer-secret-error">{errors.bearerSecret}</FieldError>}
            </div>
          )}

          {authType === "apiKey" && (
            <div className="mt-4 grid w-full gap-4">
              <div>
                <Input id="api-header-name" value={values.apiHeaderName} onChange={(event) => update("apiHeaderName", event.target.value)} aria-invalid={Boolean(errors.apiHeaderName)} aria-describedby={errors.apiHeaderName ? "api-header-name-error" : "api-header-name-help"} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="X-API-Key" />
                <FieldDescription id="api-header-name-help">Protocol-reserved names like Host, Cookie, and PAYMENT-REQUIRED are blocked.</FieldDescription>
                {errors.apiHeaderName && <FieldError id="api-header-name-error">{errors.apiHeaderName}</FieldError>}
              </div>
              <div>
                <Input id="api-secret" type="password" autoComplete="off" value={values.apiSecret} onChange={(event) => update("apiSecret", event.target.value)} aria-invalid={Boolean(errors.apiSecret)} aria-describedby={errors.apiSecret ? "api-secret-error" : "api-secret-help"} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="API key value" />
                <FieldDescription id="api-secret-help">Sent in your custom header. Never shown after saving.</FieldDescription>
                {errors.apiSecret && <FieldError id="api-secret-error">{errors.apiSecret}</FieldError>}
              </div>
            </div>
          )}

          {authType !== "none" && <FieldDescription className="mt-3 flex items-center gap-1.5"><ShieldCheck className="size-4" aria-hidden="true" />Stored encrypted and only used by Metron when forwarding calls.</FieldDescription>}
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={mutation.isPending} className="min-h-12 w-full rounded-pill border-2 border-ink bg-lime px-6 font-bold text-ink hover:bg-lime-hover sm:w-fit">
        {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        {mutation.isPending ? "Publishing…" : "Publish endpoint"}
      </Button>
    </form>
  )
}

export { PublishForm }
