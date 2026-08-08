import type { LucideIcon } from "lucide-react"
import {
  BadgeCheck,
  CircleCheck,
  CircleX,
  Clock3,
  FileSignature,
  ReceiptText,
  RotateCcw,
  WifiOff,
} from "lucide-react"

import { CallLine, MetronReceipt, StatusBadge } from "@/components/metron"
import { cn } from "@/lib/utils"

type ProxyPresentationState =
  | "payment-required"
  | "verifying"
  | "settled"
  | "response"
  | "upstream-failure"
  | "facilitator-failure"
  | "invalid-signature"
  | "replayed-nonce"

type PresentationTone = "blueprint" | "verified" | "review" | "failed"

type StateDefinition = {
  label: string
  title: string
  description: string
  detail: string
  icon: LucideIcon
  tone: PresentationTone
  badge: string
  receiptStatus: string
  receiptResponse: string
}

const proxyPresentationStates: Record<ProxyPresentationState, StateDefinition> = {
  "payment-required": {
    label: "Payment required preview",
    title: "Payment required",
    description: "This call costs 0.005 USDC on Celo.",
    detail: "Product demonstration only. Payment terms are presented locally; no payment request has been made.",
    icon: ReceiptText,
    tone: "blueprint",
    badge: "Payment required preview",
    receiptStatus: "Payment required — presentation",
    receiptResponse: "Not requested in preview",
  },
  verifying: {
    label: "Verifying preview",
    title: "Verifying payment",
    description: "Payment is being verified.",
    detail: "Presentation state only. No signature, wallet, facilitator, or settlement check runs on this route.",
    icon: Clock3,
    tone: "review",
    badge: "Verification preview",
    receiptStatus: "Verification in progress — presentation",
    receiptResponse: "Not forwarded in preview",
  },
  settled: {
    label: "Settled / forwarding preview",
    title: "Settlement confirmed",
    description: "Payment settled. Forwarding the request.",
    detail: "Presentation state only. This route does not submit payment or forward an upstream request.",
    icon: BadgeCheck,
    tone: "verified",
    badge: "Settlement preview",
    receiptStatus: "Settled — presentation",
    receiptResponse: "Forwarding is not connected",
  },
  response: {
    label: "Response returned preview",
    title: "Response returned",
    description: "200 OK — response returned.",
    detail: "Creator paid — receipt available. Presentation only; no upstream response, creator payment, or receipt evidence is shown here.",
    icon: CircleCheck,
    tone: "verified",
    badge: "Response preview",
    receiptStatus: "Settled — presentation",
    receiptResponse: "200 OK — presentation",
  },
  "upstream-failure": {
    label: "Upstream failure preview",
    title: "Upstream API unavailable",
    description: "The upstream API did not respond. No successful response was recorded.",
    detail: "Settlement review in progress. This is a local presentation and does not inspect or retry an upstream service.",
    icon: CircleX,
    tone: "failed",
    badge: "Upstream failure preview",
    receiptStatus: "Settlement review — presentation",
    receiptResponse: "No successful response recorded",
  },
  "facilitator-failure": {
    label: "Facilitator unavailable preview",
    title: "Facilitator unavailable",
    description: "The payment facilitator is unavailable.",
    detail: "No payment request was sent and no upstream request was forwarded. This is a local presentation state.",
    icon: WifiOff,
    tone: "failed",
    badge: "Facilitator failure preview",
    receiptStatus: "Facilitator unavailable — presentation",
    receiptResponse: "Not forwarded in preview",
  },
  "invalid-signature": {
    label: "Invalid signature preview",
    title: "Payment signature could not be verified",
    description: "The payment authorisation is invalid.",
    detail: "No payment was submitted and no upstream request was forwarded. This is a local presentation state.",
    icon: FileSignature,
    tone: "failed",
    badge: "Invalid signature preview",
    receiptStatus: "Signature rejected — presentation",
    receiptResponse: "Not forwarded in preview",
  },
  "replayed-nonce": {
    label: "Replayed nonce preview",
    title: "Payment authorisation already used",
    description: "This payment authorisation cannot be used again.",
    detail: "No payment was submitted and no upstream request was forwarded. This is a local presentation state.",
    icon: RotateCcw,
    tone: "failed",
    badge: "Replayed nonce preview",
    receiptStatus: "Replay rejected — presentation",
    receiptResponse: "Not forwarded in preview",
  },
}

const toneStyles: Record<PresentationTone, string> = {
  blueprint: "border-blueprint/25 bg-blueprint/10 text-blueprint",
  verified: "border-settlement-green/25 bg-settlement-green/10 text-settlement-green",
  review: "border-review-bronze/25 bg-review-bronze/10 text-review-bronze",
  failed: "border-failure-red/25 bg-failure-red/10 text-failure-red",
}

const badgeVariants: Record<PresentationTone, "neutral" | "verified" | "review" | "failed"> = {
  blueprint: "neutral",
  verified: "verified",
  review: "review",
  failed: "failed",
}

type ProxyCallStateViewProps = {
  routeReference: string
  state: ProxyPresentationState
}

function ProxyCallStateView({ routeReference, state }: ProxyCallStateViewProps) {
  const definition = proxyPresentationStates[state]
  const Icon = definition.icon

  return (
    <div className="grid min-w-0 max-w-full gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-start">
      <section
        aria-labelledby="proxy-state-heading"
        className="min-w-0 max-w-full rounded-card border border-border bg-clear-paper p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-metadata text-xs font-bold tracking-[0.04em] text-muted-ink">
            LOCAL PRESENTATION
          </span>
          <StatusBadge variant={badgeVariants[definition.tone]}>
            {definition.badge}
          </StatusBadge>
        </div>

        <div className="mt-6 flex items-start gap-4">
          <span
            className={cn(
              "inline-flex size-12 shrink-0 items-center justify-center rounded-control border",
              toneStyles[definition.tone]
            )}
            aria-hidden="true"
          >
            <Icon className="size-6" />
          </span>
          <div className="min-w-0">
            <h2 id="proxy-state-heading" className="font-display text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
              {definition.title}
            </h2>
            <p className="mt-2 text-base leading-6 text-ink">{definition.description}</p>
          </div>
        </div>

        <p className="mt-6 border-l-2 border-blueprint pl-4 text-sm leading-6 text-muted-ink">
          {definition.detail}
        </p>

        <div className="mt-8 border-t border-border pt-6">
          <p className="font-metadata text-xs font-bold tracking-[0.04em] text-muted-ink">
            CALL LINE
          </p>
          <CallLine className="mt-3 min-w-0 max-w-full" />
        </div>
      </section>

      <aside aria-label="Metron Receipt presentation" className="min-w-0 max-w-full">
        <p className="mb-3 font-metadata text-xs font-bold tracking-[0.04em] text-muted-ink">
          RECEIPT ANATOMY — PREVIEW ONLY
        </p>
        <MetronReceipt
          callId="Presentation only"
          route={routeReference}
          price="0.005 USDC — product demonstration"
          network="Celo — presentation"
          status={definition.receiptStatus}
          response={definition.receiptResponse}
          creator="Not available in preview"
          transaction="Not available in preview"
          className="min-w-0 max-w-full border border-border"
        />
      </aside>
    </div>
  )
}

export { ProxyCallStateView, proxyPresentationStates }
export type { ProxyPresentationState, ProxyCallStateViewProps }
