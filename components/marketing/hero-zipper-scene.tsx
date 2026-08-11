"use client"

import { useRef, useState } from "react"
import { useGSAP } from "@gsap/react"
import { gsap } from "gsap"

import {
  getKeyboardProgress,
  getProgressFromVerticalDrag,
  getProgressFromVerticalWheel,
  getSettledZipperEndpoint,
  isZipperDragStart,
  isMostlyHorizontalWheelGesture,
  normalizeWheelDelta,
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

function readWheelLineHeight(element: Element) {
  return readCssNumber(element, "line-height") || 16
}

function getSettleDuration(current: number, next: 0 | 1) {
  return Math.min(0.58, Math.max(0.24, 0.24 + Math.abs(current - next) * 0.34))
}

function HeroZipperScene() {
  const root = useRef<HTMLDivElement>(null)
  const timeline = useRef<gsap.core.Timeline | null>(null)
  const progressTween = useRef<gsap.core.Tween | null>(null)
  const breathingTween = useRef<gsap.core.Tween | null>(null)
  const applyReducedVisual = useRef<((open: boolean) => void) | null>(null)
  const reduceMotion = useRef(false)
  const activePointer = useRef<number | null>(null)
  const dragStartProgress = useRef(0)
  const dragStartY = useRef(0)
  const wasOpenAtDragStart = useRef(false)
  const isOpen = useRef(false)
  const cardsRef = useRef<HTMLElement[]>([])
  const currentProgress = useRef(0)
  const pullTravel = useRef(0)
  const routesExposedRef = useRef(false)
  const [progress, setProgress] = useState(0)
  const [routesExposed, setRoutesExposed] = useState(false)

  const updateRoutesExposed = (nextRoutesExposed: boolean) => {
    routesExposedRef.current = nextRoutesExposed
    setRoutesExposed(nextRoutesExposed)
  }

  const stopCardBreathing = () => {
    breathingTween.current?.kill()
    breathingTween.current = null

    if (cardsRef.current.length > 0) {
      gsap.set(cardsRef.current, { y: 0, scale: 1 })
    }
  }

  const syncCardBreathing = () => {
    if (
      reduceMotion.current ||
      currentProgress.current !== 1 ||
      !routesExposedRef.current ||
      cardsRef.current.length === 0
    ) {
      stopCardBreathing()
      return
    }

    if (breathingTween.current) {
      return
    }

    breathingTween.current = gsap.to(cardsRef.current, {
      y: -1.5,
      scale: 1.008,
      duration: 4.5,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
      stagger: 0.65,
    })
  }

  const updateProgress = (nextProgress: number, commit = false) => {
    const boundedProgress = clampProgress(nextProgress)

    if (boundedProgress < 1 || reduceMotion.current) {
      stopCardBreathing()
    }

    if (reduceMotion.current) {
      applyReducedVisual.current?.(boundedProgress === 1)
    } else {
      timeline.current?.progress(boundedProgress).pause()
    }

    currentProgress.current = boundedProgress
    if (
      (boundedProgress === 0 || boundedProgress === 1) &&
      activePointer.current === null
    ) {
      isOpen.current = boundedProgress === 1
    }
    if (boundedProgress !== 1 && routesExposedRef.current) {
      updateRoutesExposed(false)
    }
    if (commit) {
      setProgress(boundedProgress)
    }
  }

  const settleToProgress = (nextProgress: 0 | 1) => {
    progressTween.current?.kill()
    isOpen.current = nextProgress === 1
    updateRoutesExposed(false)

    if (reduceMotion.current || !timeline.current) {
      updateProgress(nextProgress, true)
      updateRoutesExposed(nextProgress === 1)
      syncCardBreathing()
      return
    }

    progressTween.current = gsap.to(currentProgress, {
      current: nextProgress,
      duration: getSettleDuration(currentProgress.current, nextProgress),
      ease: "power3.inOut",
      onUpdate: () => updateProgress(currentProgress.current),
      onComplete: () => {
        updateProgress(nextProgress, true)
        updateRoutesExposed(nextProgress === 1)
        syncCardBreathing()
        progressTween.current = null
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
      const pull = select("[data-zipper-pull]")[0]
      const zipperOverlay = select("[data-zipper-overlay]")[0]
      const zipperOrigin = select("[data-zipper-origin]")[0]
      const cards = select("[data-zipper-card]") as HTMLElement[]
      const media = gsap.matchMedia()

      if (!pull || !zipperOverlay || !zipperOrigin || cards.length === 0) {
        return
      }

      cardsRef.current = cards

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
          if (shouldReduceMotion) {
            stopCardBreathing()
          }
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
          let wheelLineHeight = 16
          let sceneTimeline: gsap.core.Timeline | null = null
          const cardRotation = (index: number) => cardGeometry[index].rotation
          const wheelTarget = scene.parentElement
          const refreshSceneMetrics = () => {
            cardGeometry = measureCards()
            pullTravel.current = readCssNumber(
              zipperOverlay,
              "--zipper-pull-travel"
            )
            wheelLineHeight = wheelTarget
              ? readWheelLineHeight(wheelTarget)
              : wheelLineHeight
          }
          const handleWheel = (event: WheelEvent) => {
            if (!conditions.desktop || !wheelTarget || activePointer.current !== null) {
              return
            }

            const normalized = normalizeWheelDelta(
              event.deltaX,
              event.deltaY,
              event.deltaMode,
              wheelLineHeight,
              wheelTarget.clientHeight || window.innerHeight || 1
            )

            if (
              normalized.deltaY === 0 ||
              isMostlyHorizontalWheelGesture(
                normalized.deltaX,
                normalized.deltaY
              )
            ) {
              return
            }

            progressTween.current?.kill()
            progressTween.current = null

            const visualProgress = currentProgress.current
            const nextProgress = reduceMotion.current
              ? normalized.deltaY > 0
                ? 1
                : 0
              : getProgressFromVerticalWheel(
                  visualProgress,
                  normalized.deltaY,
                  pullTravel.current
                )

            if (Math.abs(nextProgress - visualProgress) < 0.0001) {
              return
            }

            event.preventDefault()

            if (reduceMotion.current) {
              isOpen.current = nextProgress === 1
              updateProgress(nextProgress, true)
              updateRoutesExposed(nextProgress === 1)
              return
            }

            progressTween.current = gsap.to(currentProgress, {
              current: nextProgress,
              duration: 0.21,
              ease: "power2.out",
              overwrite: "auto",
              onUpdate: () => updateProgress(currentProgress.current, true),
              onComplete: () => {
                updateProgress(nextProgress, true)
                updateRoutesExposed(nextProgress === 1)
                syncCardBreathing()
                progressTween.current = null
              },
            })
          }
          const resizeObserver = new ResizeObserver(() => {
            const visualProgress = currentProgress.current

            refreshSceneMetrics()
            if (shouldReduceMotion) {
              applyReducedVisual.current?.(visualProgress === 1)
              return
            }

            sceneTimeline?.invalidate().progress(visualProgress).pause()
          })

          gsap.set(pull, { y: 0 })
          refreshSceneMetrics()
          resizeObserver.observe(scene)
          if (wheelTarget) {
            wheelTarget.addEventListener("wheel", handleWheel, { passive: false })
          }

          if (shouldReduceMotion) {
            const setReducedVisual = (open: boolean) => {
              gsap.set(pull, { y: open ? pullTravel.current : 0 })
              gsap.set(cards, {
                autoAlpha: open ? 1 : 0,
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
              resizeObserver.disconnect()
              if (wheelTarget) {
                wheelTarget.removeEventListener("wheel", handleWheel)
              }
              progressTween.current?.kill()
              progressTween.current = null
              if (applyReducedVisual.current === setReducedVisual) {
                applyReducedVisual.current = null
              }
            }
          }

          applyReducedVisual.current = null
          const perspectiveTilt = conditions.desktop
            ? 13
            : conditions.tablet
              ? 9
              : 6
          sceneTimeline = gsap.timeline({ paused: true })

          sceneTimeline
            .to(
              pull,
              {
                y: () => pullTravel.current,
                duration: 1.2,
                ease: "none",
              },
              0
            )
            .fromTo(
              cards,
              {
                autoAlpha: 0,
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
                autoAlpha: 1,
                duration: 0.5,
                stagger: 0.055,
                ease: "power3.inOut",
              },
              0.14
            )
            .to(cards, {
              y: 0,
              rotation: (index) => cardRotation(index),
              rotationX: 0,
              rotationY: 0,
              duration: 0.2,
              stagger: 0.035,
              ease: "power3.inOut",
            }, ">")

          timeline.current = sceneTimeline.progress(currentProgress.current).pause()
          syncCardBreathing()

          return () => {
            resizeObserver.disconnect()
            if (wheelTarget) {
              wheelTarget.removeEventListener("wheel", handleWheel)
            }
            progressTween.current?.kill()
            progressTween.current = null
            stopCardBreathing()
            if (timeline.current === sceneTimeline) {
              timeline.current = null
            }
            sceneTimeline?.kill()
          }
        }
      )

      return () => {
        progressTween.current?.kill()
        progressTween.current = null
        stopCardBreathing()
        cardsRef.current = []
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
    progressTween.current?.kill()
    progressTween.current = null
    if (currentProgress.current === 1 || routesExposedRef.current) {
      stopCardBreathing()
    }
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
    updateProgress(
      getProgressFromVerticalDrag(
        dragStartProgress.current,
        event.clientY - dragStartY.current,
        pullTravel.current
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
    progressTween.current?.kill()
    progressTween.current = null

    if (nextProgress < currentProgress.current) {
      stopCardBreathing()
    }

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
      updateRoutesExposed(nextProgress === 1 && nextEndpoint === 1)
      syncCardBreathing()
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
        <ul
          aria-hidden={!routesExposed}
          aria-label="Powered API route previews"
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
          <span className={styles.mouseInstruction}>Scroll over hero</span>
          <span className={styles.touchInstruction}>Drag zipper</span>
        </p>
        <span className={styles.zipperOrigin} data-zipper-origin />
      </div>
    </div>
  )
}

export { HeroZipperScene }
