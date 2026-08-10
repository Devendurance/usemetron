"use client";

import Link from "next/link";
import { useConnectModal } from "@rainbow-me/rainbowkit";

import { useAuth } from "@/lib/auth/use-auth";
import { cn } from "@/lib/utils";

/**
 * Marketing CTA that follows the real Metron auth state:
 * - loading          → inert "CHECKING…" pill (no fake state);
 * - unauthenticated  → "CONNECT WALLET" pill that opens the RainbowKit modal
 *                      (SIWE sign-in follows; authentication only);
 * - authenticated    → "OPEN DASHBOARD" link to `href`.
 *
 * Variants mirror the existing CTA surfaces exactly (per DESIGN.md):
 * - "ink":   desktop header cell pill (ink fill, paper label);
 * - "lime":  mobile sheet pill (lime fill, ink border);
 * - "hero":  hero pill (route chartreuse, hero-only colour);
 * - "paper": secondary web pill (clear paper fill, ink border).
 */

type AuthCtaVariant = "ink" | "lime" | "hero" | "paper";

type AuthCtaProps = {
  /** Destination once authenticated (defaults to the dashboard). */
  href?: string;
  className?: string;
  variant?: AuthCtaVariant;
  /** Optional parent handler (e.g. a SheetClose "close" action), fired alongside the CTA action. */
  onClick?: () => void;
};

const AUTH_CTA_BASE = cn(
  "inline-flex min-h-12 items-center justify-center rounded-pill",
  "font-bold tracking-[0.04em] transition-colors motion-reduce:transition-none"
);

const AUTH_CTA_VARIANTS: Record<AuthCtaVariant, string> = {
  // Desktop header cell — identical classes to the current "PUBLISH AN API" pill.
  ink: cn(
    "relative bg-ink px-2 text-center text-[10px] leading-tight text-clear-paper",
    "hover:bg-blueprint",
    "focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-blueprint",
    "focus-visible:outline-offset-2 focus-visible:shadow-focus",
    "min-[1024px]:px-4 min-[1024px]:text-sm min-[1024px]:leading-normal"
  ),
  // Mobile sheet CTA — identical classes to the current sheet pill.
  lime: cn(
    "border-2 border-ink bg-lime px-6 text-sm text-ink hover:bg-lime-hover",
    "focus-visible:outline-none focus-visible:shadow-focus"
  ),
  // Hero CTA — preserves the hero-only chartreuse pill (CtaLink "hero").
  hero: cn(
    "border-2 border-ink bg-hero-chartreuse px-7 py-3 text-sm text-ink hover:bg-lime-hover",
    "focus-visible:outline-none focus-visible:shadow-focus"
  ),
  // Footer/paper CTA — preserves the clear-paper pill (CtaLink "secondary").
  paper: cn(
    "border-2 border-ink bg-clear-paper px-7 py-3 text-sm text-ink hover:bg-cream",
    "focus-visible:outline-none focus-visible:shadow-focus"
  ),
};

export function AuthCta({
  href = "/dashboard",
  className,
  variant = "lime",
  onClick,
}: AuthCtaProps) {
  const { status } = useAuth();
  const { openConnectModal } = useConnectModal();

  const pill = cn(AUTH_CTA_BASE, AUTH_CTA_VARIANTS[variant], className);

  if (status === "loading") {
    return (
      <button
        type="button"
        disabled
        aria-busy="true"
        className={cn(pill, "disabled:pointer-events-none disabled:opacity-60")}
      >
        CHECKING…
      </button>
    );
  }

  if (status === "unauthenticated") {
    return (
      <button
        type="button"
        onClick={() => {
          onClick?.();
          openConnectModal?.();
        }}
        className={pill}
      >
        CONNECT WALLET
      </button>
    );
  }

  return (
    <Link href={href} onClick={onClick} className={pill}>
      OPEN DASHBOARD
    </Link>
  );
}
