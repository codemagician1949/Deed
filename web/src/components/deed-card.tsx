import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { ArrowUpRight, Briefcase, Coins, Users } from "lucide-react"
import type { Deed } from "@/lib/types"
import { near } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Sparkline, StatusPill } from "./bits"
import { Tilt } from "./motion"

/** The Deed itself: a name that is also a wallet, a business and a token. */
export function DeedCard({ deed, className, compact = false }: { deed: Deed; className?: string; compact?: boolean }) {
  const [label, tla] = deed.id.split(".")
  return (
    <Tilt className={cn("group rounded-3xl", className)} max={7}>
      <Link
        to={`/deed/${deed.id}`}
        className="relative block overflow-hidden rounded-3xl border border-border bg-card shadow-[0_1px_0_0_rgb(255_255_255/0.06)_inset,0_24px_60px_-30px_rgb(0_0_0/0.6)] transition-shadow duration-500 hover:shadow-[0_1px_0_0_rgb(255_255_255/0.08)_inset,0_30px_80px_-28px_var(--glow)]"
      >
        {/* foil header */}
        <div
          className="relative h-28 overflow-hidden"
          style={{
            background: `linear-gradient(135deg, oklch(0.42 0.1 ${deed.hue}) 0%, oklch(0.26 0.05 ${deed.hue + 30}) 60%, oklch(0.2 0.03 265) 100%)`,
          }}
        >
          <motion.div
            aria-hidden
            className="absolute inset-0 opacity-40"
            style={{
              background:
                "repeating-linear-gradient(115deg, transparent 0 14px, rgb(255 255 255 / 0.05) 14px 15px)",
            }}
            animate={{ backgroundPositionX: ["0px", "60px"] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
          <div className="absolute inset-x-5 top-4 flex items-center justify-between">
            <StatusPill status={deed.status} className="bg-black/30 backdrop-blur-sm" />
            <ArrowUpRight className="size-5 text-white/60 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
          </div>
          <div className="absolute bottom-3 left-5 font-heading text-3xl leading-none tracking-tight text-white">
            {label}
            <span className="text-white/50">.{tla}</span>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <p className={cn("text-sm text-muted-foreground", compact ? "line-clamp-2" : "line-clamp-3")}>{deed.tagline}</p>

          <Sparkline data={deed.earningsSeries} stroke={`oklch(0.8 0.14 ${deed.hue})`} />

          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat icon={Coins} label="Earned" value={near(deed.stats.earnedNear, 1)} />
            <Stat icon={Briefcase} label="Jobs done" value={deed.stats.jobs.toLocaleString()} />
            <Stat icon={Users} label="Owners" value={String(deed.holders.length)} />
          </div>

          {deed.listing ? (
            <div className="flex items-center justify-between rounded-2xl bg-primary/10 px-4 py-3 ring-1 ring-primary/25 ring-inset">
              <span className="text-xs text-muted-foreground">Asking price</span>
              <span className="font-heading text-2xl text-primary">{near(deed.listing.priceNear, 0)}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
              <span className="text-xs text-muted-foreground">Owned by</span>
              <span className="font-mono text-xs">{deed.owner}</span>
            </div>
          )}
        </div>
      </Link>
    </Tilt>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Coins; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-2 py-2.5">
      <Icon className="mx-auto mb-1 size-3.5 text-muted-foreground" />
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</div>
    </div>
  )
}
