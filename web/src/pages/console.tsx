import { useState } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { Eye, Lock, Power, Tag, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Aurora, SampleBadge, StatusPill } from "@/components/bits"
import { ConnectDialog } from "@/components/connect-dialog"
import { AnimatedNumber, Page, Reveal, Stagger, StaggerItem, ease } from "@/components/motion"
import { useDeeds } from "@/lib/data"
import { near } from "@/lib/format"
import { useWallet } from "@/lib/wallet"

/** Gated: only shows Deeds the connected account currently owns. */
export function ConsolePage() {
  const { account, preview } = useWallet()
  const deeds = useDeeds()
  const [connectOpen, setConnectOpen] = useState(false)
  const mine = account ? deeds.filter((d) => d.owner === account) : []

  return (
    <Page>
      <section className="relative min-h-[70vh]">
        <Aurora hue={75} />
        <div className="relative mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
          <AnimatePresence mode="wait">
            {!account ? (
              <motion.div
                key="locked"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.03, filter: "blur(8px)" }}
                transition={{ duration: 0.5, ease }}
                className="mx-auto max-w-md pt-12 text-center"
              >
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                  className="mx-auto flex size-24 items-center justify-center rounded-[2rem] border border-border bg-card shadow-[0_30px_80px_-30px_var(--glow)]"
                >
                  <Lock className="size-10 text-primary" />
                </motion.div>
                <h1 className="mt-8 font-heading text-5xl tracking-tight">Owners only</h1>
                <p className="mt-3 text-muted-foreground">
                  This room opens only for the person who owns a Deed right now. The moment you sell, it locks for you and
                  opens for the buyer.
                </p>
                <Button className="mt-6 h-11 rounded-full px-6" onClick={() => setConnectOpen(true)}>
                  <Wallet /> Connect to enter
                </Button>
              </motion.div>
            ) : (
              <motion.div key="open" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
                <Reveal className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      Signed in as <span className="font-mono text-foreground">{account}</span>
                      {preview && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          <Eye className="size-3" /> preview, can't sign
                        </span>
                      )}
                    </div>
                    <h1 className="mt-2 font-heading text-5xl tracking-tight sm:text-6xl">Your Deeds</h1>
                  </div>
                  <SampleBadge />
                </Reveal>

                {mine.length === 0 ? (
                  <div className="mt-10 rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">
                    You don't own a Deed right now.{" "}
                    <Link to="/market" className="text-foreground underline underline-offset-4">
                      Browse the ones for sale
                    </Link>
                    .
                  </div>
                ) : (
                  <Stagger className="mt-8 space-y-6">
                    {mine.map((d) => (
                      <StaggerItem key={d.id}>
                        <OwnedDeed id={d.id} />
                      </StaggerItem>
                    ))}
                  </Stagger>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </Page>
  )
}

function OwnedDeed({ id }: { id: string }) {
  const deed = useDeeds().find((d) => d.id === id)!
  const [on, setOn] = useState(deed.status === "serving")
  const mineEarned = deed.holders.find((h) => !h.to)?.earnedNear ?? 0
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card">
      <div
        className="flex flex-wrap items-center justify-between gap-4 p-6"
        style={{ background: `linear-gradient(120deg, oklch(0.42 0.1 ${deed.hue} / 0.35), transparent 60%)` }}
      >
        <div>
          <Link to={`/deed/${deed.id}`} className="font-heading text-4xl hover:underline">
            {deed.id}
          </Link>
          <div className="mt-2">
            <StatusPill status={on ? "serving" : deed.status === "serving" ? "awaiting_activation" : deed.status} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">You've earned</div>
          <div className="font-heading text-4xl">
            <AnimatedNumber value={mineEarned} decimals={2} suffix=" NEAR" />
          </div>
        </div>
      </div>
      <div className="grid gap-px bg-border md:grid-cols-2">
        <div className="bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 font-medium">
                <Power className="size-4" /> Service switch
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {on ? "Answering paid jobs under your name." : "Paused. Payments wait safely until you switch it on."}
              </p>
            </div>
            <Switch
              checked={on}
              onCheckedChange={(v) => {
                setOn(v)
                toast(v ? "Preview: service switched on" : "Preview: service paused", {
                  description: "In preview nothing is sent. With a wallet, you'd approve this in your wallet.",
                })
              }}
            />
          </div>
        </div>
        <div className="bg-card p-6">
          <div className="flex items-center gap-2 font-medium">
            <Tag className="size-4" /> Sell this Deed
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Listing hands the name to the escrow. Your earnings so far ({near(mineEarned)}) are paid to you right away.
          </p>
          <Button
            variant="outline"
            className="mt-3 rounded-full"
            onClick={() => toast("Selling opens with the testnet launch", { description: "Preview mode can't send transactions." })}
          >
            List for sale
          </Button>
        </div>
      </div>
    </div>
  )
}
