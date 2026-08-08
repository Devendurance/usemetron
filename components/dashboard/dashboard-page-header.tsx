import { cn } from "@/lib/utils"

export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        "flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <p className="mb-2 font-metadata text-xs font-bold uppercase tracking-[0.08em] text-blueprint">
            {eyebrow}
          </p>
        )}
        <h1 className="text-balance font-display text-3xl font-bold tracking-[-0.03em] text-ink sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-base leading-6 text-muted-ink">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}
