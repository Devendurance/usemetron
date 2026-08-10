"use client"

import { useRef, useState } from "react"
import { useGSAP } from "@gsap/react"
import { gsap } from "gsap"

import {
  getKeyboardProgress,
  getProgressFromVerticalDrag,
  getSettledZipperEndpoint,
  isZipperDragStart,
  resolvePointerEndProgress,
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
  const applyReducedVisual = useRef<((open: boolean) => void) | null>(null)
  const reduceMotion = useRef(false)
  const activePointer = useRef<number | null>(null)
  const dragStartProgress = useRef(0)
  const dragStartY = useRef(0)
  const wasOpenAtDragStart = useRef(false)
  const isOpen = useRef(false)
  const currentProgress = useRef(0)
  const [progress, setProgress] = useState(0)
  const [routesExposed, setRoutesExposed] = useState(false)

  const updateProgress = (nextProgress: number, commit = false) => {
    const boundedProgress = clampProgress(nextProgress)

    if (reduceMotion.current) {
      applyReducedVisual.current?.(isOpen.current)
    } else {
      timeline.current?.progress(boundedProgress).pause()
    }

    currentProgress.current = boundedProgress
    if (boundedProgress !== 1) {
      setRoutesExposed(false)
    }
    if (commit) {
      setProgress(boundedProgress)
    }
  }

  const settleToProgress = (nextProgress: 0 | 1) => {
    settleTween.current?.kill()
    isOpen.current = nextProgress === 1
    setRoutesExposed(false)

    if (reduceMotion.current || !timeline.current) {
      updateProgress(nextProgress, true)
      setRoutesExposed(nextProgress === 1)
      return
    }

    settleTween.current = gsap.to(currentProgress, {
      current: nextProgress,
      duration: 0.32,
      ease: "power3.out",
      onUpdate: () => updateProgress(currentProgress.current),
      onComplete: () => {
        updateProgress(nextProgress, true)
        setRoutesExposed(nextProgress === 1)
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
          const zipperOriginPosition = () => {
            const sceneBounds = scene.getBoundingClientRect()
            const originBounds = zipperOrigin.getBoundingClientRect()

            return {
              x: originBounds.left + originBounds.width / 2 - sceneBounds.left,
              y: originBounds.top + originBounds.height / 2 - sceneBounds.top,
            }
          }
          const measureCards = () => {
            const origin = zipperOriginPosition()

            return cards.map((card) => ({
              closedX: origin.x - card.offsetLeft,
              closedY: origin.y - card.offsetTop,
              rotation: readRotation(card),
            }))
          }
          let cardGeometry = measureCards()
          const cardRotation = (index: number) => cardGeometry[index].rotation

          gsap.set([leftShutter, rightShutter], { opacity: 0.94, xPercent: 0 })
          gsap.set(pull, { y: 0 })

          if (shouldReduceMotion) {
            const setReducedVisual = (open: boolean) => {
              gsap.set([leftShutter, rightShutter], {
                opacity: open ? 0 : 0.94,
                xPercent: 0,
              })
              gsap.set(pull, { y: 0 })
              gsap.set(cards, {
                opacity: open ? 1 : 0,
                rotation: (index) => cardRotation(index),
                rotationX: 0,
                rotationY: 0,
                x: 0,
                xPercent: -50,
                y: 0,
                yPercent: -50,
              })
            }

            timeline.current = null
            applyReducedVisual.current = setReducedVisual
            setReducedVisual(isOpen.current)

            return () => {
              if (applyReducedVisual.current === setReducedVisual) {
                applyReducedVisual.current = null
              }
            }
          }

          applyReducedVisual.current = null
          const pullTravel = readCssNumber(
            zipperOverlay,
            "--zipper-pull-travel"
          )
          const perspectiveTilt = conditions.desktop
            ? 13
            : conditions.tablet
              ? 9
              : 6
          const sceneTimeline = gsap.timeline({ paused: true })

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
            .fromTo(
              cards,
              {
                opacity: 0,
                rotation: 0,
                rotationX: perspectiveTilt,
                rotationY: (index) => (index % 2 === 0 ? -8 : 8),
                x: (index) => cardGeometry[index].closedX,
                xPercent: -50,
                y: (index) => cardGeometry[index].closedY,
                yPercent: -50,
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
                duration: 0.5,
                stagger: 0.055,
                ease: "power3.out",
              },
              0.22
            )

          sceneTimeline.to(cards, {
            y: 0,
            rotation: (index) => cardRotation(index),
            rotationX: 0,
            rotationY: 0,
            duration: 0.18,
            stagger: 0.035,
            ease: "power2.out",
          }, 0.85)

          timeline.current = sceneTimeline.progress(currentProgress.current).pause()
          const resizeObserver = new ResizeObserver(() => {
            const visualProgress = currentProgress.current

            cardGeometry = measureCards()
            sceneTimeline.invalidate().progress(visualProgress).pause()
          })

          resizeObserver.observe(scene)

          return () => {
            resizeObserver.disconnect()
            settleTween.current?.kill()
            settleTween.current = null
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
        applyReducedVisual.current = null
        media.revert()
      }
    },
    { scope: root }
  )

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      activePointer.current !== null ||
      !isZipperDragStart(event.pointerType, event.button)
    ) {
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

  const finishPointerGesture = (
    event: React.PointerEvent<HTMLDivElement>,
    wasCancelled: boolean
  ) => {
    if (activePointer.current !== event.pointerId) {
      return
    }

    activePointer.current = null
    const settledProgress = resolvePointerEndProgress(
      wasOpenAtDragStart.current,
      currentProgress.current,
      wasCancelled
    )

    if (!wasCancelled && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    settleToProgress(settledProgress)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const nextProgress = getKeyboardProgress(event.key, currentProgress.current)

    if (nextProgress === null) {
      return
    }

    event.preventDefault()
    settleTween.current?.kill()
    settleTween.current = null

    if (["Home", "End", "Enter", " "].includes(event.key)) {
      settleToProgress(nextProgress as 0 | 1)
    } else {
      const previousEndpoint = isOpen.current ? 1 : 0
      const nextEndpoint = getSettledZipperEndpoint(
        previousEndpoint,
        nextProgress
      )

      isOpen.current = nextEndpoint === 1
      updateProgress(nextProgress, true)
      setRoutesExposed(nextProgress === 1 && nextEndpoint === 1)
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

        <ul
          aria-hidden={!routesExposed}
          aria-label="Example powered API routes"
          className={styles.previewList}
        >
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
          onLostPointerCapture={(event) => finishPointerGesture(event, true)}
          onPointerCancel={(event) => finishPointerGesture(event, true)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => finishPointerGesture(event, false)}
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
