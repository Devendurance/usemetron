import { cn } from "@/lib/utils"

/**
 * HTTP method chip. Colors follow the web palette as pure identification
 * tints (GET → blueprint route blue, POST → verified green, PUT/PATCH →
 * review bronze, DELETE → failure red, others → neutral); they are never
 * status semantics.
 */
const METHOD_TINTS: Record<string, string> = {
  get: "border-blueprint/25 bg-blueprint/10 text-blueprint",
  post: "border-settlement-green/25 bg-settlement-green/10 text-settlement-green",
  put: "border-review-bronze/25 bg-review-bronze/10 text-review-bronze",
  patch: "border-review-bronze/25 bg-review-bronze/10 text-review-bronze",
  delete: "border-failure-red/25 bg-failure-red/10 text-failure-red",
}

function MethodBadge({
  method,
  className,
}: {
  method: string
  className?: string
}) {
  const normalized = method.toLowerCase()
  return (
    <span
      data-slot="method-badge"
      className={cn(
        "inline-flex min-h-6 w-fit items-center rounded-pill border px-2.5 py-1 font-metadata text-xs font-bold leading-none tracking-[0.06em]",
        METHOD_TINTS[normalized] ??
          "border-border bg-clear-paper text-muted-ink",
        className
      )}
    >
      {method.toUpperCase()}
    </span>
  )
}

export { MethodBadge }
