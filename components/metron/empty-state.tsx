import { CircleDashed } from "lucide-react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  type EmptyTitleLevel,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

type EmptyStateProps = Omit<React.ComponentProps<typeof Empty>, "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  titleLevel?: EmptyTitleLevel
}

function EmptyState({
  className,
  title,
  description,
  icon,
  action,
  titleLevel = 2,
  ...props
}: EmptyStateProps) {
  return (
    <Empty
      data-slot="metron-empty-state"
      className={cn(
        "min-h-64 rounded-card border border-dashed border-border bg-clear-paper p-8",
        className
      )}
      {...props}
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="size-11 rounded-control bg-coral text-ink [&_svg]:size-5"
        >
          {icon ?? <CircleDashed aria-hidden="true" />}
        </EmptyMedia>
        <EmptyTitle
          level={titleLevel}
          className="font-display text-xl font-semibold text-ink"
        >
          {title}
        </EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

export { EmptyState }
export type { EmptyStateProps }
