import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function DashboardLink({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string
  children: React.ReactNode
  variant?: "primary" | "secondary"
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: variant === "primary" ? "default" : "outline" }),
        "min-h-11 rounded-pill border-2 border-ink px-5 font-bold text-ink focus-visible:shadow-focus",
        variant === "primary" ? "bg-lime hover:bg-lime-hover" : "bg-clear-paper",
        className
      )}
    >
      {children}
      <ArrowRight data-icon="inline-end" aria-hidden="true" />
    </Link>
  )
}
