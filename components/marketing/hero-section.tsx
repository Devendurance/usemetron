import Image from "next/image"
import { ArrowDown, MousePointer2 } from "lucide-react"

import { CtaLink } from "./cta-link"

function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="mx-auto grid w-full max-w-[1280px] items-center gap-12 px-4 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:grid-cols-[0.78fr_1.22fr] lg:px-12 lg:pb-24 lg:pt-24"
    >
      <div className="max-w-[38rem]">
        <p className="mb-5 font-metadata text-xs font-bold tracking-[0.12em] text-blueprint uppercase">
          Pay-per-request API infrastructure
        </p>
        <h1
          id="hero-heading"
          className="max-w-[12ch] font-display text-[clamp(2.5rem,5vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.045em] text-ink"
        >
          Turn API calls into paid work.
        </h1>
        <p className="mt-6 max-w-[34rem] text-lg leading-8 text-muted-ink">
          Publish an endpoint, set a price, and let callers or agents pay per
          request on Celo.
        </p>
        <div className="mt-8 flex flex-col gap-3 min-[440px]:flex-row">
          <span className="relative inline-flex">
            <CtaLink
              variant="hero"
              href="/dashboard/endpoints/new"
              prefetch={false}
            >
              Publish an API
            </CtaLink>
            <MousePointer2
              className="pointer-events-none absolute -right-5 -bottom-5 hidden size-9 -rotate-12 fill-hero-chartreuse text-ink min-[440px]:block"
              aria-hidden="true"
            />
          </span>
          <CtaLink variant="secondary" href="#demo">
            See a paid call
          </CtaLink>
        </div>
        <a
          href="#call-line"
          className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink underline decoration-blueprint decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:shadow-focus"
        >
          Follow the paid route
          <ArrowDown className="size-4" aria-hidden="true" />
        </a>
      </div>

      <figure className="min-w-0">
        <div className="overflow-hidden rounded-card bg-route-sky shadow-[0_20px_50px_rgba(20,20,20,0.12)]">
          <Image
            src="/metron/paid-route-hero.png"
            alt="Illustrated route showing an API request travel through price and settlement checkpoints to a response and receipt."
            width={1536}
            height={1024}
            sizes="(max-width: 1023px) calc(100vw - 2rem), 58vw"
            className="h-auto w-full"
            priority
          />
        </div>
        <figcaption className="mt-3 text-sm leading-6 text-muted-ink">
          The Paid Route makes each step of a machine request visible.
        </figcaption>
      </figure>
    </section>
  )
}

export { HeroSection }
