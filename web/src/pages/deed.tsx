import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { motion } from "motion/react"
import { ArrowLeft, Briefcase, CalendarClock, Coins, Copy, Cpu, Gauge, ShoppingBag, Undo2, Users } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Aurora, SampleBadge, Sparkline, StatusPill } from "@/components/bits"
import { BuyDialog } from "@/components/buy-dialog"
import { AnimatedNumber, Page, Reveal, Stagger, StaggerItem, ease } from "@/components/motion"
import { Timeline } from "@/components/timeline"
import { useDeed } from "@/lib/data"
import { dateOnly, near } from "@/lib/format"
import { cn } from "@/lib/utils"

export function DeedPage() {
  const { id } = useParams()
  const deed = useDeed(id)
  const [buyOpen, setBuyOpen] = useState(false)

  if (!deed) {
    return (
      <Page className="mx-auto max-w-xl px-4 py-32 text-center">
        <h1 className="font-heading text-5xl">No Deed called “{id}”</h1>
        <p className="mt-3 text-muted-foreground">Check the spelling, or browse the ones that exist.</p>
        <Button className="mt-6 rounded-full" render={<Link to="/market" />}>
          Browse Deeds
        </Button>
      </Page>
    )
  }

  const [label, tla] = deed.id.split(".")
  const payments = deed.history.filter((e) => e.kind === "job_served")
  const external = payments.filter((e) => e.source === "external").length

  return (
    <Page>
      <section className="relative">
        <Aurora hue={deed.hue} />
        <div className="relative mx-auto max-w-6xl px-4 pt-6 pb-10 sm:px-6">
          <Button variant="ghost" size="sm" className="mb-6 -ml-2 rounded-full" render={<Link to="/market" />}>
            <ArrowLeft /> All Deeds
          </Button>

          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={deed.status} />
                <SampleBadge />
              </div>
              <motion.h1
                initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.8, ease }}
                className="mt-4 font-heading text-6xl leading-none tracking-tight sm:text-8xl"
              >
                {label}
                <span className="text-muted-foreground/60">.{tla}</span>
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
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-mono text-xs hover:bg-muted"
                >
                  <Copy className="size-3" /> {deed.id}
                </button>
                <span className="text-muted-foreground">
                  owned by <span className="font-mono text-xs text-foreground">{deed.owner}</span>
                </span>
              </div>
            </div>

            {/* Action card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7, ease }}
              className="self-start rounded-3xl border border-border bg-card/80 p-5 shadow-2xl shadow-black/10 backdrop-blur"
            >
              {deed.listing ? (
                <>
                  <div className="text-sm text-muted-foreground">Asking price</div>
                  <div className="font-heading text-5xl text-primary">{near(deed.listing.priceNear, 0)}</div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Includes the name, its wallet, its public record and the service. The seller's earnings so far go
                    to the seller.
                  </p>
                  <Button className="mt-4 h-11 w-full rounded-xl text-sm" onClick={() => setBuyOpen(true)}>
                    <ShoppingBag /> Buy this Deed
                  </Button>
                  <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                    <Undo2 className="size-3" /> If the transfer fails, you get every coin back automatically.
                  </p>
                </>
              ) : (
                <>
                  <div className="text-sm text-muted-foreground">Price per job</div>
                  <div className="font-heading text-5xl">{near(deed.service.priceNear)}</div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {deed.status === "serving"
                      ? "Pay the name, get an answer signed by a secure AI enclave."
                      : "Paused while the new owner gets set up. Payments wait safely in the account."}
                  </p>
                  <Button className="mt-4 h-11 w-full rounded-xl text-sm" disabled={deed.status !== "serving"} render={<Link to="/how" />}>
                    <Cpu /> {deed.status === "serving" ? "How to use it" : "Not serving yet"}
                  </Button>
                </>
              )}
            </motion.div>
          </div>

          {/* Stats */}
          <Stagger className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { icon: Coins, label: "Total earned", value: <AnimatedNumber value={deed.stats.earnedNear} decimals={2} suffix=" NEAR" /> },
              { icon: Briefcase, label: "Jobs done", value: <AnimatedNumber value={deed.stats.jobs} /> },
              { icon: Gauge, label: "Uptime", value: <AnimatedNumber value={deed.stats.uptimePct} decimals={1} suffix="%" /> },
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
          <TabsList className="mb-6">
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="owners">Owners</TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="service">The service</TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-3xl border border-border bg-card p-4 sm:p-6">
                <Timeline events={deed.history} />
              </div>
              <Reveal className="space-y-3 self-start rounded-3xl border border-border bg-card p-6 text-sm">
                <h3 className="font-heading text-2xl">Reading this page</h3>
                <p className="text-muted-foreground">
                  Every line is something that happened to this name. Payments marked{" "}
                  <span className="rounded-full bg-success/12 px-1.5 text-success">real customer</span> came from people
                  outside our team; <span className="rounded-full bg-muted px-1.5">our demo</span> payments came from our
                  own test scripts.
                </p>
                <p className="text-muted-foreground">
                  {external} of the {payments.length} recent jobs shown came from real customers.
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
                  <div className="flex items-center gap-4">
                    <span className="flex size-10 items-center justify-center rounded-full bg-muted font-heading text-xl">{i + 1}</span>
                    <div>
                      <div className="font-mono text-sm">{h.account}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarClock className="size-3" /> {dateOnly(h.from)} → {h.to ? dateOnly(h.to) : "now"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">{near(h.earnedNear)}</div>
                    <div className="text-xs text-muted-foreground">{h.to ? "earned, paid out to them" : "earned so far"}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="earnings">
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-baseline justify-between">
                <h3 className="font-heading text-2xl">Last 14 days</h3>
                <span className="text-sm text-muted-foreground">NEAR earned per day</span>
              </div>
              <Sparkline data={deed.earningsSeries} className="mt-6 h-40" stroke={`oklch(0.8 0.14 ${deed.hue})`} />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>14 days ago</span>
                <span>today</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="service">
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["Service", deed.service.title],
                ["AI model", deed.service.model],
                ["Price per job", near(deed.service.priceNear)],
                ["Name rented until", dateOnly(deed.leaseUntil)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-border bg-card p-5">
                  <div className="text-xs text-muted-foreground">{k}</div>
                  <div className="mt-1 font-medium">{v}</div>
                </div>
              ))}
              <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2">
                <div className="text-xs text-muted-foreground">Public settings fingerprint</div>
                <div className="mt-1 font-mono text-xs break-all">{deed.service.configHash}</div>
                <p className="mt-2 text-xs text-muted-foreground">
                  The service's instructions are public, so a seller can't take a secret recipe with them. This fingerprint
                  proves which version is running.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      <BuyDialog deed={deed} open={buyOpen} onOpenChange={setBuyOpen} />
    </Page>
  )
}
