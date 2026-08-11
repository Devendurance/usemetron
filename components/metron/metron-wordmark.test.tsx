import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { MetronWordmark } from "./metron-wordmark"

describe("MetronWordmark", () => {
  it("renders one accessible METRON text wordmark without SVG icon markup", () => {
    const markup = renderToStaticMarkup(<MetronWordmark />)

    expect(markup).toContain('aria-label="Metron"')
    expect(markup.match(/Metron/g)).toHaveLength(1)
    expect(markup.replace(/<[^>]*>/g, "")).toBe("METRON")
    expect(markup).not.toContain("<svg")
  })
})
