import { describe, expect, it } from "vitest"

import {
  getKeyboardProgress,
  getProgressFromVerticalDrag,
  isZipperDragStart,
  settleZipperProgress,
} from "./hero-zipper-gesture"

describe("isZipperDragStart", () => {
  it("accepts only the secondary mouse button for mouse input", () => {
    expect(isZipperDragStart("mouse", 2)).toBe(true)
    expect(isZipperDragStart("mouse", 0)).toBe(false)
    expect(isZipperDragStart("mouse", 1)).toBe(false)
  })

  it("accepts touch input and rejects unspecified pointer types", () => {
    expect(isZipperDragStart("touch", 0)).toBe(true)
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
