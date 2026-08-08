import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-5 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 shadow-[6px_6px_0_#141414] min-[600px]:rounded-none min-[600px]:border-x-0 min-[600px]:border-t-0 min-[600px]:border-b min-[600px]:border-border min-[600px]:bg-transparent min-[600px]:p-0 min-[600px]:pb-8 min-[600px]:shadow-none sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="inline-flex rounded-pill bg-mobile-purple px-2.5 py-1 font-metadata text-xs font-bold tracking-[0.1em] text-mobile-surface uppercase min-[600px]:bg-transparent min-[600px]:p-0 min-[600px]:text-blueprint">{eyebrow}</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.035em] sm:text-4xl">{title}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-ink">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function StatField({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="relative rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-16 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-magenta min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-6 min-[600px]:shadow-none min-[600px]:before:hidden">
      <p className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">{label}</p>
      <p className="mt-5 font-display text-4xl font-bold tracking-[-0.04em] tabular-nums">—</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-ink">{detail}</p>
    </div>
  )
}

function ConsoleCard({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("relative rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden", className)}>
      <div className="flex gap-4">
        {Icon && (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-control border-2 border-ink bg-mobile-yellow text-ink min-[600px]:border-0 min-[600px]:bg-coral" aria-hidden="true">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold tracking-[-0.02em]">{title}</h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-muted-ink">{description}</p>}
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

export { ConsoleCard, PageHeading, StatField }
