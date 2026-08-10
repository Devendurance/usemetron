import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PageHeading } from "@/components/dashboard/dashboard-primitives"
import { PublishForm } from "@/components/dashboard/publish-form"

export default function NewEndpointPage() {
  return <div><Link href="/dashboard/endpoints" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold underline underline-offset-4 focus-visible:shadow-focus focus-visible:outline-none"><ArrowLeft className="size-4" aria-hidden="true" />Back to endpoints</Link><div className="mt-5"><PageHeading eyebrow="Publish an API" title="Set up a paid route" description="Describe the endpoint and set its flat per-request price. Publish to create a live powered route." /></div><PublishForm /></div>
}
