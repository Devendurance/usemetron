"use client"

import { useRef } from "react"
import { useGSAP } from "@gsap/react"
import { gsap } from "gsap"

type LandingRevealProps = {
  children: React.ReactNode
}

function LandingReveal({ children }: LandingRevealProps) {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const container = root.current

      if (!container) {
        return
      }

      const sections = Array.from(
        container.querySelectorAll<HTMLElement>("[data-landing-reveal]")
      )
      const reducedMotionQuery = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      )
      let observer: IntersectionObserver | null = null

      const revealWithoutMotion = () => {
        observer?.disconnect()
        observer = null
        gsap.killTweensOf(sections)
        gsap.set(sections, { opacity: 1, y: 0 })
      }

      const handleReducedMotionChange = (event: MediaQueryListEvent) => {
        if (event.matches) {
          revealWithoutMotion()
        }
      }

      reducedMotionQuery.addEventListener("change", handleReducedMotionChange)

      if (reducedMotionQuery.matches) {
        revealWithoutMotion()

        return () => {
          reducedMotionQuery.removeEventListener(
            "change",
            handleReducedMotionChange
          )
          gsap.killTweensOf(sections)
        }
      }

      gsap.set(sections, { opacity: 0, y: 20 })

      const intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return
            }

            gsap.to(entry.target, {
              opacity: 1,
              duration: 0.45,
              ease: "power2.out",
              y: 0,
            })
            intersectionObserver.unobserve(entry.target)
          })
        },
        { rootMargin: "0px 0px -8%" }
      )
      observer = intersectionObserver

      sections.forEach((section) => intersectionObserver.observe(section))

      return () => {
        reducedMotionQuery.removeEventListener(
          "change",
          handleReducedMotionChange
        )
        observer?.disconnect()
        gsap.killTweensOf(sections)
      }
    },
    { scope: root }
  )

  return <div ref={root}>{children}</div>
}

export { LandingReveal }
