import { cn } from "@/lib/utils"

type MetronReceiptProps = Omit<React.ComponentProps<"figure">, "children"> & {
  callId?: React.ReactNode
  route?: React.ReactNode
  price?: React.ReactNode
  network?: React.ReactNode
  status?: React.ReactNode
  response?: React.ReactNode
  caller?: React.ReactNode
  transaction?: React.ReactNode
}

function receiptValue(value: React.ReactNode) {
  return value === undefined || value === null || value === "" ? "—" : value
}

function MetronReceipt({
  className,
  callId,
  route,
  price,
  network,
  status,
  response,
  caller,
  transaction,
  ...props
}: MetronReceiptProps) {
  const rows = [
    ["Route", route],
    ["Price", price],
    ["Network", network],
    ["Status", status],
    ["Response", response],
    ["Caller", caller],
    ["Tx", transaction],
  ] as const

  return (
    <figure
      data-slot="metron-receipt"
      className={cn(
        "w-full rounded-card bg-clear-paper p-6 text-ink sm:p-8",
        className
      )}
      {...props}
    >
      <figcaption className="flex flex-wrap items-baseline gap-2 border-b border-border pb-4 font-metadata text-sm font-bold tracking-[0.04em]">
        <span>Metron Call</span>
        <span className="text-muted-ink">/ {receiptValue(callId)}</span>
      </figcaption>
      <dl className="grid gap-3 pt-5 font-metadata text-[0.8125rem] leading-[1.35]">
        {rows.map(([label, value]) => (
          <div
            key={label}
            data-slot="metron-receipt-row"
            className="grid min-w-0 grid-cols-[minmax(5.5rem,0.35fr)_minmax(0,1fr)] gap-3"
          >
            <dt className="font-bold tracking-[0.04em] text-muted-ink">{label}</dt>
            <dd className="min-w-0 break-words font-semibold tabular-nums">
              <span aria-hidden="true">/ </span>
              {receiptValue(value)}
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  )
}

export { MetronReceipt }
export type { MetronReceiptProps }
