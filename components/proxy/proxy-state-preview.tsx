"use client"

import { CircleAlert } from "lucide-react"
import { useId, useState } from "react"

import {
  ProxyCallStateView,
  proxyPresentationStates,
  type ProxyPresentationState,
} from "./proxy-call-state-view"

type ProxyStatePreviewProps = {
  routeReference: string
}

const stateOrder: readonly ProxyPresentationState[] = [
  "payment-required",
  "verifying",
  "settled",
  "response",
  "upstream-failure",
  "facilitator-failure",
  "invalid-signature",
  "replayed-nonce",
]

function ProxyStatePreview({ routeReference }: ProxyStatePreviewProps) {
  const [state, setState] = useState<ProxyPresentationState>("payment-required")
  const stateViewId = useId()

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-12 lg:px-12">
      <header className="max-w-3xl">
        <p className="font-metadata text-xs font-bold tracking-[0.04em] text-blueprint">
          METRON PAID ROUTE — PRESENTATION PREVIEW
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
          Call state preview
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-ink">
          This frontend-only surface shows how a paid call can be explained. It does not request payment, connect a wallet, fetch an API, store data, or produce settlement evidence.
        </p>
        <p className="mt-4 break-all rounded-control border border-blueprint/25 bg-blueprint/10 px-4 py-3 font-mono text-sm text-ink">
          Non-live route reference: {routeReference}
        </p>
      </header>

      <section className="mt-8" aria-labelledby="presentation-selector-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="presentation-selector-heading" className="font-display text-xl font-semibold">
            Choose a presentation state
          </h2>
          <p className="text-sm text-muted-ink">Changes only this local preview.</p>
        </div>
        <div
          role="group"
          className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
          aria-labelledby="presentation-selector-heading"
        >
          {stateOrder.map((item) => {
            const isSelected = state === item
            const definition = proxyPresentationStates[item]

            return (
              <button
                key={item}
                id={`${stateViewId}-${item}-tab`}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setState(item)}
                className={cn(
                  "min-h-11 rounded-pill border px-4 py-2 text-left text-sm font-bold leading-5 transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-blueprint/25",
                  isSelected
                    ? "border-ink bg-lime text-ink"
                    : "border-border bg-clear-paper text-ink hover:bg-cream"
                )}
              >
                {definition.label}
              </button>
            )
          })}
        </div>
      </section>

      <div
        id={`${stateViewId}-panel`}
        aria-live="polite"
        className="mt-6"
      >
        <ProxyCallStateView routeReference={routeReference} state={state} />
      </div>

      <footer className="mt-8 rounded-card bg-coral p-6 sm:p-8">
        <div className="flex gap-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-display text-xl font-semibold">Future integration boundary</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-ink">
              A future proxy integration can supply verified payment, facilitator, upstream, and receipt data to this state view. Until then, this page remains presentation-only and never represents a real transaction or API response.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

export { ProxyStatePreview }
export type { ProxyStatePreviewProps }
