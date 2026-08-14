"use client"

import { AlertCircle, FileUp, Loader2, Route, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"

import { EmptyState } from "@/components/metron"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  OpenApiClientError,
  parseErrorMessage,
  parseOpenApiSpec,
  type DiscoveredOperation,
} from "@/lib/openapi/client"

const MAX_SPEC_BYTES = 1024 * 1024
const ACCEPTED_EXTENSIONS = /\.(json|ya?ml)$/i

function ImportInput({
  specText,
  onSpecTextChange,
  sourceName,
  onSourceNameChange,
  onParsed,
}: {
  specText: string
  onSpecTextChange: (value: string) => void
  sourceName: string | null
  onSourceNameChange: (value: string | null) => void
  onParsed: (operations: DiscoveredOperation[], sourceName: string | null) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: ({ spec, fileName }: { spec: string; fileName?: string }) =>
      parseOpenApiSpec(spec, fileName),
  })

  // Advance to the review step only when the parse returned operations.
  useEffect(() => {
    if (mutation.isSuccess && mutation.data.operations.length > 0) {
      onParsed(mutation.data.operations, sourceName)
    }
  }, [mutation.isSuccess, mutation.data, sourceName, onParsed])

  function updateSpec(value: string) {
    onSpecTextChange(value)
    setFileError(null)
    mutation.reset()
  }

  function pickFile(file: File | undefined) {
    if (file === undefined) return
    if (!ACCEPTED_EXTENSIONS.test(file.name)) {
      setFileError("Choose a .json, .yaml or .yml file.")
      return
    }
    if (file.size > MAX_SPEC_BYTES) {
      setFileError(
        `That file is larger than the 1 MiB limit (${formatBytes(file.size)}). Trim it and try again.`
      )
      return
    }
    setFileError(null)
    void file
      .text()
      .then((text) => {
        // Clear any stale parse alert from a previous attempt before the
        // fresh file content replaces the textarea.
        mutation.reset()
        onSpecTextChange(text)
        onSourceNameChange(file.name)
      })
      .catch(() => {
        setFileError("Could not read that file. Try pasting the spec instead.")
      })
  }

  function runParse() {
    const spec = specText.trim()
    if (spec === "") {
      setFileError("Paste an OpenAPI spec or upload a file first.")
      return
    }
    setFileError(null)
    mutation.mutate({
      spec,
      ...(sourceName !== null ? { fileName: sourceName } : {}),
    })
  }

  const parseError =
    mutation.error instanceof OpenApiClientError
      ? parseErrorMessage(mutation.error.code, mutation.error.reason)
      : mutation.error
        ? "Something went wrong on our side. Please try again."
        : null

  if (mutation.isSuccess && mutation.data.operations.length === 0) {
    return (
      <section className="relative mt-10 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-magenta min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
        <EmptyState
          title="No operations found"
          description="This document is valid OpenAPI, but it doesn't define any operations under paths. Add some paths and parse again."
          icon={<Route aria-hidden="true" />}
          action={
            <Button
              type="button"
              onClick={() => {
                mutation.reset()
                onSourceNameChange(null)
              }}
              className="min-h-11 rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover"
            >
              Back to the spec
            </Button>
          }
        />
      </section>
    )
  }

  return (
    <section className="relative mt-10 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-magenta min-[600px]:mt-8 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
      {mutation.isPending ? (
        <div aria-live="polite" aria-label="Parsing OpenAPI spec" className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-ink">
            <Spinner className="size-4 text-blueprint" />
            Parsing your spec and discovering operations…
          </div>
          <Skeleton className="h-14 w-full bg-cream" />
          <Skeleton className="h-14 w-full bg-cream" />
          <Skeleton className="h-14 w-full bg-cream" />
        </div>
      ) : (
        <>
          {parseError !== null && (
            <div role="alert" className="mb-6 flex items-start gap-3 rounded-control border border-failure-red/30 bg-failure-red/10 p-4">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-failure-red" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-bold text-ink">Could not parse this spec</p>
                <p className="mt-1 text-muted-ink">{parseError}</p>
                {mutation.error instanceof OpenApiClientError &&
                  mutation.error.code === "UNAUTHENTICATED" && (
                    <p className="mt-1 text-muted-ink">Sign in again and retry.</p>
                  )}
              </div>
            </div>
          )}

          <FieldGroup>
            <Field data-invalid={fileError !== null}>
              <FieldLabel htmlFor="openapi-spec-text">
                OpenAPI document <span aria-hidden="true">*</span>
                <span className="sr-only"> required</span>
              </FieldLabel>
              <textarea
                id="openapi-spec-text"
                value={specText}
                onChange={(event) => updateSpec(event.target.value)}
                disabled={mutation.isPending}
                aria-invalid={fileError !== null}
                aria-busy={mutation.isPending}
                aria-describedby={
                  fileError !== null
                    ? "openapi-spec-error openapi-spec-help"
                    : "openapi-spec-help"
                }
                className="min-h-64 w-full resize-y rounded-control border-2 border-ink bg-cream px-4 py-3 font-mono text-xs leading-relaxed text-ink outline-none focus-visible:shadow-focus placeholder:text-muted-ink disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
                placeholder={"openapi: 3.1.0\ninfo:\n  title: My API\n  version: 1.0.0\nservers:\n  - url: https://api.example.com\npaths:\n  /prices:\n    get:\n      summary: Get prices\n      responses:\n        '200':\n          description: OK"}
                rows={12}
              />
              <FieldDescription id="openapi-spec-help">
                Paste a self-contained OpenAPI 3.0.x or 3.1.x document (JSON or YAML), or
                upload a .json / .yaml / .yml file up to 1 MiB.
              </FieldDescription>
              {fileError !== null && (
                <FieldError id="openapi-spec-error">{fileError}</FieldError>
              )}
            </Field>
          </FieldGroup>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button
              type="button"
              onClick={runParse}
              disabled={mutation.isPending}
              className="min-h-12 rounded-pill border-2 border-ink bg-lime px-6 font-bold text-ink hover:bg-lime-hover"
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="size-4" aria-hidden="true" />
              )}
              {mutation.isPending ? "Parsing…" : "Parse spec"}
            </Button>

            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border-2 border-ink bg-clear-paper px-5 text-sm font-bold text-ink hover:bg-cream focus-within:shadow-focus focus-visible:outline-none">
              <FileUp className="size-4" aria-hidden="true" />
              Choose file
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml"
                disabled={mutation.isPending}
                className="sr-only"
                onChange={(event) => {
                  pickFile(event.target.files?.[0])
                  if (fileInputRef.current) fileInputRef.current.value = ""
                }}
              />
            </label>

            {sourceName !== null && (
              <p className="text-sm text-muted-ink">
                Loaded: <span className="font-bold text-ink">{sourceName}</span>
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export { ImportInput }
