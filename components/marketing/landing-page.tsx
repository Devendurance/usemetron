import {
  Braces,
  CircleDollarSign,
  Globe2,
  PlugZap,
  ReceiptText,
  Route,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import Link from "next/link"

import { CallLine, MetronReceipt, MetronWordmark } from "@/components/metron"
import { AuthCta } from "@/components/auth/auth-cta"

import { HeroSection } from "./hero-section"
import { LandingReveal } from "./landing-reveal"
import { MarketingHeader } from "./marketing-header"

const receiptFields = [
  ["Route", "The paid path used for the request."],
  ["Price", "The amount and asset shown before authorisation."],
  ["Network", "The settlement network for this call."],
  ["Status", "The payment verification state."],
  ["Response", "The upstream API response state."],
  ["Evidence", "Caller and transaction references when available."],
] as const

const publishingSteps = [
  {
    title: "Paste your endpoint",
    description: "Publish the existing capability you already built.",
    icon: PlugZap,
  },
  {
    title: "Set the price per request",
    description: "Choose the per-request policy callers will inspect.",
    icon: CircleDollarSign,
  },
  {
    title: "Publish the paid route",
    description: "Receive a powered route for callers and agents.",
    icon: Route,
  },
] as const

function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-cream text-ink">
      <div className="bg-route-sky">
        <MarketingHeader />
      </div>
      <main>
        <HeroSection />

        <LandingReveal>
        <section
          data-landing-reveal
          id="call-line"
          aria-labelledby="call-line-heading"
          className="scroll-mt-6 border-y border-border bg-clear-paper"
        >
          <div className="mx-auto w-full max-w-[1280px] px-4 py-12 sm:px-8 sm:py-16 lg:px-12">
            <div className="mb-8 grid gap-3 sm:grid-cols-[0.8fr_1.2fr] sm:items-end">
              <h2
                id="call-line-heading"
                className="max-w-[16ch] font-display text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl"
              >
                One call. One price. One settlement.
              </h2>
              <p className="max-w-[40rem] text-base leading-7 text-muted-ink sm:justify-self-end">
                Payment terms, Celo settlement, API response and creator receipt
                are visible.
              </p>
            </div>
            <CallLine />
          </div>
        </section>

        <section
          data-landing-reveal
          aria-label="Who Metron is for"
          className="mx-auto grid w-full max-w-[1280px] gap-6 px-4 py-16 sm:px-8 sm:py-20 md:grid-cols-2 lg:px-12 lg:py-24"
        >
          <article
            id="creators"
            className="scroll-mt-6 rounded-card bg-coral p-6 sm:p-8 lg:p-10"
          >
            <div className="mb-12 inline-flex size-14 items-center justify-center rounded-control border-2 border-ink bg-clear-paper">
              <UserRound className="size-6" aria-hidden="true" />
            </div>
            <p className="font-metadata text-xs font-bold tracking-[0.12em] uppercase">
              For API creators
            </p>
            <h2 className="mt-4 max-w-[18ch] font-display text-3xl font-semibold leading-tight tracking-[-0.03em]">
              You built the API. Metron handles the payment layer.
            </h2>
            <p className="mt-5 max-w-[35rem] leading-7 text-muted-ink">
              Publish an existing endpoint, set a price, and start accepting
              per-request payments without building keys, billing dashboards,
              subscriptions or payout infrastructure.
            </p>
            <AuthCta
              variant="lime"
              href="/dashboard"
              className="mt-8"
            />
          </article>

          <article
            id="agents"
            className="scroll-mt-6 rounded-card bg-lime p-6 sm:p-8 lg:p-10"
          >
            <div className="mb-12 inline-flex size-14 items-center justify-center rounded-control border-2 border-ink bg-clear-paper">
              <Braces className="size-6" aria-hidden="true" />
            </div>
            <p className="font-metadata text-xs font-bold tracking-[0.12em] uppercase">
              For AI-agent developers
            </p>
            <h2 className="mt-4 max-w-[18ch] font-display text-3xl font-semibold leading-tight tracking-[-0.03em]">
              Give your agents APIs they can actually pay for.
            </h2>
            <p className="mt-5 max-w-[35rem] leading-7 text-muted-ink">
              Metron returns machine-readable payment requirements so an agent
              can authorise a small stablecoin payment, call the endpoint and
              continue its task.
            </p>
            <Link
              className="mt-8 inline-flex min-h-11 items-center text-sm font-bold text-ink underline decoration-2 decoration-blueprint underline-offset-4 transition-colors hover:decoration-ink focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
              href="#demo"
            >
              Run a paid call
            </Link>
          </article>
        </section>

        <section
          data-landing-reveal
          id="demo"
          aria-labelledby="receipt-heading"
          className="scroll-mt-6 bg-ink text-clear-paper"
        >
          <div className="mx-auto grid w-full max-w-[1280px] gap-12 px-4 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:px-12 lg:py-24">
            <div>
              <p className="font-metadata text-xs font-bold tracking-[0.12em] text-lime uppercase">
                Metron Receipt anatomy
              </p>
              <h2
                id="receipt-heading"
                className="mt-4 max-w-[14ch] font-display text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
              >
                Show the transaction. Then execute the work.
              </h2>
              <p className="mt-6 max-w-[38rem] leading-7 text-clear-paper/70">
                Metron shows the route, price, network, settlement state and
                response instead of asking users to trust an invisible system.
              </p>
              <dl className="mt-8 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {receiptFields.map(([term, description]) => (
                  <div key={term} className="border-t border-clear-paper/20 pt-3">
                    <dt className="font-metadata text-xs font-bold tracking-[0.08em] text-lime uppercase">
                      {term}
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-clear-paper/70">
                      {description}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <MetronReceipt
                network="Celo"
                aria-label="Metron Receipt field anatomy with route-specific values intentionally blank"
                className="p-6 sm:p-10 [&_[data-slot=metron-receipt-row]]:py-1"
              />
              <p className="mt-3 text-sm leading-6 text-clear-paper/60">
                Route-specific values use em dashes because this is field
                anatomy, not a live call.
              </p>
            </div>
          </div>
        </section>

        <section data-landing-reveal aria-labelledby="celo-heading">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
            <div className="grid overflow-hidden rounded-card border-2 border-blueprint bg-clear-paper md:grid-cols-[0.9fr_1.1fr]">
              <div className="flex min-h-64 flex-col justify-between bg-blueprint p-6 text-clear-paper sm:p-8 lg:p-10">
                <Globe2 className="size-12" aria-hidden="true" />
                <div className="mt-16">
                  <p className="font-metadata text-xs font-bold tracking-[0.12em] uppercase">
                    Celo + x402
                  </p>
                  <h2
                    id="celo-heading"
                    className="mt-3 max-w-[12ch] font-display text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl"
                  >
                    Real work, paid for onchain.
                  </h2>
                </div>
              </div>
              <div className="p-6 sm:p-8 lg:p-10">
                <p className="max-w-[42rem] text-xl leading-8 text-ink">
                  Metron routes useful API demand through Celo’s x402 payment
                  infrastructure, turning machine-to-machine requests into
                  measurable stablecoin activity.
                </p>
                <div className="mt-10 grid gap-4">
                  <div className="flex gap-4 border-t border-border pt-4">
                    <Braces className="mt-0.5 size-5 shrink-0 text-blueprint" aria-hidden="true" />
                    <p className="text-sm leading-6 text-muted-ink">
                      HTTP 402 payment requirements make the terms readable by
                      software before the request continues.
                    </p>
                  </div>
                  <div className="flex gap-4 border-t border-border pt-4">
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blueprint" aria-hidden="true" />
                    <p className="text-sm leading-6 text-muted-ink">
                      Payment is verified before the API request is forwarded.
                    </p>
                  </div>
                  <div className="flex gap-4 border-t border-border pt-4">
                    <ReceiptText className="mt-0.5 size-5 shrink-0 text-blueprint" aria-hidden="true" />
                    <p className="text-sm leading-6 text-muted-ink">
                      The creator receipt keeps the payment and response evidence
                      inspectable.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          data-landing-reveal
          id="how-it-works"
          aria-labelledby="steps-heading"
          className="scroll-mt-6 border-y border-border bg-clear-paper"
        >
          <div className="mx-auto w-full max-w-[1280px] px-4 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
            <div className="grid gap-5 sm:grid-cols-[0.7fr_1.3fr] sm:items-end">
              <div>
                <p className="font-metadata text-xs font-bold tracking-[0.12em] text-blueprint uppercase">
                  Publish an endpoint
                </p>
                <h2
                  id="steps-heading"
                  className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
                >
                  From endpoint to paid route.
                </h2>
              </div>
              <p className="max-w-[38rem] leading-7 text-muted-ink sm:justify-self-end">
                You built the capability. Metron handles the payment layer.
              </p>
            </div>

            <ol className="mt-12 grid gap-0 md:grid-cols-3">
              {publishingSteps.map((step, index) => {
                const Icon = step.icon

                return (
                  <li
                    key={step.title}
                    className="group relative border-t-2 border-ink py-8 md:border-l-0 md:pr-8 md:not-last:border-r md:not-last:pl-8 md:first:pl-0 md:last:pl-8"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-metadata text-sm font-bold tracking-[0.08em] text-blueprint">
                        0{index + 1}
                      </span>
                      <Icon className="size-6" aria-hidden="true" />
                    </div>
                    <h3 className="mt-10 font-display text-xl font-semibold tracking-[-0.02em]">
                      {step.title}
                    </h3>
                    <p className="mt-3 max-w-[20rem] leading-7 text-muted-ink">
                      {step.description}
                    </p>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        <section
          data-landing-reveal
          className="mx-auto w-full max-w-[1280px] px-4 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24"
        >
          <div className="rounded-card bg-lime p-6 sm:p-10 lg:flex lg:items-end lg:justify-between lg:gap-12 lg:p-14">
            <div>
              <p className="font-metadata text-xs font-bold tracking-[0.12em] uppercase">
                One call. One price. One settlement.
              </p>
              <h2 className="mt-4 max-w-[14ch] font-display text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">
                Publish your first API.
              </h2>
              <p className="mt-5 max-w-[38rem] leading-7 text-muted-ink">
                Publish a paid API in minutes, then let callers and agents pay
                per request on Celo.
              </p>
            </div>
            <AuthCta
              variant="paper"
              href="/dashboard"
              className="mt-8 shrink-0 lg:mt-0"
            />
          </div>
        </section>
        </LandingReveal>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex min-h-20 w-full max-w-[1280px] flex-col justify-center gap-2 px-4 py-5 text-sm text-muted-ink sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <MetronWordmark />
          <p>The clear payment layer for API calls.</p>
        </div>
      </footer>
    </div>
  )
}

export { LandingPage }
