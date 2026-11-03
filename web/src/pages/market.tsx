import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Aurora, SampleBadge } from "@/components/bits"
import { DeedCard } from "@/components/deed-card"
import { Page, Reveal } from "@/components/motion"
import { useDeeds } from "@/lib/data"
import type { DeedStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const FILTERS: { id: "all" | DeedStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "listed", label: "For sale" },
  { id: "serving", label: "Switched on" },
  { id: "awaiting_activation", label: "Just sold" },
]

export function MarketPage() {
  const { deeds, loading, error } = useDeeds()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all")
  const [q, setQ] = useState("")
  const shown = useMemo(
    () =>
      deeds.filter(
        (d) =>
          (filter === "all" || d.status === filter) &&
          (d.id + d.tagline + d.service.title).toLowerCase().includes(q.toLowerCase()),
      ),
    [deeds, filter, q],
  )

  return (
    <Page>
      <section className="relative">
        <Aurora hue={245} />
        <div className="relative mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-6">
          <Reveal>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-5xl tracking-tight sm:text-6xl">Browse Deeds</h1>
              <SampleBadge />
            </div>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Every card is a real Deed on NEAR testnet: a name with its own wallet and history. Open one to see exactly what
              it has earned, who has owned it and every attempt to misuse it.
            </p>
          </Reveal>

          <Reveal delay={0.1} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1 rounded-full border border-border bg-background/60 p-1 backdrop-blur">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className="relative rounded-full px-3.5 py-1.5 text-sm"
                >
                  {filter === f.id && (
                    <motion.span
                      layoutId="filter-pill"
                      className="absolute inset-0 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className={cn("relative", filter === f.id ? "text-primary-foreground" : "text-muted-foreground")}>
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative sm:w-72">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or what it does"
                className="h-10 rounded-full pl-9"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <motion.div layout className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {shown.map((d, i) => (
              <motion.div
                key={d.id}
                layout
                initial={{ opacity: 0, scale: 0.94, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { delay: i * 0.06 } }}
                exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }}
              >
                <DeedCard deed={d} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
        {loading && deeds.length === 0 && <p className="py-20 text-center text-muted-foreground">Reading Deeds from NEAR testnet…</p>}
        {error && deeds.length === 0 && (
          <p className="py-20 text-center text-destructive">Couldn't reach NEAR testnet: {error}. Refresh to try again.</p>
        )}
        <AnimatePresence>
          {!loading && !error && shown.length === 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-20 text-center text-muted-foreground"
            >
              Nothing matches that yet. Try another word or the "All" filter.
            </motion.p>
          )}
        </AnimatePresence>
      </section>
    </Page>
  )
}
