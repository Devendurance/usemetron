type PointerKind = "mouse" | "touch" | "pen" | string

function clampProgress(progress: number) {
  return Math.min(1, Math.max(0, progress))
}

function isZipperDragStart(pointerType: PointerKind, button: number) {
  return pointerType === "touch" || (pointerType === "mouse" && button === 2)
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
  isZipperDragStart,
  settleZipperProgress,
}
