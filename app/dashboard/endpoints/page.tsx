import Link from "next/link"
import { Plus } from "lucide-react"

import { EndpointsList } from "@/components/dashboard/endpoints-list"
import { PageHeading } from "@/components/dashboard/dashboard-primitives"

export default function EndpointsPage() {
  return <div><PageHeading eyebrow="Endpoints" title="Your paid routes" description="Review each published API route and its pricing policy. This Console starts without seeded endpoints." action={<Link href="/dashboard/endpoints/new" className="inline-flex min-h-12 items-center gap-2 rounded-pill border-2 border-ink bg-lime px-5 text-sm font-bold text-ink hover:bg-lime-hover focus-visible:shadow-focus focus-visible:outline-none"><Plus className="size-4" aria-hidden="true" />Publish an API</Link>} /><EndpointsList /></div>
}
