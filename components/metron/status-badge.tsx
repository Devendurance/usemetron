import { cva, type VariantProps } from "class-variance-authority"
import { Circle, CircleCheck, CircleX, Clock3 } from "lucide-react"

import { cn } from "@/lib/utils"

const statusBadgeVariants = cva(
  "inline-flex min-h-6 w-fit items-center gap-1.5 rounded-pill border px-2.5 py-1 font-metadata text-xs font-bold leading-none tracking-[0.04em] [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        verified:
          "border-settlement-green/25 bg-settlement-green/10 text-settlement-green",
        review: "border-review-bronze/25 bg-review-bronze/10 text-review-bronze",
        failed: "border-failure-red/25 bg-failure-red/10 text-failure-red",
        neutral: "border-border bg-clear-paper text-muted-ink",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

const statusIcons = {
  verified: CircleCheck,
  review: Clock3,
  failed: CircleX,
  neutral: Circle,
}

type StatusBadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof statusBadgeVariants>

function StatusBadge({
  className,
  variant = "neutral",
  children,
  ...props
}: StatusBadgeProps) {
  const Icon = statusIcons[variant ?? "neutral"]

  return (
    <span
      data-slot="status-badge"
      data-variant={variant}
      className={cn(statusBadgeVariants({ variant }), className)}
      {...props}
    >
      <Icon aria-hidden="true" />
      <span data-slot="status-badge-label">{children}</span>
    </span>
  )
}

export { StatusBadge, statusBadgeVariants }
export type { StatusBadgeProps }
