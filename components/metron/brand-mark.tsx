import { Waypoints } from "lucide-react"

import { cn } from "@/lib/utils"

type BrandMarkProps = React.ComponentProps<"span"> & {
  iconOnly?: boolean
}

function BrandMark({ className, iconOnly = false, ...props }: BrandMarkProps) {
  return (
    <span
      data-slot="brand-mark"
      className={cn(
        "inline-flex min-w-0 items-center gap-2 font-display text-lg font-bold tracking-[-0.03em] text-ink",
        className
      )}
      aria-label={iconOnly ? "Metron" : undefined}
      {...props}
    >
      <span
        data-slot="brand-mark-symbol"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-control border-2 border-ink bg-lime"
        aria-hidden="true"
      >
        <Waypoints />
      </span>
      {!iconOnly && <span data-slot="brand-mark-name">Metron</span>}
    </span>
  )
}

export { BrandMark }
export type { BrandMarkProps }
