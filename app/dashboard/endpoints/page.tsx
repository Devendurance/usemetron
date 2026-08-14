import Link from "next/link"
import { Plus, Upload } from "lucide-react"

import { EndpointsList } from "@/components/dashboard/endpoints-list"
import { PageHeading } from "@/components/dashboard/dashboard-primitives"

export default function EndpointsPage() {
  return <div><PageHeading eyebrow="Endpoints" title="Your paid routes" description="Review each published API route and its per-request price." action={<div className="flex flex-wrap items-center gap-3"><Link href="/dashboard/endpoints/import" className="inline-flex min-h-12 items-center gap-2 rounded-pill border-2 border-ink bg-clear-paper px-5 text-sm font-bold text-ink hover:bg-cream focus-visible:shadow-focus focus-visible:outline-none"><Upload className="size-4" aria-hidden="true" />Import OpenAPI</Link><Link href="/dashboard/endpoints/new" className="inline-flex min-h-12 items-center gap-2 rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none"><Plus className="size-4" aria-hidden="true" />Publish an API</Link></div>} /><EndpointsList /></div>
}
