type PointerKind = "mouse" | "touch" | "pen" | string

const DEFAULT_WHEEL_LINE_HEIGHT = 16
const DEFAULT_WHEEL_PAGE_HEIGHT = 800
const WHEEL_PROGRESS_TRAVEL_MULTIPLIER = 4

function clampProgress(progress: number) {
  return Math.min(1, Math.max(0, progress))
}

function isZipperDragStart(pointerType: PointerKind, button: number) {
  return pointerType === "touch" && button === 0
}

function getProgressFromVerticalDrag(
  startProgress: number,
  deltaY: number,
  travelDistance: number
) {
  if (travelDistance <= 0) {
    return clampProgress(startProgress)
  }

  return clampProgress(startProgress + deltaY / travelDistance)
}

function settleZipperProgress(wasOpen: boolean, progress: number) {
  const clampedProgress = clampProgress(progress)

  return wasOpen ? (clampedProgress <= 0.3 ? 0 : 1) : clampedProgress >= 0.7 ? 1 : 0
}

function normalizeWheelDelta(
  deltaX: number,
  deltaY: number,
  deltaMode: number,
  lineHeight = DEFAULT_WHEEL_LINE_HEIGHT,
  pageHeight = DEFAULT_WHEEL_PAGE_HEIGHT
) {
  const scale =
    deltaMode === 1 ? lineHeight : deltaMode === 2 ? pageHeight : 1

  return {
    deltaX: deltaX * scale,
    deltaY: deltaY * scale,
  }
}

function isMostlyHorizontalWheelGesture(deltaX: number, deltaY: number) {
  return Math.abs(deltaX) > Math.abs(deltaY)
}

function getProgressFromVerticalWheel(
  startProgress: number,
  deltaY: number,
  travelDistance: number
) {
  if (travelDistance <= 0 || deltaY === 0) {
    return clampProgress(startProgress)
  }

  return clampProgress(
    startProgress + deltaY / (travelDistance * WHEEL_PROGRESS_TRAVEL_MULTIPLIER)
  )
}

function getSettledZipperEndpoint(
  previousEndpoint: 0 | 1,
  progress: number
): 0 | 1 {
  const clampedProgress = clampProgress(progress)

  return clampedProgress === 0 || clampedProgress === 1
    ? clampedProgress
    : previousEndpoint
}

function resolvePointerEndProgress(
  wasOpen: boolean,
  progress: number,
  wasCancelled: boolean
) {
  return wasCancelled ? (wasOpen ? 1 : 0) : settleZipperProgress(wasOpen, progress)
}

function getKeyboardProgress(key: string, progress: number) {
  const clampedProgress = clampProgress(progress)

  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return clampProgress(clampedProgress + 0.1)
    case "ArrowUp":
    case "ArrowLeft":
      return clampProgress(clampedProgress - 0.1)
    case "Home":
      return 0
    case "End":
      return 1
    case "Enter":
    case " ":
      return clampedProgress >= 0.5 ? 0 : 1
    default:
      return null
  }
}

export {
  getKeyboardProgress,
  getProgressFromVerticalDrag,
  getProgressFromVerticalWheel,
  getSettledZipperEndpoint,
  isZipperDragStart,
  isMostlyHorizontalWheelGesture,
  normalizeWheelDelta,
  resolvePointerEndProgress,
  settleZipperProgress,
}
