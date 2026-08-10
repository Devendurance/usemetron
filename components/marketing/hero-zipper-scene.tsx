"use client"

import { useRef, useState } from "react"
import { useGSAP } from "@gsap/react"
import { gsap } from "gsap"

import {
  getKeyboardProgress,
  getProgressFromVerticalDrag,
  isZipperDragStart,
  settleZipperProgress,
} from "./hero-zipper-gesture"
import styles from "./hero-zipper-scene.module.css"

gsap.registerPlugin(useGSAP)

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

function clampProgress(progress: number) {
  return Math.min(1, Math.max(0, progress))
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
  const timeline = useRef<gsap.core.Timeline | null>(null)
  const settleTween = useRef<gsap.core.Tween | null>(null)
  const reduceMotion = useRef(false)
  const activePointer = useRef<number | null>(null)
  const dragStartProgress = useRef(0)
  const dragStartY = useRef(0)
  const wasOpenAtDragStart = useRef(false)
  const isOpen = useRef(false)
  const currentProgress = useRef(0)
  const [progress, setProgress] = useState(0)

  const updateProgress = (nextProgress: number, commit = false) => {
    const boundedProgress = clampProgress(nextProgress)
    const visualProgress = reduceMotion.current
      ? isOpen.current
        ? 1
        : 0
      : boundedProgress

    timeline.current?.progress(visualProgress).pause()
    currentProgress.current = boundedProgress
    if (commit) {
      setProgress(boundedProgress)
    }
  }

  const settleToProgress = (nextProgress: 0 | 1) => {
    settleTween.current?.kill()

    if (reduceMotion.current || !timeline.current) {
      updateProgress(nextProgress)
      return
    }

    settleTween.current = gsap.to(currentProgress, {
      current: nextProgress,
      duration: 0.32,
      ease: "power3.out",
      onUpdate: () => updateProgress(currentProgress.current),
      onComplete: () => {
        settleTween.current = null
      },
    })
  }

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
          const shouldReduceMotion = Boolean(conditions.reduceMotion)
          reduceMotion.current = shouldReduceMotion
          const pullTravel = readCssNumber(
            zipperOverlay,
            "--zipper-pull-travel"
          )
          const perspectiveTilt = conditions.desktop
            ? 13
            : conditions.tablet
              ? 9
              : 6
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
          const sceneTimeline = gsap.timeline({ paused: true })

          gsap.set([leftShutter, rightShutter], { xPercent: 0 })
          gsap.set(pull, { y: 0 })
          gsap.set(cards, {
            x: (index) => cardClosedX(index),
            xPercent: -50,
            y: (index) => cardClosedY(index),
            yPercent: -50,
            rotation: 0,
            rotationX: shouldReduceMotion ? 0 : perspectiveTilt,
            rotationY: shouldReduceMotion ? 0 : (index) => (index % 2 === 0 ? -8 : 8),
            opacity: 0,
          })

          sceneTimeline
            .to(
              pull,
              {
                y: pullTravel,
                duration: 1.2,
                ease: "none",
              },
              0
            )
            .to(
              leftShutter,
              {
                xPercent: -96,
                duration: 0.44,
                ease: "power3.inOut",
              },
              0.06
            )
            .to(
              rightShutter,
              {
                xPercent: 96,
                duration: 0.44,
                ease: "power3.inOut",
              },
              0.06
            )
            .to(
              cards,
              {
                x: 0,
                xPercent: -50,
                y: 0,
                yPercent: -50,
                rotation: (index) =>
                  shouldReduceMotion ? cardRotation(index) : cardRotation(index) * 1.35,
                rotationX: shouldReduceMotion ? 0 : -perspectiveTilt * 0.35,
                rotationY: shouldReduceMotion ? 0 : (index) => (index % 2 === 0 ? 3 : -3),
                opacity: 1,
                duration: 0.5,
                stagger: 0.055,
                ease: "power3.out",
              },
              0.22
            )

          if (!shouldReduceMotion) {
            sceneTimeline.to(cards, {
              y: 0,
              rotation: (index) => cardRotation(index),
              rotationX: 0,
              rotationY: 0,
              duration: 0.18,
              stagger: 0.035,
              ease: "power2.out",
            }, 0.85)
          }

          const initialVisualProgress = shouldReduceMotion
            ? isOpen.current
              ? 1
              : 0
            : currentProgress.current

          timeline.current = sceneTimeline.progress(initialVisualProgress).pause()

          return () => {
            if (timeline.current === sceneTimeline) {
              timeline.current = null
            }
            sceneTimeline.kill()
          }
        }
      )

      return () => {
        settleTween.current?.kill()
        settleTween.current = null
        media.revert()
      }
    },
    { scope: root }
  )

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isZipperDragStart(event.pointerType, event.button)) {
      return
    }

    event.preventDefault()
    settleTween.current?.kill()
    settleTween.current = null
    activePointer.current = event.pointerId
    dragStartProgress.current = currentProgress.current
    dragStartY.current = event.clientY
    wasOpenAtDragStart.current = isOpen.current
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) {
      return
    }

    event.preventDefault()
    const travelDistance = readCssNumber(
      event.currentTarget.closest("[data-zipper-overlay]") as Element,
      "--zipper-pull-travel"
    )

    updateProgress(
      getProgressFromVerticalDrag(
        dragStartProgress.current,
        event.clientY - dragStartY.current,
        travelDistance
      )
    )
  }

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) {
      return
    }

    activePointer.current = null
    const settledProgress = settleZipperProgress(
      wasOpenAtDragStart.current,
      currentProgress.current
    )

    isOpen.current = settledProgress === 1
    settleToProgress(settledProgress)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const nextProgress = getKeyboardProgress(event.key, currentProgress.current)

    if (nextProgress === null) {
      return
    }

    event.preventDefault()
    isOpen.current = nextProgress >= 0.5

    if (["Home", "End", "Enter", " "].includes(event.key)) {
      settleToProgress(nextProgress as 0 | 1)
    } else {
      updateProgress(nextProgress)
    }
  }

  const progressPercent = Math.round(progress * 100)
  const valueText =
    progress === 1
      ? "Preview routes opened"
      : progress === 0
        ? "Preview routes closed"
        : `Preview routes ${progressPercent}% open`

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

        <ul className={styles.previewList} aria-label="Example powered API routes">
          {PREVIEWS.map((preview) => (
            <li key={preview} className={styles.previewCard} data-zipper-card>
              <code>{preview}</code>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.zipperOverlay} data-zipper-overlay>
        <span className={styles.seam} aria-hidden="true">
          <span className={styles.teeth}>
            {ZIPPER_TEETH.map((tooth) => (
              <span key={tooth} className={styles.tooth} />
            ))}
          </span>
        </span>
        <div
          aria-label="Preview route zipper"
          aria-describedby="zipper-instruction"
          aria-orientation="vertical"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progressPercent}
          aria-valuetext={valueText}
          className={styles.zipperControl}
          data-zipper-pull
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={handleKeyDown}
          onLostPointerCapture={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          role="slider"
          tabIndex={0}
        >
          <span className={styles.pull} aria-hidden="true">
            <span className={styles.pullGrip} />
          </span>
        </div>
        <p id="zipper-instruction" className={styles.instruction}>
          <span className={styles.mouseInstruction}>Right-drag zipper</span>
          <span className={styles.touchInstruction}>Drag zipper</span>
        </p>
        <span className={styles.zipperOrigin} data-zipper-origin />
      </div>
    </div>
  )
}

export { HeroZipperScene }
