import { PageHeading } from "@/components/dashboard/dashboard-primitives"
import { SettingsPanels } from "@/components/dashboard/settings-panels"

export default function SettingsPage() {
  return <div><PageHeading eyebrow="Settings" title="Wallet, account, and attribution" description="Inspect connection and Celo attribution states locally before a wallet provider or settlement integration is connected." /><SettingsPanels /></div>
}
