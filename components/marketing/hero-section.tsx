import Image from "next/image"
import { ArrowDown, MousePointer2 } from "lucide-react"

import { AuthCta } from "@/components/auth/auth-cta"

import { CtaLink } from "./cta-link"
import { HeroZipperScene } from "./hero-zipper-scene"

function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate flex min-h-[680px] w-full items-center justify-center overflow-hidden border-b-2 border-ink bg-route-sky px-4 py-16 min-[600px]:min-h-[720px] min-[600px]:px-8 min-[600px]:py-20 lg:min-h-[780px] lg:px-12 lg:py-24"
    >
      <Image
        src="/metron/paid-route-hero.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-30 object-cover object-center min-[600px]:object-[center_42%]"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-20 h-[31%] min-h-44 overflow-hidden border-t-2 border-ink bg-hero-floor"
        aria-hidden="true"
      >
        <div className="hero-floor-grid absolute -inset-x-[35%] -top-[28%] h-[180%] origin-top" />
      </div>

      <HeroZipperScene />

      <div className="relative z-10 w-full max-w-[760px] rounded-card border-2 border-ink bg-cream px-5 py-8 text-center shadow-[8px_10px_0_#141414] min-[440px]:px-8 min-[600px]:px-12 min-[600px]:py-12 lg:px-16 lg:py-14">
        <p className="mb-4 font-metadata text-xs font-bold tracking-[0.12em] text-blueprint uppercase min-[600px]:mb-5">
          Pay-per-request API infrastructure
        </p>
        <h1
          id="hero-heading"
          className="mx-auto max-w-[14ch] font-display text-[clamp(2.25rem,6vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.045em] text-ink"
        >
          Turn API calls into paid work.
        </h1>
        <p className="mx-auto mt-5 max-w-[34rem] text-base leading-7 text-muted-ink min-[600px]:mt-6 min-[600px]:text-lg min-[600px]:leading-8">
          Publish an endpoint, set a price, and let callers or agents pay per
          request on Celo.
        </p>
        <div className="mt-7 flex flex-col items-stretch justify-center gap-3 min-[440px]:flex-row min-[440px]:items-center min-[600px]:mt-8">
          <span className="relative inline-flex">
            <AuthCta
              variant="hero"
              href="/dashboard"
              className="w-full min-[440px]:w-auto"
            />
            <MousePointer2
              className="pointer-events-none absolute -right-5 -bottom-5 hidden size-9 -rotate-12 fill-hero-chartreuse text-ink min-[440px]:block"
              aria-hidden="true"
            />
          </span>
          <CtaLink
            variant="secondary"
            href="#demo"
            className="w-full min-[440px]:w-auto"
          >
            See a paid call
          </CtaLink>
        </div>
        <a
          href="#call-line"
          className="mt-7 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink underline decoration-blueprint decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:shadow-focus min-[600px]:mt-8"
        >
          Follow the paid route
          <ArrowDown className="size-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}

export { HeroSection }
