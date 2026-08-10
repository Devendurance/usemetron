import Link from "next/link"
import { ArrowRight, CircleDollarSign, Route } from "lucide-react"

import { CallLine, StatusBadge } from "@/components/metron"
import { EarningsOverview } from "@/components/dashboard/earnings-overview"
import { ProductSummary } from "@/components/dashboard/product-summary"
import { LatestCallEvidence, RecentTransactions } from "@/components/dashboard/recent-transactions"
import { ConsoleCard, PageHeading } from "@/components/dashboard/dashboard-primitives"

export default function DashboardPage() {
  return (
    <div>
      <PageHeading
        eyebrow="Overview"
        title="Your payment route starts here."
        description="Publish an endpoint, set a price, and inspect each call when the payment route is connected."
        action={<Link href="/dashboard/endpoints/new" className="inline-flex min-h-12 items-center gap-2 rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none">Publish an API <ArrowRight className="size-4" aria-hidden="true" /></Link>}
      />

      <EarningsOverview />
      <ProductSummary />

      <section className="relative mt-10 rounded-mobile-card border-2 border-ink bg-mobile-yellow p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-lime min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
        <p className="font-metadata text-xs font-bold tracking-[0.1em] uppercase">The paid route</p>
        <h2 className="mt-3 font-display text-2xl font-bold tracking-[-0.03em]">One call. One price. One settlement.</h2>
        <div className="mt-6"><CallLine /></div>
      </section>

      <RecentTransactions />
      <LatestCallEvidence />

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <ConsoleCard title="Route evidence" description="The Call Line shows the required payment sequence." icon={Route}><p className="text-sm leading-relaxed text-muted-ink">Caller, route, price, settlement, and response remain visible in each connected call.</p></ConsoleCard>
        <ConsoleCard title="Receipt anatomy" description="A receipt preserves clear fields rather than invented activity." icon={CircleDollarSign}><p className="text-sm leading-relaxed text-muted-ink">Route, price, network, status, response, caller, and transaction evidence come from the persisted call record.</p></ConsoleCard>
        <ConsoleCard title="Status legend" description="Status color is reserved for transaction meaning."><div className="flex flex-wrap gap-2"><StatusBadge variant="verified">Verified</StatusBadge><StatusBadge variant="review">Review</StatusBadge><StatusBadge variant="failed">Failed</StatusBadge></div></ConsoleCard>
      </section>
    </div>
  )
}
