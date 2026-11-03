import { useState } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { Eye, Loader2, Lock, Power, RefreshCw, Tag, Undo2, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Aurora, SampleBadge, StatusPill } from "@/components/bits"
import { ConnectDialog } from "@/components/connect-dialog"
import { AnimatedNumber, Page, Reveal, Stagger, StaggerItem, ease } from "@/components/motion"
import { useDeeds } from "@/lib/data"
import { explorerTx, near } from "@/lib/format"
import { useWallet } from "@/lib/wallet"
import { activate, cancel, list } from "@/lib/actions"
import type { LiveDeed } from "@/lib/live"

/** Gated: shows only Deeds the connected account owns right now (read live from the registry). */
export function ConsolePage() {
  const { account, preview } = useWallet()
  const { deeds, loading, reload } = useDeeds()
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
                  This room opens only for whoever owns a Deed right now, checked live against the registry. The moment you sell,
                  it locks for you and opens for the buyer.
                </p>
                <Button className="mt-6 h-11 rounded-full px-6" onClick={() => setConnectOpen(true)}>
                  <Wallet /> Connect to enter
                </Button>
              </motion.div>
            ) : (
              <motion.div key="open" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
                <Reveal className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      Signed in as <span className="font-mono text-foreground">{account}</span>
                      {preview && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          <Eye className="size-3" /> preview, can't sign
                        </span>
                      )}
                    </div>
                    <h1 className="mt-2 font-heading text-5xl tracking-tight sm:text-6xl">Your Deeds</h1>
                  </div>
                  <div className="flex items-center gap-2">
                    <SampleBadge />
                    <Button variant="ghost" size="sm" className="rounded-full" onClick={() => reload()} disabled={loading}>
                      <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
                    </Button>
                  </div>
                </Reveal>

                {loading && deeds.length === 0 ? (
                  <div className="mt-10 h-56 animate-pulse rounded-3xl bg-muted/40" />
                ) : mine.length === 0 ? (
                  <div className="mt-10 rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">
                    The registry says <span className="font-mono text-foreground">{account}</span> doesn't own a Deed right now.{" "}
                    <Link to="/market" className="text-foreground underline underline-offset-4">
                      Browse Deeds
                    </Link>
                    .
                  </div>
                ) : (
                  <Stagger className="mt-8 space-y-6">
                    {mine.map((d) => (
                      <StaggerItem key={d.id}>
                        <OwnedDeed deed={d} onDone={() => reload()} />
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

function OwnedDeed({ deed, onDone }: { deed: LiveDeed; onDone: () => void }) {
  const { call, preview } = useWallet()
  const [busy, setBusy] = useState<string | null>(null)
  const [price, setPrice] = useState(deed.activation ? String(deed.service.priceNear) : "0.05")
  const [ask, setAsk] = useState("1")
  const mineEarned = deed.holders.find((h) => !h.to)?.earnedNear ?? 0
  const listed = deed.status === "listed"

  const run = async (name: string, fn: () => Promise<string>, success: string) => {
    setBusy(name)
    try {
      const hash = await fn()
      toast.success(success, {
        action: hash ? { label: "View", onClick: () => window.open(explorerTx(hash), "_blank") } : undefined,
      })
      onDone()
    } catch (e) {
      toast.error("Not done", { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }
  const validNear = (v: string) => /^\d+(\.\d{1,24})?$/.test(v.trim()) && Number(v) > 0

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card">
      <div
        className="flex flex-wrap items-center justify-between gap-4 p-6"
        style={{ background: `linear-gradient(120deg, oklch(0.42 0.1 ${deed.hue} / 0.35), transparent 60%)` }}
      >
        <div className="min-w-0">
          <Link to={`/deed/${encodeURIComponent(deed.id)}`} className="block truncate font-heading text-4xl hover:underline">
            {deed.id.split(".")[0]}
            <span className="text-xl text-muted-foreground">.{deed.id.split(".").slice(1).join(".")}</span>
          </Link>
          <div className="mt-2">
            <StatusPill status={deed.status} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Paid in while you've held it</div>
          <div className="font-heading text-4xl">
            <AnimatedNumber value={mineEarned} decimals={2} suffix=" NEAR" />
          </div>
        </div>
      </div>

      {listed ? (
        <div className="space-y-3 bg-card p-6">
          <div className="flex items-center gap-2 font-medium">
            <Tag className="size-4" /> Listed for {near(deed.listing?.priceNear ?? 0, 2)}
          </div>
          <p className="text-sm text-muted-foreground">
            The escrow holds the name. Your earnings up to listing were paid to you, and anything paid in while it's listed reaches you
            at the sale.
          </p>
          <Button
            variant="outline"
            className="rounded-full"
            disabled={!!busy || preview}
            onClick={() => run("cancel", () => cancel(call, deed), "Taken off the market. The name is back with you.")}
          >
            {busy === "cancel" ? <Loader2 className="animate-spin" /> : <Undo2 />} Take it off the market
          </Button>
        </div>
      ) : (
        <div className="grid gap-px bg-border md:grid-cols-2">
          <div className="space-y-3 bg-card p-6">
            <div className="flex items-center gap-2 font-medium">
              <Power className="size-4" /> {deed.status === "serving" ? `Switched on (v${deed.activation?.version})` : "Switch the service on"}
            </div>
            <p className="text-sm text-muted-foreground">
              {deed.status === "serving"
                ? "You can change the price. Each change is a new signed version, so old ones can't be replayed."
                : "Records on chain that you, the current owner, run this service at this price."}
            </p>
            <div className="flex gap-2">
              <Input value={price} onChange={(e) => setPrice(e.target.value)} className="h-9 rounded-full" aria-label="Price per job in NEAR" />
              <Button
                className="rounded-full"
                disabled={!!busy || preview || !validNear(price)}
                onClick={() => run("activate", () => activate(call, deed, price), "Service switched on under your name.")}
              >
                {busy === "activate" ? <Loader2 className="animate-spin" /> : <Power />} {deed.status === "serving" ? "Update" : "Switch on"}
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground">NEAR per job</div>
          </div>
          <div className="space-y-3 bg-card p-6">
            <div className="flex items-center gap-2 font-medium">
              <Tag className="size-4" /> Sell this Deed
            </div>
            <p className="text-sm text-muted-foreground">
              Listing hands the name to the escrow. The wallet pays out what's in it to you and wipes every agent permission right away.
            </p>
            <div className="flex gap-2">
              <Input value={ask} onChange={(e) => setAsk(e.target.value)} className="h-9 rounded-full" aria-label="Asking price in NEAR" />
              <Button
                variant="outline"
                className="rounded-full"
                disabled={!!busy || preview || !validNear(ask)}
                onClick={() => run("list", () => list(call, deed, ask), "Listed. The escrow now holds the name.")}
              >
                {busy === "list" ? <Loader2 className="animate-spin" /> : <Tag />} List
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground">Asking price in NEAR</div>
          </div>
        </div>
      )}
      {preview && (
        <div className="border-t border-border bg-muted/30 px-6 py-3 text-xs text-muted-foreground">
          Preview mode shows the owner's view of real data but can't sign. Connect a NEAR testnet wallet to act.
        </div>
      )}
    </div>
  )
}
