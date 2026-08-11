"use client"

import Link from "next/link"
import { Menu } from "lucide-react"

import { MetronWordmark } from "@/components/metron"
import { AuthCta } from "@/components/auth/auth-cta"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const navigation = [
  { label: "FOR CREATORS", href: "#creators" },
  { label: "FOR AGENTS", href: "#agents" },
  { label: "HOW IT WORKS", href: "#how-it-works" },
  { label: "VIEW DEMO", href: "#demo" },
] as const

function MarketingHeader() {
  return (
    <header className="relative z-40 mx-auto w-full max-w-[1280px] px-4 pt-4 min-[600px]:px-6 min-[1024px]:px-12">
      <div className="flex min-h-16 items-center justify-between rounded-control border-2 border-ink bg-cream min-[600px]:hidden">
        <Link
          href="/"
          aria-label="Metron home"
          className="flex min-h-11 items-center px-4 focus-visible:outline-none focus-visible:shadow-focus"
        >
          <MetronWordmark />
        </Link>

        <Sheet>
          <SheetTrigger
            aria-label="Open navigation"
            className="mr-2 inline-flex size-11 items-center justify-center rounded-control border-2 border-ink bg-lime transition-colors hover:bg-lime-hover focus-visible:outline-none focus-visible:shadow-focus"
          >
            <Menu className="size-5" aria-hidden="true" />
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[min(88vw,24rem)] gap-0 border-l-2 border-ink bg-cream shadow-none [&_[data-slot=sheet-close]]:!size-11"
          >
            <SheetHeader className="border-b border-border px-6 py-5">
              <SheetTitle>
                <MetronWordmark />
              </SheetTitle>
              <SheetDescription>Navigate the Metron landing page.</SheetDescription>
            </SheetHeader>
            <nav aria-label="Mobile navigation" className="flex flex-col p-4">
              {navigation.map((item) => (
                <SheetClose key={item.href} render={<Link href={item.href} />}>
                  <span className="flex min-h-12 items-center border-b border-border px-3 text-sm font-bold tracking-[0.04em] text-ink focus-visible:outline-none focus-visible:shadow-focus">
                    {item.label}
                  </span>
                </SheetClose>
              ))}
              <SheetClose
                render={<AuthCta variant="lime" href="/dashboard" />}
                className="mt-6"
              />
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      <nav
        aria-label="Primary navigation"
        className="hidden min-h-[72px] grid-cols-[minmax(5.5rem,1.05fr)_repeat(4,minmax(0,1fr))_minmax(7rem,1.35fr)] rounded-control border-2 border-ink bg-cream min-[600px]:grid min-[1024px]:grid-cols-[1.35fr_repeat(4,1fr)_1.2fr]"
      >
        <Link
          href="/"
          aria-label="Metron home"
          className="relative flex min-h-[68px] items-center border-r-2 border-ink px-3 min-[1024px]:px-6 focus-visible:z-10 focus-visible:bg-clear-paper focus-visible:outline-2 focus-visible:outline-blueprint focus-visible:outline-offset-[-4px] focus-visible:shadow-focus"
        >
          <MetronWordmark
            compact
            className="min-[768px]:text-lg min-[768px]:tracking-[-0.055em]"
          />
        </Link>
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="relative flex min-h-[68px] items-center justify-center border-r-2 border-ink px-1 text-center text-[10px] font-bold leading-tight tracking-[0.04em] text-ink transition-colors hover:bg-clear-paper focus-visible:z-10 focus-visible:bg-clear-paper focus-visible:outline-2 focus-visible:outline-blueprint focus-visible:outline-offset-[-4px] focus-visible:shadow-focus min-[1024px]:px-3 min-[1024px]:text-sm min-[1024px]:leading-normal motion-reduce:transition-none"
          >
            {item.label}
          </Link>
        ))}
        <div className="flex items-center p-2 min-[1024px]:p-3">
          <AuthCta variant="ink" href="/dashboard" className="w-full" />
        </div>
      </nav>
    </header>
  )
}

export { MarketingHeader }
