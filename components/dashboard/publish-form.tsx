"use client"

import { AlertCircle, Info, Send } from "lucide-react"
import { FormEvent, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type FormValues = { name: string; upstreamUrl: string; price: string }
type FormErrors = Partial<Record<keyof FormValues, string>>

function PublishForm() {
  const [values, setValues] = useState<FormValues>({ name: "", upstreamUrl: "", price: "" })
  const [errors, setErrors] = useState<FormErrors>({})
  const [attempted, setAttempted] = useState(false)

  function update(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function validate() {
    const next: FormErrors = {}
    if (!values.name.trim()) next.name = "Enter a name for this endpoint."
    try {
      if (!values.upstreamUrl.trim()) throw new Error()
      const url = new URL(values.upstreamUrl)
      if (!["http:", "https:"].includes(url.protocol)) throw new Error()
    } catch {
      next.upstreamUrl = "Enter a valid HTTP or HTTPS upstream URL."
    }
    const price = Number(values.price)
    if (!values.price || !Number.isFinite(price) || price <= 0) next.price = "Enter a price greater than zero."
    return next
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    setErrors(validate())
  }

  const hasErrors = Object.keys(errors).length > 0

  return (
    <form noValidate onSubmit={submit} className="relative mt-10 grid gap-6 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-magenta min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      <Alert className="border-blueprint/25 bg-blueprint/10 text-ink">
        <Info aria-hidden="true" />
        <AlertTitle>Publishing integration is unavailable</AlertTitle>
        <AlertDescription className="text-muted-ink">Validate the route details locally. This Console will not publish, generate a powered URL, or create a route record.</AlertDescription>
      </Alert>

      <p id="publish-required-help" className="text-sm font-medium text-ink">All fields are required. Required fields are marked with <span aria-hidden="true">*</span><span className="sr-only"> an asterisk</span>.</p>

      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="endpoint-name">Endpoint name <span aria-hidden="true">*</span><span className="sr-only"> required</span></FieldLabel>
          <Input id="endpoint-name" required value={values.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(errors.name)} aria-required="true" aria-describedby={errors.name ? "endpoint-name-error publish-required-help" : "endpoint-name-help publish-required-help"} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="For example, translate.v1" />
          <FieldDescription id="endpoint-name-help">Use a recognisable capability name. It is kept only in this form.</FieldDescription>
          {errors.name && <FieldError id="endpoint-name-error">{errors.name}</FieldError>}
        </Field>

        <Field data-invalid={Boolean(errors.upstreamUrl)}>
          <FieldLabel htmlFor="upstream-url">Upstream URL <span aria-hidden="true">*</span><span className="sr-only"> required</span></FieldLabel>
          <Input id="upstream-url" required type="url" value={values.upstreamUrl} onChange={(event) => update("upstreamUrl", event.target.value)} aria-invalid={Boolean(errors.upstreamUrl)} aria-required="true" aria-describedby={errors.upstreamUrl ? "upstream-url-error publish-required-help" : "upstream-url-help publish-required-help"} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="https://api.example.com/route" />
          <FieldDescription id="upstream-url-help">This is the API Metron would forward a verified call to.</FieldDescription>
          {errors.upstreamUrl && <FieldError id="upstream-url-error">{errors.upstreamUrl}</FieldError>}
        </Field>

        <Field data-invalid={Boolean(errors.price)}>
          <FieldLabel htmlFor="per-request-price">Flat price per request <span aria-hidden="true">*</span><span className="sr-only"> required</span></FieldLabel>
          <Input id="per-request-price" required inputMode="decimal" value={values.price} onChange={(event) => update("price", event.target.value)} aria-invalid={Boolean(errors.price)} aria-required="true" aria-describedby={errors.price ? "per-request-price-error publish-required-help" : "per-request-price-help publish-required-help"} className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="0.005" />
          <FieldDescription id="per-request-price-help">Enter the amount in the configured stablecoin — asset setup is not connected.</FieldDescription>
          {errors.price && <FieldError id="per-request-price-error">{errors.price}</FieldError>}
        </Field>
      </FieldGroup>

      {attempted && !hasErrors && (
        <Alert className="border-review-bronze/30 bg-review-bronze/10 text-ink">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Details are valid locally</AlertTitle>
          <AlertDescription className="text-muted-ink">Submission remains unavailable until the publishing integration is connected.</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="min-h-12 w-full rounded-pill border-2 border-ink bg-lime px-6 font-bold text-ink hover:bg-lime-hover sm:w-fit">
        <Send className="size-4" aria-hidden="true" />
        Validate publishing details
      </Button>
    </form>
  )
}

export { PublishForm }
