"use client"

import { AlertCircle, ShieldCheck, WalletCards } from "lucide-react"
import { useAccount, useDisconnect, useSwitchChain } from "wagmi"

import { MetronConnectButton } from "@/components/auth/connect-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuth, useSignOut } from "@/lib/auth/use-auth"
import { METRON_SUPPORTED_CHAIN_ID } from "@/lib/web3/config"
import { formatWalletAddress } from "@/lib/web3/format"

function SettingsPanels() {
  const { address, chainId } = useAccount()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const { status, developer } = useAuth()
  const { signOut, isSigningOut } = useSignOut()

  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-2">
      <section className="relative rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-purple min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
        <div className="flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-coral"><WalletCards className="size-5" aria-hidden="true" /></span><div><h2 className="font-heading text-xl font-semibold">Wallet and account</h2><p className="mt-1 text-sm leading-relaxed text-muted-ink">Wallet connection and session status for your creator account.</p></div></div>

        <div className="mt-6 space-y-6">
          <div>
            <p className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Wallet</p>
            {address === undefined ? (
              <div className="mt-3"><MetronConnectButton /></div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="inline-flex min-h-11 items-center rounded-control border-2 border-ink bg-cream px-4 font-metadata text-sm font-bold tracking-[0.04em] text-ink">{formatWalletAddress(address)}</span>
                <Button type="button" variant="outline" onClick={() => disconnect()} className="min-h-11 rounded-pill border-2 border-ink px-5 font-bold" aria-label="Disconnect wallet from this browser (Sign Out above already disconnects)">Disconnect wallet</Button>
              </div>
            )}
          </div>

          <div>
            <p className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Network</p>
            {address === undefined ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-ink">Connect a wallet to check the network.</p>
            ) : chainId !== METRON_SUPPORTED_CHAIN_ID ? (
              <>
                <Alert className="mt-3 border-2 border-blueprint bg-coral text-ink">
                  <AlertCircle className="text-blueprint" aria-hidden="true" />
                  <AlertTitle>Wallet is on the wrong network</AlertTitle><AlertDescription className="text-muted-ink">Switch to Celo to sign in and settle payments.</AlertDescription>
                </Alert>
                <Button type="button" onClick={() => void switchChain({ chainId: METRON_SUPPORTED_CHAIN_ID })} className="mt-3 min-h-11 rounded-pill border-2 border-ink bg-blueprint px-5 font-bold text-clear-paper hover:bg-blueprint/85">SWITCH TO CELO</Button>
              </>
            ) : (
              <p className="mt-3 inline-flex min-h-11 items-center gap-2 font-metadata text-xs font-bold tracking-[0.08em] text-settlement-green"><span className="size-2 shrink-0 rounded-full bg-settlement-green" aria-hidden="true" />Celo Mainnet · 42220</p>
            )}
          </div>

          <div>
            <p className="font-metadata text-xs font-bold tracking-[0.08em] text-muted-ink uppercase">Metron session</p>
            {status === "loading" ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-ink">Checking session…</p>
            ) : status === "authenticated" && developer !== null ? (
              <>
                <Alert className="mt-3 border-border bg-cream text-ink">
                  <ShieldCheck className="text-settlement-green" aria-hidden="true" />
                  <AlertTitle>Authenticated creator</AlertTitle><AlertDescription className="break-all text-muted-ink">Signed in as <span className="font-mono text-xs font-bold tracking-[0.04em] text-ink">{developer.walletAddress}</span></AlertDescription>
                </Alert>
                <Button type="button" onClick={() => void signOut()} disabled={isSigningOut} className="mt-3 min-h-11 rounded-pill border-2 border-ink bg-lime px-5 font-bold text-ink hover:bg-lime-hover">{isSigningOut ? "Signing out…" : "Sign out"}</Button>
              </>
            ) : (
              <Alert className="mt-3 border-border bg-cream text-ink">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>Not signed in</AlertTitle><AlertDescription className="text-muted-ink">Connecting a wallet prompts a sign-in. Authentication only — no transaction, no gas.</AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </section>

      <section className="relative mt-3 rounded-mobile-card border-2 border-ink bg-mobile-surface p-5 pt-7 shadow-[6px_6px_0_#141414] before:absolute before:-top-3 before:left-5 before:h-3 before:w-20 before:rounded-t-md before:border-x-2 before:border-t-2 before:border-ink before:bg-mobile-magenta min-[600px]:mt-0 min-[600px]:rounded-card min-[600px]:border-0 min-[600px]:bg-clear-paper min-[600px]:p-8 min-[600px]:shadow-none min-[600px]:before:hidden">
        <div><p className="font-metadata text-xs font-bold tracking-[0.1em] text-blueprint uppercase">Celo attribution</p><h2 className="mt-3 font-heading text-xl font-semibold">Attribution and settlement settings</h2><p className="mt-1 text-sm leading-relaxed text-muted-ink">Integration is not connected. Values are intentionally not prefilled or saved.</p></div>
        <FieldGroup className="mt-6">
          <Field><FieldLabel htmlFor="attribution">Attribution identifier</FieldLabel><Input id="attribution" className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="Not configured" /><FieldDescription>Configure an attribution identifier when the Celo integration is available.</FieldDescription></Field>
          <Field><FieldLabel htmlFor="pay-to">Settlement wallet</FieldLabel><Input id="pay-to" className="min-h-11 rounded-control border-2 border-ink bg-cream px-4" placeholder="Not connected" /><FieldDescription>No account address is displayed, stored, or inferred in this preview.</FieldDescription></Field>
        </FieldGroup>
        <Button type="button" disabled className="mt-6 min-h-11 rounded-pill border-2 border-ink px-5 font-bold">Save unavailable</Button>
      </section>
    </div>
  )
}

export { SettingsPanels }
