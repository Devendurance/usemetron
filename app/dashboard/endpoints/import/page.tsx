import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { OpenApiImportFlow } from "@/components/dashboard/openapi/import-flow"
import { PageHeading } from "@/components/dashboard/dashboard-primitives"

export default function ImportOpenApiPage() {
  return <div><Link href="/dashboard/endpoints" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold underline underline-offset-4 focus-visible:shadow-focus focus-visible:outline-none"><ArrowLeft className="size-4" aria-hidden="true" />Back to endpoints</Link><div className="mt-5"><PageHeading eyebrow="Import OpenAPI" title="Turn a spec into paid routes" description="Paste or upload an OpenAPI 3.0.x / 3.1.x document, review the discovered operations, set prices and auth, then publish them as live paid routes." /></div><OpenApiImportFlow /></div>
}
