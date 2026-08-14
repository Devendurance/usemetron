"use client"

import { Check } from "lucide-react"
import { useCallback, useState } from "react"

import { ImportConfigure, type ConfigureItem } from "@/components/dashboard/openapi/import-configure"
import { ImportInput } from "@/components/dashboard/openapi/import-input"
import { ImportPublishResults } from "@/components/dashboard/openapi/import-publish-results"
import { OperationReview } from "@/components/dashboard/openapi/operation-review"
import {
  parsePublicHttpsUrl,
  type DiscoveredOperation,
  type PublishOperationInput,
} from "@/lib/openapi/client"
import { cn } from "@/lib/utils"

type Step = "input" | "review" | "configure" | "results"

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "input", label: "Paste" },
  { id: "review", label: "Review" },
  { id: "configure", label: "Configure" },
  { id: "results", label: "Publish" },
]

function operationKey(op: DiscoveredOperation): string {
  return `${op.method} ${op.path}`
}

/** Human route name from the operation; server caps names at 120 chars. */
function defaultNameFor(op: DiscoveredOperation): string {
  const name = op.operationId ?? `${op.method.toUpperCase()} ${op.path}`
  return name.slice(0, 120)
}

function defaultDescriptionFor(op: DiscoveredOperation): string | undefined {
  const description = op.summary ?? op.description
  return description !== null && description !== undefined
    ? description.slice(0, 1000)
    : undefined
}

function OpenApiImportFlow() {
  const [step, setStep] = useState<Step>("input")
  const [specText, setSpecText] = useState("")
  const [sourceName, setSourceName] = useState<string | null>(null)
  const [operations, setOperations] = useState<DiscoveredOperation[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [baseUrlOverride, setBaseUrlOverride] = useState("")
  const [payload, setPayload] = useState<PublishOperationInput[]>([])

  const handleParsed = useCallback((ops: DiscoveredOperation[], fileName: string | null) => {
    setOperations(ops)
    setSourceName(fileName)
    setSelectedKeys(new Set())
    setBaseUrlOverride("")
    setPayload([])
    setStep("review")
  }, [])

  function toggleKey(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const baseUrlValid = parsePublicHttpsUrl(baseUrlOverride) !== null

  function isPublishable(op: DiscoveredOperation): boolean {
    return op.publishable || (op.effectiveServerUrl === null && baseUrlValid)
  }

  function toggleAllPublishable() {
    setSelectedKeys(
      new Set(operations.filter((op) => isPublishable(op)).map((op) => operationKey(op)))
    )
  }

  function clearAll() {
    setSelectedKeys(new Set())
  }

  function changeBaseUrlOverride(value: string) {
    setBaseUrlOverride(value)
    // Ops that relied on the override lose their base URL the moment it is
    // invalid or empty — drop them from the selection so "Continue" never
    // ships an unresolvable upstream.
    if (parsePublicHttpsUrl(value) === null) {
      setSelectedKeys((current) => {
        const needsOverride = new Set(
          operations.filter((op) => op.effectiveServerUrl === null).map((op) => operationKey(op))
        )
        return new Set([...current].filter((key) => !needsOverride.has(key)))
      })
    }
  }

  function buildConfigureItems(): ConfigureItem[] {
    const baseUrl = parsePublicHttpsUrl(baseUrlOverride)
    const base = baseUrl !== null ? baseUrl.toString().replace(/\/+$/, "") : null
    return operations
      .filter((op) => selectedKeys.has(operationKey(op)))
      .map((op) => {
        const server =
          op.effectiveServerUrl !== null ? op.effectiveServerUrl.replace(/\/+$/, "") : base
        return {
          key: operationKey(op),
          op,
          upstreamUrl: server !== null ? `${server}${op.path}` : "",
          defaultName: defaultNameFor(op),
          ...(defaultDescriptionFor(op) !== undefined
            ? { defaultDescription: defaultDescriptionFor(op) }
            : {}),
        }
      })
  }

  function resetFlow() {
    setStep("input")
    setSpecText("")
    setSourceName(null)
    setOperations([])
    setSelectedKeys(new Set())
    setBaseUrlOverride("")
    setPayload([])
  }

  const stepIndex = STEPS.findIndex((candidate) => candidate.id === step)

  return (
    <div>
      <nav aria-label="Import progress" className="mt-10 flex flex-wrap items-center gap-2">
        {STEPS.map((candidate, index) => {
          const active = candidate.id === step
          const complete = index < stepIndex
          return (
            <span
              key={candidate.id}
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-pill border-2 border-ink px-4 font-metadata text-xs font-bold tracking-[0.06em]",
                active && "bg-lime text-ink",
                complete && "bg-clear-paper text-muted-ink",
                !active && !complete && "bg-clear-paper text-muted-ink opacity-60"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border-2 border-ink text-[10px]",
                  active && "bg-ink text-lime",
                  complete && "bg-muted-ink text-clear-paper"
                )}
              >
                {complete ? <Check className="size-3" /> : index + 1}
              </span>
              {candidate.label}
            </span>
          )
        })}
      </nav>

      {step === "input" && (
        <ImportInput
          specText={specText}
          onSpecTextChange={setSpecText}
          sourceName={sourceName}
          onSourceNameChange={setSourceName}
          onParsed={handleParsed}
        />
      )}

      {step === "review" && (
        <OperationReview
          operations={operations}
          selectedKeys={selectedKeys}
          onToggle={toggleKey}
          onToggleAllPublishable={toggleAllPublishable}
          onClearAll={clearAll}
          baseUrlOverride={baseUrlOverride}
          onBaseUrlOverrideChange={changeBaseUrlOverride}
          onBack={() => setStep("input")}
          onContinue={() => setStep("configure")}
        />
      )}

      {step === "configure" && (
        <ImportConfigure
          items={buildConfigureItems()}
          onBack={() => setStep("review")}
          onProceed={(nextPayload) => {
            setPayload(nextPayload)
            setStep("results")
          }}
        />
      )}

      {step === "results" && (
        <ImportPublishResults
          payload={payload}
          operations={operations}
          onReset={resetFlow}
        />
      )}
    </div>
  )
}

export { OpenApiImportFlow }
