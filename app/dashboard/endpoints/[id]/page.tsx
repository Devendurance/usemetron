import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { EndpointDetail } from "@/components/dashboard/endpoint-detail"

export default async function EndpointDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <div><Link href="/dashboard/endpoints" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold underline underline-offset-4 focus-visible:shadow-focus focus-visible:outline-none"><ArrowLeft className="size-4" aria-hidden="true" />Back to endpoints</Link><EndpointDetail id={id} /></div>
}
