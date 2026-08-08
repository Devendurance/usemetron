import { PageHeading } from "@/components/dashboard/dashboard-primitives"
import { TransactionsList } from "@/components/dashboard/transactions-list"

export default function TransactionsPage() {
  return <div><PageHeading eyebrow="Transactions" title="Call receipts and settlement evidence" description="Filter completed activity when routes are connected. This view never fills gaps with fabricated transaction data." /><TransactionsList /></div>
}
