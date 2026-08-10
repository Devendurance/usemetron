import { cn } from "@/lib/utils"

type MetronWordmarkProps = React.ComponentProps<"span"> & {
  compact?: boolean
}

function MetronWordmark({
  className,
  compact = false,
  ...props
}: MetronWordmarkProps) {
  return (
    <span
      data-slot="metron-wordmark"
      role="img"
      aria-label="Metron"
      className={cn(
        "inline-flex min-w-0 items-baseline whitespace-nowrap font-display font-bold leading-none text-ink",
        compact
          ? "text-[11px] tracking-[-0.08em]"
          : "text-lg tracking-[-0.055em]",
        className
      )}
      {...props}
    >
      <span
        data-slot="metron-wordmark-letter-m"
        aria-hidden="true"
        className="text-lime [-webkit-text-stroke:1px_#141414]"
      >
        M
      </span>
      <span data-slot="metron-wordmark-letters" aria-hidden="true">
        ETRON
      </span>
    </span>
  )
}

export { MetronWordmark }
export type { MetronWordmarkProps }
