import Link from "next/link"

import { cn } from "@/lib/utils"

type CtaLinkProps = React.ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "hero"
}

function CtaLink({
  className,
  variant = "primary",
  children,
  ...props
}: CtaLinkProps) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-12 items-center justify-center rounded-pill border-2 border-ink px-7 py-3 text-center text-sm font-bold text-ink transition-colors focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none",
        variant === "primary" && "bg-lime hover:bg-lime-hover",
        variant === "hero" && "bg-hero-chartreuse hover:bg-lime-hover",
        variant === "secondary" && "bg-clear-paper hover:bg-cream",
        className
      )}
      {...props}
    >
      {children}
    </Link>
  )
}

export { CtaLink }
