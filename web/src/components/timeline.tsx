import { motion } from "motion/react"
import {
  ArrowLeftRight,
  BadgeCheck,
  Coins,
  Crown,
  ExternalLink,
  HandCoins,
  KeyRound,
  Power,
  ShieldX,
  Sparkle,
  Tag,
  Undo2,
} from "lucide-react"
import type { EventKind, HistoryEvent } from "@/lib/types"
import { explorerTx, near, when } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ease } from "./motion"

const KIND: Record<EventKind, { icon: typeof Coins; tone: string }> = {
  minted: { icon: Sparkle, tone: "text-primary bg-primary/12" },
  activated: { icon: Power, tone: "text-success bg-success/12" },
  job_served: { icon: BadgeCheck, tone: "text-info bg-info/12" },
  earned: { icon: Coins, tone: "text-success bg-success/12" },
  swept: { icon: HandCoins, tone: "text-success bg-success/12" },
  listed: { icon: Tag, tone: "text-primary bg-primary/12" },
  sold: { icon: ArrowLeftRight, tone: "text-primary bg-primary/12" },
  permissions_cleared: { icon: KeyRound, tone: "text-destructive bg-destructive/12" },
  proceeds_paid: { icon: HandCoins, tone: "text-success bg-success/12" },
  royalty_paid: { icon: Crown, tone: "text-primary bg-primary/12" },
  refund: { icon: Undo2, tone: "text-muted-foreground bg-muted" },
  attack_blocked: { icon: ShieldX, tone: "text-destructive bg-destructive/12" },
}

export function Timeline({ events }: { events: HistoryEvent[] }) {
  return (
    <ol className="relative">
      <motion.span
        aria-hidden
        className="absolute top-2 bottom-2 left-[19px] w-px origin-top bg-border"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease }}
      />
      {events.map((e, i) => {
        const { icon: Icon, tone } = KIND[e.kind]
        return (
          <motion.li
            key={e.id}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-20px" }}
            transition={{ duration: 0.45, delay: Math.min(i, 8) * 0.04, ease }}
            className="relative flex gap-4 py-2.5"
          >
            <span className={cn("relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full ring-4 ring-background", tone)}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium">{e.title}</span>
                {e.amountNear !== undefined && (
                  <span className="font-mono text-sm tabular-nums">{near(e.amountNear)}</span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{when(e.at)}</span>
                {e.detail && <span>· {e.detail}</span>}
                {e.source && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[10px] font-medium",
                      e.source === "external" ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {e.source === "external" ? "real customer" : "our demo"}
                  </span>
                )}
                {e.tx && (
                  <a href={explorerTx(e.tx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                    proof <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}
