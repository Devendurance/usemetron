import type { LucideIcon } from "lucide-react"
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Braces,
  CircleDollarSign,
  Route,
  UserRound,
} from "lucide-react"

import { cn } from "@/lib/utils"

type CallLineItem = {
  label: string
  icon?: LucideIcon
}

type CallLineOrientation = "responsive" | "horizontal" | "stacked"

type CallLineProps = Omit<React.ComponentProps<"ol">, "children"> & {
  items?: readonly CallLineItem[]
  orientation?: CallLineOrientation
}

const defaultCallLineItems: readonly CallLineItem[] = [
  { label: "Caller", icon: UserRound },
  { label: "Route", icon: Route },
  { label: "Price", icon: CircleDollarSign },
  { label: "Settled", icon: BadgeCheck },
  { label: "Response", icon: Braces },
]

function CallLine({
  className,
  items = defaultCallLineItems,
  orientation = "responsive",
  ...props
}: CallLineProps) {
  return (
    <ol
      data-slot="call-line"
      data-orientation={orientation}
      className={cn(
        "flex w-full min-w-0 list-none gap-2 p-0",
        orientation === "responsive" &&
          "flex-col min-[600px]:flex-row min-[600px]:items-center",
        orientation === "horizontal" && "flex-row items-center",
        orientation === "stacked" && "flex-col",
        className
      )}
      {...props}
    >
      {items.map((item, index) => {
        const Icon = item.icon
        const isLast = index === items.length - 1

        return (
          <li
            key={`${item.label}-${index}`}
            data-slot="call-line-item"
            className={cn(
              "flex min-w-0 items-center gap-2",
              orientation === "responsive" &&
                "flex-col min-[600px]:flex-1 min-[600px]:flex-row",
              orientation === "horizontal" && "flex-1 flex-row",
              orientation === "stacked" && "flex-col"
            )}
          >
            <span className="inline-flex min-h-11 w-full min-w-0 flex-1 items-center justify-center gap-2 rounded-pill border border-border bg-clear-paper px-3 font-metadata text-xs font-bold tracking-[0.04em] text-ink">
              {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
              <span className="truncate">{item.label}</span>
            </span>
            {!isLast && (
              <span
                data-slot="call-line-connector"
                className="inline-flex shrink-0 items-center justify-center text-blueprint"
                aria-hidden="true"
              >
                {orientation === "stacked" && <ArrowDown className="size-4" />}
                {orientation === "horizontal" && <ArrowRight className="size-4" />}
                {orientation === "responsive" && (
                  <>
                    <ArrowDown className="size-4 min-[600px]:hidden" />
                    <ArrowRight className="hidden size-4 min-[600px]:block" />
                  </>
                )}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export { CallLine, defaultCallLineItems }
export type { CallLineItem, CallLineOrientation, CallLineProps }
