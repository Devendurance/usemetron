import Link from "next/link"
import { ArrowRight, CircleDollarSign, ReceiptText, Route } from "lucide-react"

import { CallLine, EmptyState, MetronReceipt, StatusBadge } from "@/components/metron"
import { ConsoleCard, PageHeading, StatField } from "@/components/dashboard/dashboard-primitives"

export default function DashboardPage() {
  return (
    <div>
      <PageHeading
        eyebrow="Overview"
        title="Your payment route starts here."
        description="Publish an endpoint, set a price, and inspect each call when the payment route is connected."
        action={<Link href="/dashboard/endpoints/new" className="inline-flex min-h-12 items-center gap-2 rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none">Publish an API <ArrowRight className="size-4" aria-hidden="true" /></Link>}
      />

      <section aria-label="Payment route stats" className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatField label="Paid calls" detail="Calls will appear after a route is connected." />
        <StatField label="Settled value" detail="Settlement evidence will appear here." />
        <StatField label="Active routes" detail="Publish your first API to begin." />
      </section>

      <section className="relative mt-10 rounded-mobile-card border-2 border-ink bg-mobile-yellow p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-lime min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
        <p className="font-metadata text-xs font-bold tracking-[0.1em] uppercase">The paid route</p>
        <h2 className="mt-3 font-display text-2xl font-bold tracking-[-0.03em]">One call. One price. One settlement.</h2>
        <div className="mt-6"><CallLine /></div>
      </section>

      <section className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,.9fr)]">
        <ConsoleCard title="No activity to inspect" description="Connected routes and their settlement evidence will appear in this Console. Until then, there are no metrics or receipts to report." icon={ReceiptText}>
          <EmptyState title="Your first receipt starts with a route" description="Paste an API endpoint, set a per-request price, and publish when the integration is ready." icon={<Route aria-hidden="true" />} action={<Link href="/dashboard/endpoints/new" className="inline-flex min-h-11 items-center gap-2 rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none">Publish an API <ArrowRight className="size-4" aria-hidden="true" /></Link>} />
        </ConsoleCard>
        <MetronReceipt className="rounded-mobile-card border-2 border-ink bg-mobile-surface shadow-[6px_6px_0_#141414] min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:shadow-none" callId="—" route="—" price="—" network="Celo — unavailable" status="—" response="—" creator="—" transaction="—" />
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <ConsoleCard title="Route evidence" description="The Call Line shows the required payment sequence." icon={Route}><p className="text-sm leading-relaxed text-muted-ink">Caller, route, price, settlement, and response remain visible in each connected call.</p></ConsoleCard>
        <ConsoleCard title="Receipt anatomy" description="A receipt preserves clear fields rather than invented activity." icon={CircleDollarSign}><p className="text-sm leading-relaxed text-muted-ink">Route, price, network, status, response, creator, and transaction evidence use em dashes until supplied.</p></ConsoleCard>
        <ConsoleCard title="Status legend" description="Status color is reserved for transaction meaning."><div className="flex flex-wrap gap-2"><StatusBadge variant="verified">Verified</StatusBadge><StatusBadge variant="review">Review</StatusBadge><StatusBadge variant="failed">Failed</StatusBadge></div></ConsoleCard>
      </section>
    </div>
  )
}
