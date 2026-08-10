"use client"

import { useRef } from "react"
import { useGSAP } from "@gsap/react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

import styles from "./hero-zipper-scene.module.css"

gsap.registerPlugin(useGSAP, ScrollTrigger)

const PREVIEWS = [
  "GET /p/forecast",
  "POST /p/score",
  "GET /p/lookup",
  "POST /p/verify",
  "GET /p/quote",
] as const

const ZIPPER_TEETH = Array.from({ length: 18 }, (_, index) => index)

type SceneConditions = {
  desktop?: boolean
  tablet?: boolean
  mobile?: boolean
  reduceMotion?: boolean
}

function readRotation(card: HTMLElement) {
  return (
    Number.parseFloat(
      window.getComputedStyle(card).getPropertyValue("--card-rotation")
    ) || 0
  )
}

function readCssNumber(element: Element, property: string) {
  return (
    Number.parseFloat(
      window.getComputedStyle(element).getPropertyValue(property)
    ) || 0
  )
}

function HeroZipperScene() {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const scene = root.current

      if (!scene) {
        return
      }

      const select = gsap.utils.selector(scene)
      const leftShutter = select('[data-zipper-shutter="left"]')[0]
      const rightShutter = select('[data-zipper-shutter="right"]')[0]
      const pull = select("[data-zipper-pull]")[0]
      const zipperOverlay = select("[data-zipper-overlay]")[0]
      const zipperOrigin = select("[data-zipper-origin]")[0]
      const cards = select("[data-zipper-card]") as HTMLElement[]
      const media = gsap.matchMedia()

      media.add(
        {
          desktop: "(min-width: 1024px)",
          tablet: "(min-width: 600px) and (max-width: 1023px)",
          mobile: "(max-width: 599px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const conditions = context.conditions as SceneConditions
          const reducedMotion = Boolean(conditions.reduceMotion)
          const pullTravel = readCssNumber(
            zipperOverlay,
            "--zipper-pull-travel"
          )
          const perspectiveTilt = conditions.desktop
            ? 13
            : conditions.tablet
              ? 9
              : 6
          const timeline = gsap.timeline({ paused: true })

          const zipperOriginPosition = () => {
            const sceneBounds = scene.getBoundingClientRect()
            const originBounds = zipperOrigin.getBoundingClientRect()

            return {
              x: originBounds.left + originBounds.width / 2 - sceneBounds.left,
              y: originBounds.top + originBounds.height / 2 - sceneBounds.top,
            }
          }
          const cardClosedX = (index: number) =>
            zipperOriginPosition().x - cards[index].offsetLeft
          const cardClosedY = (index: number) =>
            zipperOriginPosition().y - cards[index].offsetTop
          const cardRotation = (index: number) => readRotation(cards[index])

          if (reducedMotion) {
            gsap.set(leftShutter, { xPercent: -96 })
            gsap.set(rightShutter, { xPercent: 96 })
            gsap.set(pull, { xPercent: -50, y: pullTravel })
            gsap.set(cards, {
              x: 0,
              xPercent: -50,
              y: 0,
              yPercent: -50,
              rotation: 0,
              rotationX: 0,
              rotationY: 0,
              opacity: 1,
            })
          } else {
            timeline
              .fromTo(
                pull,
                { xPercent: -50, y: 0 },
                {
                  xPercent: -50,
                  y: pullTravel,
                  duration: 0.3,
                  ease: "power2.inOut",
                }
              )
              .fromTo(
                leftShutter,
                { xPercent: 0 },
                { xPercent: -96, duration: 0.34, ease: "power3.inOut" }
              )
              .fromTo(
                rightShutter,
                { xPercent: 0 },
                { xPercent: 96, duration: 0.34, ease: "power3.inOut" },
                "<"
              )
              .fromTo(
                cards,
                {
                  x: (index) => cardClosedX(index),
                  xPercent: -50,
                  y: (index) => cardClosedY(index),
                  yPercent: -50,
                  rotation: 0,
                  rotationX: perspectiveTilt,
                  rotationY: (index) => (index % 2 === 0 ? -8 : 8),
                  opacity: 0,
                },
                {
                  x: 0,
                  xPercent: -50,
                  y: 0,
                  yPercent: -50,
                  rotation: (index) => cardRotation(index) * 1.35,
                  rotationX: -perspectiveTilt * 0.35,
                  rotationY: (index) => (index % 2 === 0 ? 3 : -3),
                  opacity: 1,
                  duration: 0.46,
                  stagger: 0.065,
                  ease: "power3.out",
                }
              )
              .to(
                cards,
                {
                  y: 0,
                  rotation: (index) => cardRotation(index),
                  rotationX: 0,
                  rotationY: 0,
                  duration: 0.2,
                  stagger: 0.065,
                  ease: "power2.out",
                },
                "-=0.2"
              )
          }

          const open = () => {
            if (reducedMotion) {
              return
            }

            timeline.play()
          }
          const close = () => {
            if (reducedMotion) {
              return
            }

            timeline.reverse()
          }

          const trigger = ScrollTrigger.create({
            trigger: scene,
            start: "top 60%",
            end: "bottom 20%",
            scrub: false,
            onEnter: open,
            onEnterBack: open,
            onLeave: close,
            onLeaveBack: close,
            onRefresh: () => timeline.invalidate(),
          })

          if (!reducedMotion && trigger.isActive) {
            timeline.play(0)
          }

          return () => {
            trigger.kill()
            timeline.kill()
          }
        }
      )

      return () => media.revert()
    },
    { scope: root }
  )

  return (
    <div ref={root} className={styles.scene}>
      <div className={styles.backLayer}>
        <div className={styles.pocket} aria-hidden="true">
          <span
            className={`${styles.shutter} ${styles.leftShutter}`}
            data-zipper-shutter="left"
          />
          <span
            className={`${styles.shutter} ${styles.rightShutter}`}
            data-zipper-shutter="right"
          />
        </div>

        <p id="hero-preview-label" className={styles.previewLabel}>
          Example powered URLs — demo only
        </p>
        <ul
          className={styles.previewList}
          aria-labelledby="hero-preview-label"
          aria-describedby="hero-preview-note"
        >
          {PREVIEWS.map((preview) => (
            <li key={preview} className={styles.previewCard} data-zipper-card>
              <code>{preview}</code>
            </li>
          ))}
        </ul>
        <p id="hero-preview-note" className={styles.previewNote}>
          No request will run.
        </p>
      </div>

      <div
        className={styles.zipperOverlay}
        data-zipper-overlay
        aria-hidden="true"
      >
        <span className={styles.seam}>
          <span className={styles.teeth}>
            {ZIPPER_TEETH.map((tooth) => (
              <span key={tooth} className={styles.tooth} />
            ))}
          </span>
        </span>
        <span className={styles.pull} data-zipper-pull>
          <span className={styles.pullGrip} />
        </span>
        <span className={styles.zipperOrigin} data-zipper-origin />
      </div>
    </div>
  )
}

export { HeroZipperScene }
