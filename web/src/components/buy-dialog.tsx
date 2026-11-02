import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Check, Loader2, Lock } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { Deed } from "@/lib/types"
import { near } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ease } from "./motion"

const STEPS = [
  "Your payment goes into escrow",
  "The name moves to you",
  "The seller's keys are wiped",
  "The seller's earnings are paid out to them",
  "Safety window (5 minutes), then the seller is paid",
]

/**
 * Explains what buying does, step by step. In preview it runs a rehearsal only:
 * it never sends a transaction (clearly stated in the dialog).
 */
export function BuyDialog({ deed, open, onOpenChange }: { deed: Deed; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [phase, setPhase] = useState<"review" | "running" | "done">("review")
  const [step, setStep] = useState(-1)

  useEffect(() => {
    if (!open) {
      setPhase("review")
      setStep(-1)
    }
  }, [open])

  useEffect(() => {
    if (phase !== "running") return
    if (step >= STEPS.length - 1) {
      const t = window.setTimeout(() => setPhase("done"), 700)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setStep((s) => s + 1), 900)
    return () => window.clearTimeout(t)
  }, [phase, step])

  if (!deed.listing) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-3xl font-normal">Buy {deed.id}</DialogTitle>
          <DialogDescription>Here's exactly what happens when you buy. Nothing is hidden and nothing is left to trust.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-2xl bg-primary/10 px-4 py-3 ring-1 ring-primary/25 ring-inset">
          <span className="text-sm text-muted-foreground">You pay</span>
          <span className="font-heading text-3xl text-primary">{near(deed.listing.priceNear, 0)}</span>
        </div>

        <ol className="space-y-2">
          {STEPS.map((s, i) => {
            const done = phase === "done" || i < step
            const active = phase === "running" && i === step
            return (
              <motion.li
                key={s}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, ease }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                  active && "bg-muted",
                  done && "text-foreground",
                  !done && !active && "text-muted-foreground",
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
                      <motion.span key="c" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
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
          {phase === "done" ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-dashed border-border p-4 text-center text-sm"
            >
              <div className="font-medium">That was a rehearsal.</div>
              <p className="text-muted-foreground">Real buying opens with the testnet launch. No transaction was sent.</p>
              <Button variant="outline" className="mt-3 rounded-full" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </motion.div>
          ) : (
            <motion.div key="go" exit={{ opacity: 0 }}>
              <Button
                className="h-11 w-full rounded-xl text-sm"
                disabled={phase === "running"}
                onClick={() => {
                  setPhase("running")
                  setStep(0)
                }}
              >
                <Lock /> {phase === "running" ? "Rehearsing…" : "Rehearse this purchase"}
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Rehearsal only. Real purchases open with the testnet launch.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
