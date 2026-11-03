import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { motion } from "motion/react"
import {
  ArrowLeft,
  Briefcase,
  CalendarClock,
  Coins,
  Copy,
  ExternalLink,
  Hourglass,
  Loader2,
  RefreshCw,
  ShieldX,
  ShoppingBag,
  Undo2,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Aurora, SampleBadge, Sparkline, StatusPill } from "@/components/bits"
import { BuyDialog } from "@/components/buy-dialog"
import { AnimatedNumber, Page, Reveal, Stagger, StaggerItem, ease } from "@/components/motion"
import { Timeline } from "@/components/timeline"
import { useDeed } from "@/lib/data"
import { dateOnly, explorerTx, near } from "@/lib/format"
import { CONFIG } from "@/lib/config"
import { useWallet } from "@/lib/wallet"
import { cancel, claim } from "@/lib/actions"
import type { LiveDeed } from "@/lib/live"
import { cn } from "@/lib/utils"
import { JobCard } from "@/components/job-card"
import { jobsFor, type Job } from "@/lib/runtime"

const explorerAccount = (a: string) => `https://testnet.nearblocks.io/address/${a}`

export function DeedPage() {
  const { id: raw } = useParams()
  const id = raw ? decodeURIComponent(raw) : undefined
  const { deed, loading, error, reload } = useDeed(id)
  const [buyOpen, setBuyOpen] = useState(false)

  if (loading && !deed) {
    return (
      <Page className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Reading {id} from NEAR testnet…
        </div>
        <div className="mt-8 h-24 w-2/3 animate-pulse rounded-2xl bg-muted/50" />
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/40" />
          ))}
        </div>
      </Page>
    )
  }
  if (error && !deed) {
    return (
      <Page className="mx-auto max-w-xl px-4 py-32 text-center">
        <h1 className="font-heading text-5xl">Couldn't reach NEAR testnet</h1>
        <p className="mt-3 text-muted-foreground">{error}</p>
        <Button className="mt-6 rounded-full" onClick={() => reload()}>
          <RefreshCw /> Try again
        </Button>
      </Page>
    )
  }
  if (!deed) {
    return (
      <Page className="mx-auto max-w-xl px-4 py-32 text-center">
        <h1 className="font-heading text-5xl">No Deed called “{id}”</h1>
        <p className="mt-3 text-muted-foreground">The registry has no name like that. Check the spelling, or browse the ones that exist.</p>
        <Button className="mt-6 rounded-full" render={<Link to="/market" />}>
          Browse Deeds
        </Button>
      </Page>
    )
  }

  const dot = deed.id.indexOf(".")
  const label = deed.id.slice(0, dot)
  const rest = deed.id.slice(dot + 1)
  const payments = deed.history.filter((e) => e.kind === "earned")
  const external = payments.filter((e) => e.source === "external").length

  return (
    <Page>
      <section className="relative">
        <Aurora hue={deed.hue} />
        <div className="relative mx-auto max-w-6xl px-4 pt-6 pb-10 sm:px-6">
          <div className="mb-6 flex items-center justify-between">
            <Button variant="ghost" size="sm" className="-ml-2 rounded-full" render={<Link to="/market" />}>
              <ArrowLeft /> All Deeds
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => reload()} disabled={loading}>
              <RefreshCw className={cn(loading && "animate-spin")} /> Refresh
            </Button>
          </div>

          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={deed.status} />
                <SampleBadge />
              </div>
              <motion.h1
                initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.8, ease }}
                className="mt-4 font-heading text-6xl leading-none tracking-tight break-words sm:text-8xl"
              >
                {label}
                <span className="mt-2 block font-mono text-base tracking-normal text-muted-foreground sm:text-lg">.{rest}</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="mt-4 max-w-xl text-lg text-muted-foreground"
              >
                {deed.tagline}
              </motion.p>

              <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(deed.id)
                    toast.success("Name copied", { description: "Anyone can pay this name directly." })
                  }}
                  className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-border px-3 py-1.5 font-mono text-xs hover:bg-muted"
                >
                  <Copy className="size-3 shrink-0" /> {deed.id}
                </button>
                <a
                  href={explorerAccount(deed.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  Explorer <ExternalLink className="size-3" />
                </a>
                <span className="text-muted-foreground">
                  {deed.status === "listed" ? "listed by" : "owned by"} <span className="font-mono text-xs text-foreground">{deed.owner}</span>
                </span>
              </div>
            </div>

            <ActionCard deed={deed} onBuy={() => setBuyOpen(true)} onDone={() => reload()} />
          </div>

          <Stagger className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { icon: Coins, label: "Paid into the name", value: <AnimatedNumber value={deed.stats.earnedNear} decimals={2} suffix=" NEAR" /> },
              { icon: Briefcase, label: "Payments", value: <AnimatedNumber value={deed.stats.jobs} /> },
              { icon: ShieldX, label: "Misuse attempts blocked", value: <AnimatedNumber value={deed.stats.refunds} /> },
              { icon: Users, label: "Owners so far", value: <AnimatedNumber value={deed.holders.length} /> },
            ].map((s) => (
              <StaggerItem key={s.label}>
                <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
                  <s.icon className="size-4 text-muted-foreground" />
                  <div className="mt-3 font-heading text-3xl">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Tabs defaultValue="history">
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="owners">Owners</TabsTrigger>
            <TabsTrigger value="jobs">Jobs answered</TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="chain">On-chain facts</TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-3xl border border-border bg-card p-4 sm:p-6">
                {deed.history.length ? <Timeline events={deed.history} /> : <p className="text-sm text-muted-foreground">No activity yet.</p>}
              </div>
              <Reveal className="space-y-3 self-start rounded-3xl border border-border bg-card p-6 text-sm">
                <h3 className="font-heading text-2xl">Reading this page</h3>
                <p className="text-muted-foreground">
                  Every line is a real transaction on NEAR testnet that touched this name; click <i>proof</i> to open it. Payments
                  marked <span className="rounded-full bg-success/12 px-1.5 text-success">real customer</span> came from accounts
                  outside our team; <span className="rounded-full bg-muted px-1.5">our demo</span> payments came from our own test
                  scripts.
                </p>
                <p className="text-muted-foreground">
                  {external} of {payments.length} payments came from outside our team.
                </p>
                <p className="text-muted-foreground">
                  "Blocked" lines are real attempts by accounts without permission, rejected by the contracts.
                </p>
              </Reveal>
            </div>
          </TabsContent>

          <TabsContent value="owners">
            <div className="grid gap-3">
              {deed.holders.map((h, i) => (
                <motion.div
                  key={h.account + h.from}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5",
                    !h.to ? "border-primary/40 bg-primary/5" : "border-border bg-card",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-xl">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm">{h.account}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarClock className="size-3" /> {dateOnly(h.from)} → {h.to ? dateOnly(h.to) : "now"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">{near(h.earnedNear)}</div>
                    <div className="text-xs text-muted-foreground">{h.to ? "paid in while they held it" : "paid in so far"}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="jobs">
            <JobsTab name={deed.id} />
          </TabsContent>

          <TabsContent value="earnings">
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-baseline justify-between">
                <h3 className="font-heading text-2xl">Last 14 days</h3>
                <span className="text-sm text-muted-foreground">NEAR paid in per day</span>
              </div>
              <Sparkline data={deed.earningsSeries} className="mt-6 h-40" stroke={`oklch(0.8 0.14 ${deed.hue})`} />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>14 days ago</span>
                <span>today</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="chain">
            <ChainFacts deed={deed} />
          </TabsContent>
        </Tabs>
      </section>

      <BuyDialog deed={deed} open={buyOpen} onOpenChange={setBuyOpen} onDone={() => reload()} />
    </Page>
  )
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return now
}

function ActionCard({ deed, onBuy, onDone }: { deed: LiveDeed; onBuy: () => void; onDone: () => void }) {
  const { account, call } = useWallet()
  const now = useNow()
  const [busy, setBusy] = useState<string | null>(null)
  const sale = deed.latestSale
  const pending = sale && (sale.state === "Pending" || sale.state === "Claiming")
  const finalAt = sale ? Number(BigInt(sale.final_after_ns) / 1_000_000n) : 0
  const secondsLeft = Math.max(0, Math.ceil((finalAt - now) / 1000))

  const run = async (name: string, fn: () => Promise<string>, success: string) => {
    setBusy(name)
    try {
      const hash = await fn()
      toast.success(success, {
        description: hash ? "Confirmed on NEAR testnet." : undefined,
        action: hash ? { label: "View", onClick: () => window.open(explorerTx(hash), "_blank") } : undefined,
      })
      onDone()
    } catch (e) {
      toast.error("Not done", { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.7, ease }}
      className="space-y-4 self-start rounded-3xl border border-border bg-card/80 p-5 shadow-2xl shadow-black/10 backdrop-blur"
    >
      {deed.listing ? (
        <div>
          <div className="text-sm text-muted-foreground">Asking price</div>
          <div className="font-heading text-5xl text-primary">{near(deed.listing.priceNear, 2)}</div>
          <p className="mt-2 text-sm text-muted-foreground">
            You get the name, its wallet and its public record. The seller's earnings so far went to the seller when they listed.
          </p>
          {account === deed.listing.seller ? (
            <Button
              variant="outline"
              className="mt-4 h-11 w-full rounded-xl"
              disabled={!!busy}
              onClick={() => run("cancel", () => cancel(call, deed), "Taken off the market. The name is back with you.")}
            >
              {busy === "cancel" ? <Loader2 className="animate-spin" /> : <Undo2 />} Take it off the market
            </Button>
          ) : (
            <Button className="mt-4 h-11 w-full rounded-xl text-sm" onClick={onBuy}>
              <ShoppingBag /> Buy this Deed
            </Button>
          )}
          <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
            <Undo2 className="size-3" /> If the transfer fails, the buyer gets every coin back automatically.
          </p>
        </div>
      ) : (
        <div>
          <div className="text-sm text-muted-foreground">{deed.activation ? "Price per job" : "Service"}</div>
          <div className="font-heading text-5xl">{deed.activation ? near(deed.service.priceNear) : "Off"}</div>
          <p className="mt-2 text-sm text-muted-foreground">
            {deed.status === "serving"
              ? `Switched on by ${deed.activation?.owner} (version ${deed.activation?.version}). Pay the name and Preflight answers; it checks the owner live on every job.`
              : "Waiting for the current owner to switch the service on. Payments sent now wait safely in the account."}
          </p>
          {deed.status === "serving" && (
            <Button className="mt-4 h-11 w-full rounded-xl text-sm" render={<Link to="/try" />}>
              Ask Preflight
            </Button>
          )}
          {account === deed.owner && (
            <Button variant="outline" className="mt-3 w-full rounded-xl" render={<Link to="/console" />}>
              Manage in My Deeds
            </Button>
          )}
        </div>
      )}

      {pending && sale && (
        <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <Hourglass className="size-4 text-primary" /> Seller's payment for the last sale
          </div>
          <p className="mt-1 text-muted-foreground">
            {near(Number(BigInt(sale.price_yocto) - BigInt(sale.royalty_yocto)) / 1e24)} to {sale.seller}.{" "}
            {secondsLeft > 0
              ? `Unlocks in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")} (House of Stake can still reverse the sale until then).`
              : "The safety window has closed. Anyone can release it."}
          </p>
          <Button
            className="mt-3 w-full rounded-xl"
            variant="outline"
            disabled={secondsLeft > 0 || !!busy || !account}
            onClick={() => run("claim", () => claim(call, deed), "Payment released to the seller.")}
          >
            {busy === "claim" ? <Loader2 className="animate-spin" /> : <Coins />} {account ? "Release payment" : "Connect to release payment"}
          </Button>
        </div>
      )}
    </motion.div>
  )
}

function ChainFacts({ deed }: { deed: LiveDeed }) {
  const facts: [string, React.ReactNode][] = [
    ["NFT owner (registry)", <span className="font-mono">{deed.status === "listed" ? CONFIG.deed : deed.owner}</span>],
    ["Wallet balance", near(deed.balanceNear, 4)],
    ["Payouts go to", <span className="font-mono">{deed.payoutAccount ?? "unknown"}</span>],
    ["Service activation", deed.activation ? `v${deed.activation.version} by ${deed.activation.owner}` : "none"],
    ["Name rented until", deed.leaseUntil ? dateOnly(deed.leaseUntil) : "unknown"],
    ["Registry", <span className="font-mono">{CONFIG.registry}</span>],
    ["Deed contract", <span className="font-mono">{CONFIG.deed}</span>],
  ]
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {facts.map(([k, v]) => (
        <div key={k} className="rounded-2xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">{k}</div>
          <div className="mt-1 text-sm break-all">{v}</div>
        </div>
      ))}
      <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2">
        <div className="text-xs text-muted-foreground">Public settings fingerprint</div>
        <div className="mt-1 font-mono text-xs break-all">{deed.service.configHash}</div>
        <p className="mt-2 text-xs text-muted-foreground">
          The service's settings are public, so a seller can't walk away with a secret recipe. This fingerprint proves which version
          the owner switched on.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2">
        <div className="text-xs text-muted-foreground">The account's wallet code is House of Stake's mainnet code</div>
        <ul className="mt-2 space-y-1 font-mono text-[11px] break-all text-muted-foreground">
          {Object.entries(CONFIG.mainnetCodeHashes).map(([k, h]) => (
            <li key={k}>
              <span className="text-foreground">{k}</span> {h}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Our testnet deployment uses these exact mainnet code hashes (Top Level Accounts has no official testnet deployment).
        </p>
      </div>
    </div>
  )
}

function JobsTab({ name }: { name: string }) {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    jobsFor(name).then(setJobs).catch(() => setOffline(true))
  }, [name])
  if (offline)
    return (
      <p className="text-sm text-muted-foreground">
        The Preflight runtime's job ledger isn't reachable from here. Run it locally with <code className="font-mono">cd runtime && bun run start</code>.
      </p>
    )
  if (!jobs) return <div className="h-32 animate-pulse rounded-3xl bg-muted/40" />
  if (!jobs.length) return <p className="text-sm text-muted-foreground">No paid jobs yet. <Link to="/try" className="underline">Ask Preflight</Link>.</p>
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every paid job this Deed's runtime received: who paid, under which owner it was accepted, the answer, and the enclave
        signature check. Refunds link to their transaction.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {jobs.map((j) => (
          <JobCard key={j.id} job={j} />
        ))}
      </div>
    </div>
  )
}
