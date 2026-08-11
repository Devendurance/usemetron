import { describe, expect, it } from "vitest"

import {
  getKeyboardProgress,
  getProgressFromVerticalDrag,
  getProgressFromVerticalWheel,
  getSettledZipperEndpoint,
  isZipperDragStart,
  isMostlyHorizontalWheelGesture,
  normalizeWheelDelta,
  resolvePointerEndProgress,
  settleZipperProgress,
} from "./hero-zipper-gesture"

describe("isZipperDragStart", () => {
  it("rejects all mouse buttons", () => {
    expect(isZipperDragStart("mouse", 0)).toBe(false)
    expect(isZipperDragStart("mouse", 1)).toBe(false)
    expect(isZipperDragStart("mouse", 2)).toBe(false)
  })

  it("accepts touch primary-button input and rejects other pointer types", () => {
    expect(isZipperDragStart("touch", 0)).toBe(true)
    expect(isZipperDragStart("touch", 1)).toBe(false)
    expect(isZipperDragStart("pen", 0)).toBe(false)
  })
})

describe("getProgressFromVerticalDrag", () => {
  it("maps downward travel to normalized progress", () => {
    expect(getProgressFromVerticalDrag(0, 70, 100)).toBe(0.7)
    expect(getProgressFromVerticalDrag(0.8, -40, 100)).toBe(0.4)
  })

  it("clamps progress and handles an unusable travel distance", () => {
    expect(getProgressFromVerticalDrag(0.8, 50, 100)).toBe(1)
    expect(getProgressFromVerticalDrag(0.2, -50, 100)).toBe(0)
    expect(getProgressFromVerticalDrag(0.4, 50, 0)).toBe(0.4)
  })
})

describe("normalizeWheelDelta", () => {
  it("keeps pixel deltas unchanged and converts line/page deltas", () => {
    expect(normalizeWheelDelta(8, 40, 0)).toEqual({ deltaX: 8, deltaY: 40 })
    expect(normalizeWheelDelta(1, 3, 1, 20)).toEqual({
      deltaX: 20,
      deltaY: 60,
    })
    expect(normalizeWheelDelta(0, -1, 2, 16, 900)).toEqual({
      deltaX: 0,
      deltaY: -900,
    })
  })
})

describe("isMostlyHorizontalWheelGesture", () => {
  it("rejects mostly horizontal wheel intent", () => {
    expect(isMostlyHorizontalWheelGesture(50, 25)).toBe(true)
    expect(isMostlyHorizontalWheelGesture(24, 25)).toBe(false)
  })
})

describe("getProgressFromVerticalWheel", () => {
  it("opens on downward wheel movement and closes on upward movement", () => {
    expect(getProgressFromVerticalWheel(0.25, 100, 100)).toBe(0.5)
    expect(getProgressFromVerticalWheel(0.75, -100, 100)).toBe(0.5)
  })

  it("clamps progress at the endpoints and ignores unusable travel", () => {
    expect(getProgressFromVerticalWheel(0.95, 80, 100)).toBe(1)
    expect(getProgressFromVerticalWheel(0.05, -80, 100)).toBe(0)
    expect(getProgressFromVerticalWheel(0.4, 80, 0)).toBe(0.4)
  })
})

describe("settleZipperProgress", () => {
  it("opens a closed zipper at the seventy-percent threshold", () => {
    expect(settleZipperProgress(false, 0.7)).toBe(1)
    expect(settleZipperProgress(false, 0.699)).toBe(0)
  })

  it("closes an open zipper at the thirty-percent threshold", () => {
    expect(settleZipperProgress(true, 0.3)).toBe(0)
    expect(settleZipperProgress(true, 0.301)).toBe(1)
  })
})

describe("getSettledZipperEndpoint", () => {
  it("keeps a closed endpoint authoritative through partial keyboard progress", () => {
    expect(getSettledZipperEndpoint(0, 0.5)).toBe(0)
    expect(settleZipperProgress(false, 0.5)).toBe(0)
    expect(settleZipperProgress(false, 0.7)).toBe(1)
  })

  it("keeps an open endpoint authoritative through partial keyboard progress", () => {
    expect(getSettledZipperEndpoint(1, 0.5)).toBe(1)
    expect(settleZipperProgress(true, 0.5)).toBe(1)
    expect(settleZipperProgress(true, 0.3)).toBe(0)
  })

  it("changes the settled endpoint only at an exact endpoint", () => {
    expect(getSettledZipperEndpoint(0, 1)).toBe(1)
    expect(getSettledZipperEndpoint(1, 0)).toBe(0)
  })
})

describe("resolvePointerEndProgress", () => {
  it("uses threshold settlement after a successful pointer up", () => {
    expect(resolvePointerEndProgress(false, 0.7, false)).toBe(1)
    expect(resolvePointerEndProgress(true, 0.3, false)).toBe(0)
  })

  it("restores the prior endpoint after cancellation or lost capture", () => {
    expect(resolvePointerEndProgress(false, 0.9, true)).toBe(0)
    expect(resolvePointerEndProgress(true, 0.1, true)).toBe(1)
  })
})

describe("getKeyboardProgress", () => {
  it("adjusts progress with vertical arrows and endpoint keys", () => {
    expect(getKeyboardProgress("ArrowDown", 0.4)).toBe(0.5)
    expect(getKeyboardProgress("ArrowUp", 0.4)).toBeCloseTo(0.3)
    expect(getKeyboardProgress("End", 0.4)).toBe(1)
    expect(getKeyboardProgress("Home", 0.4)).toBe(0)
  })

  it("toggles with Enter or Space and ignores unrelated keys", () => {
    expect(getKeyboardProgress("Enter", 0.4)).toBe(1)
    expect(getKeyboardProgress(" ", 0.6)).toBe(0)
    expect(getKeyboardProgress("Tab", 0.4)).toBeNull()
  })
})
