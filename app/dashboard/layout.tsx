import { Suspense } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { getSessionFromCookie } from "@/lib/auth/service"
import { SESSION_COOKIE_NAME } from "@/lib/auth/session"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const session = token ? await getSessionFromCookie(token) : null

  if (!session?.authenticated) {
    redirect("/")
  }

  return (
    <Suspense fallback={<div className="min-h-svh bg-cream" />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  )
}
