import { Suspense } from "react"

import { DashboardShell } from "@/components/dashboard/dashboard-shell"

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <Suspense fallback={<div className="min-h-svh bg-cream" />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  )
}
