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

      if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return
      }

      const sections = Array.from(
        container.querySelectorAll<HTMLElement>("[data-landing-reveal]")
      )

      gsap.set(sections, { opacity: 0, y: 20 })

      const observer = new IntersectionObserver(
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
            observer.unobserve(entry.target)
          })
        },
        { rootMargin: "0px 0px -8%" }
      )

      sections.forEach((section) => observer.observe(section))

      return () => {
        observer.disconnect()
        gsap.killTweensOf(sections)
      }
    },
    { scope: root }
  )

  return <div ref={root}>{children}</div>
}

export { LandingReveal }
