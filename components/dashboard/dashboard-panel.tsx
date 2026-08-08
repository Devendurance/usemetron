import { cn } from "@/lib/utils"

export function DashboardPanel({
  title,
  description,
  action,
  children,
  className,
  ...props
}: React.ComponentProps<"section"> & {
  title?: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-card border border-border bg-clear-paper p-5 sm:p-6",
        className
      )}
      {...props}
    >
      {(title || description || action) && (
        <div className="mb-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-ink">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
