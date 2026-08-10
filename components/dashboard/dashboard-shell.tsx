"use client"

import Link from "next/link"
import { LayoutDashboard, Menu, Network, Plus, ReceiptText, Settings2, WalletCards } from "lucide-react"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { MetronWordmark } from "@/components/metron"
import { MetronAccountBadge } from "@/components/auth/connect-button"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth/use-auth"
import { cn } from "@/lib/utils"
import { formatWalletAddress } from "@/lib/web3/format"

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/endpoints", label: "Endpoints", icon: Network },
  { href: "/dashboard/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2 },
]

function isActive(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`)
}

function NavLinks({
  close,
  mobile = false,
  compact = false,
}: {
  close?: () => void
  mobile?: boolean
  compact?: boolean
}) {
  const pathname = usePathname()

  return (
    <nav aria-label="Console navigation" className="grid gap-2">
      {navigation.map((item) => {
        const active = isActive(pathname, item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={close}
            aria-current={active ? "page" : undefined}
            aria-label={compact ? item.label : undefined}
            title={compact ? item.label : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-control font-metadata text-sm font-bold tracking-[0.04em] transition-colors focus-visible:shadow-focus focus-visible:outline-none",
              compact ? "mx-auto w-11 justify-center px-0" : "px-4",
              active
                ? mobile ? "border-2 border-ink bg-mobile-magenta text-ink" : "bg-lime text-ink"
                : mobile ? "border-2 border-transparent text-ink hover:border-ink hover:bg-mobile-yellow" : "text-muted-ink hover:bg-coral/45 hover:text-ink"
            )}
          >
            {compact && <Icon className="size-5" aria-hidden="true" />}
            <span className={compact ? "sr-only" : undefined}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Sidebar wallet card driven by the real auth state: title reflects the
 * session, the badge shows the connect button or authenticated address chip,
 * and the address line appears once authenticated.
 */
function WalletStatusCard() {
  const { status, developer } = useAuth()

  const title =
    status === "loading"
      ? "Checking session…"
      : status === "authenticated"
        ? "Authenticated"
        : "Connect your wallet"

  return (
    <div className="mt-auto hidden space-y-3 rounded-card bg-coral p-5 min-[1024px]:block">
      <WalletCards className="size-5" aria-hidden="true" />
      <div>
        <p className="font-heading text-base font-semibold">{title}</p>
        <div className="mt-2">
          <MetronAccountBadge />
        </div>
        {status === "authenticated" && developer !== null && (
          <p className="mt-2 font-metadata text-xs font-bold tracking-[0.04em] text-muted-ink">
            {formatWalletAddress(developer.walletAddress)}
          </p>
        )}
      </div>
      <Link
        href="/dashboard/settings"
        className="inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4 focus-visible:shadow-focus focus-visible:outline-none"
      >
        Open settings
      </Link>
    </div>
  )
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-svh bg-mobile-yellow text-ink min-[600px]:bg-cream">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 border-r border-border bg-clear-paper p-2 min-[600px]:flex min-[600px]:flex-col min-[1024px]:w-64 min-[1024px]:p-6">
        <MetronWordmark compact className="self-center min-[1024px]:hidden" />
        <MetronWordmark className="hidden min-[1024px]:inline-flex" />
        <p className="mt-3 hidden text-sm leading-relaxed text-muted-ink min-[1024px]:block">
          Console for your paid routes and their evidence.
        </p>
        <div className="mt-8 min-[1024px]:mt-10">
          <p className="sr-only mb-3 px-4 font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink min-[1024px]:not-sr-only">
            Console
          </p>
          <div className="min-[1024px]:hidden"><NavLinks compact /></div>
          <div className="hidden min-[1024px]:block"><NavLinks /></div>
        </div>
        <WalletStatusCard />
      </aside>

      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b-2 border-ink bg-mobile-yellow px-4 min-[600px]:hidden">
        <MetronWordmark />
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="icon-lg"
                className="min-h-11 min-w-11 rounded-control border-2 border-ink bg-mobile-surface text-ink focus-visible:shadow-focus"
                aria-label="Open Console navigation"
              />
            }
          >
            <Menu aria-hidden="true" />
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[min(88vw,22rem)] border-r-2 border-ink bg-mobile-surface p-0 shadow-none [&>[data-slot=sheet-close]]:size-11 [&>[data-slot=sheet-close]]:min-h-11 [&>[data-slot=sheet-close]]:min-w-11"
          >
            <SheetHeader className="border-b-2 border-ink bg-mobile-yellow p-6 pr-14">
              <SheetTitle>
                <MetronWordmark className="text-2xl tracking-[-0.055em]" />
              </SheetTitle>
              <SheetDescription className="text-ink/75">
                Routes, calls, and receipts.
              </SheetDescription>
            </SheetHeader>
            <div className="p-5">
              <NavLinks mobile close={() => setMobileMenuOpen(false)} />
            </div>
            <div className="mt-auto border-t-2 border-ink p-5">
              <SheetClose
                render={
                  <Link
                    href="/dashboard/endpoints/new"
                    className="flex min-h-11 items-center justify-center gap-2 rounded-control border-2 border-ink bg-mobile-magenta px-4 text-sm font-bold text-ink focus-visible:shadow-focus focus-visible:outline-none"
                  />
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                Publish an API
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <main className="min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] min-[600px]:pb-0 min-[600px]:pl-16 min-[1024px]:pl-64 min-[600px]:max-[1023px]:[&_[data-slot=call-line]]:gap-1 min-[600px]:max-[1023px]:[&_[data-slot=call-line-item]]:gap-1 min-[600px]:max-[1023px]:[&_[data-slot=call-line-item]>span]:min-w-14 min-[600px]:max-[1023px]:[&_[data-slot=call-line-item]>span]:gap-0 min-[600px]:max-[1023px]:[&_[data-slot=call-line-item]>span]:px-1.5 min-[600px]:max-[1023px]:[&_[data-slot=call-line-item]>span]:text-[10px] min-[600px]:max-[1023px]:[&_[data-slot=call-line-item]>span>svg]:hidden min-[600px]:max-[1023px]:[&_[data-slot=call-line-item]>span>span]:!overflow-visible min-[600px]:max-[1023px]:[&_[data-slot=call-line-item]>span>span]:!text-clip">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 min-[600px]:px-2 min-[600px]:py-10 min-[1024px]:px-10 min-[1024px]:py-12">
          {children}
        </div>
      </main>

      <Link
        href="/dashboard/endpoints/new"
        className="fixed right-5 bottom-[max(1.25rem,calc(1rem+env(safe-area-inset-bottom)))] z-20 inline-flex min-h-12 items-center gap-2 rounded-control border-2 border-ink bg-mobile-magenta px-4 text-sm font-bold text-ink shadow-[4px_4px_0_#141414] focus-visible:shadow-focus focus-visible:outline-none min-[600px]:hidden"
      >
        <Plus className="size-4" aria-hidden="true" />
        Publish
      </Link>
      <Link
        href="/dashboard/settings"
        className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:bottom-4 focus:z-40 focus:flex focus:min-h-11 focus:items-center focus:gap-2 focus:rounded-control focus:bg-clear-paper focus:px-4 focus:font-bold focus:shadow-focus"
      >
        <Settings2 className="size-4" aria-hidden="true" />
        Skip to settings
      </Link>
    </div>
  )
}

export { DashboardShell }
