"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CopyButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "children" | "onClick"
> & {
  value: string
  label: string
  copiedLabel: string
  resetDelay?: number
  onCopy?: () => void
  onCopyError?: (error: unknown) => void
}

function CopyButton({
  className,
  value,
  label,
  copiedLabel,
  resetDelay = 2000,
  onCopy,
  onCopyError,
  disabled,
  type = "button",
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false)
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  async function handleCopy() {
    if (disabled) return

    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      onCopy?.()

      if (resetTimer.current) clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setCopied(false), resetDelay)
    } catch (error) {
      setCopied(false)
      onCopyError?.(error)
    }
  }

  const currentLabel = copied ? copiedLabel : label

  return (
    <Button
      data-slot="copy-button"
      variant="outline"
      size="lg"
      type={type}
      disabled={disabled}
      aria-label={currentLabel}
      className={cn(
        "min-h-11 min-w-11 gap-2 rounded-pill border-2 border-ink bg-clear-paper px-4 font-bold text-ink transition-colors hover:bg-cream focus-visible:shadow-focus motion-reduce:transition-none",
        className
      )}
      onClick={handleCopy}
      {...props}
    >
      {copied ? (
        <Check data-icon="inline-start" aria-hidden="true" />
      ) : (
        <Copy data-icon="inline-start" aria-hidden="true" />
      )}
      <span aria-live="polite">{currentLabel}</span>
    </Button>
  )
}

export { CopyButton }
export type { CopyButtonProps }
