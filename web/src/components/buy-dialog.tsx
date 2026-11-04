import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Check, ExternalLink, Loader2, ShoppingBag, Wallet, XCircle } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { LiveDeed } from "@/lib/live"
import { explorerTx, near } from "@/lib/format"
import { useWallet } from "@/lib/wallet"
import { buy } from "@/lib/actions"
import { cn } from "@/lib/utils"
import { ease } from "./motion"

const STEPS = [
  "Your payment goes into the escrow",
  "Payouts are pointed at the seller",
  "The name moves to you",
  "The seller's keys are wiped by the wallet",
  "The seller is paid in the same transaction (minus a 2.5% royalty)",
]

type Phase = "review" | "signing" | "done" | "failed"

/** Buys a listed Deed with the connected NEAR testnet wallet (one transaction). */
export function BuyDialog({
  deed,
  open,
  onOpenChange,
  onDone,
}: {
  deed: LiveDeed
  open: boolean
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const { account, preview, call, connect } = useWallet()
  const [phase, setPhase] = useState<Phase>("review")
  const [hash, setHash] = useState<string>("")
  const [error, setError] = useState<string>("")

  useEffect(() => {
    if (!open) {
      setPhase("review")
      setHash("")
      setError("")
    }
  }, [open])

  if (!deed.listing) return null
  const go = async () => {
    setPhase("signing")
    try {
      const h = await buy(call, deed)
      setHash(h)
      setPhase("done")
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setHash((e as { hash?: string })?.hash ?? "")
      setPhase("failed")
    }
  }
  const doneCount = phase === "done" ? STEPS.length - 1 : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate font-heading text-3xl font-normal">Buy {deed.id.split(".")[0]}</DialogTitle>
          <DialogDescription>One transaction does all of this. If any part fails, you get your money back in the same step.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-2xl bg-primary/10 px-4 py-3 ring-1 ring-primary/25 ring-inset">
          <span className="text-sm text-muted-foreground">You pay (testnet NEAR)</span>
          <span className="font-heading text-3xl text-primary">{near(deed.listing.priceNear, 2)}</span>
        </div>
        <LeaseNote leaseUntil={deed.leaseUntil} />

        <ol className="space-y-2">
          {STEPS.map((s, i) => {
            const done = i < doneCount
            const active = phase === "signing" || (phase === "done" && i === STEPS.length - 1)
            return (
              <motion.li
                key={s}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, ease }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                  done ? "text-foreground" : active ? "bg-muted/60" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                    done ? "border-success bg-success text-background" : active ? "border-primary text-primary" : "border-border",
                  )}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {done ? (
                      <motion.span key="c" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20, delay: i * 0.12 }}>
                        <Check className="size-3.5" />
                      </motion.span>
                    ) : active ? (
                      <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <Loader2 className="size-3.5 animate-spin" />
                      </motion.span>
                    ) : (
                      <motion.span key="n" className="text-[10px]">
                        {i + 1}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                {s}
              </motion.li>
            )
          })}
        </ol>

        <AnimatePresence mode="wait">
          {phase === "done" && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-success/30 bg-success/10 p-4 text-center text-sm">
              <div className="font-medium text-success">It's yours.</div>
              <p className="text-muted-foreground">Open "My Deeds" to switch the service on under your name.</p>
              {hash && (
                <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs underline">
                  View transaction <ExternalLink className="size-3" />
                </a>
              )}
            </motion.div>
          )}
          {phase === "failed" && (
            <motion.div key="failed" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <XCircle className="size-4" /> The purchase didn't go through
              </div>
              <p className="mt-1 text-muted-foreground">{error}</p>
              <p className="mt-1 text-muted-foreground">If any NEAR left your wallet, the escrow refunded it in the same transaction.</p>
              {hash && (
                <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs underline">
                  View transaction <ExternalLink className="size-3" />
                </a>
              )}
              <Button variant="outline" className="mt-3 w-full rounded-xl" onClick={() => setPhase("review")}>
                Try again
              </Button>
            </motion.div>
          )}
          {(phase === "review" || phase === "signing") && (
            <motion.div key="go" exit={{ opacity: 0 }}>
              {!account || preview ? (
                <Button className="h-11 w-full rounded-xl text-sm" onClick={() => connect().catch(() => undefined)}>
                  <Wallet /> {preview ? "Preview can't buy: connect a real wallet" : "Connect a testnet wallet to buy"}
                </Button>
              ) : (
                <Button className="h-11 w-full rounded-xl text-sm" disabled={phase === "signing"} onClick={go}>
                  {phase === "signing" ? <Loader2 className="animate-spin" /> : <ShoppingBag />}
                  {phase === "signing" ? "Confirm in your wallet…" : `Buy for ${near(deed.listing.priceNear, 2)}`}
                </Button>
              )}
              <p className="mt-2 text-center text-[11px] text-muted-foreground">NEAR testnet. Signed by {account && !preview ? account : "your wallet"}.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

/** The name is rented: show when the lease ends, and warn if it's soon (the buyer would have to renew it). */
function LeaseNote({ leaseUntil }: { leaseUntil: string }) {
  if (!leaseUntil) return <p className="-mt-1 text-xs text-muted-foreground">Lease end: unknown. Check the name's page before buying.</p>
  const days = Math.floor((Date.parse(leaseUntil) - Date.now()) / 86_400_000)
  const soon = days < 30
  return (
    <p className={soon ? "-mt-1 text-xs font-medium text-destructive" : "-mt-1 text-xs text-muted-foreground"}>
      The name is rented until {new Date(leaseUntil).toISOString().slice(0, 10)} ({days} days).
      {soon ? " That's soon: you'd need to renew it, or House of Stake can reclaim the name." : " After that it must be renewed."}
    </p>
  )
}
