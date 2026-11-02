import { motion } from "motion/react"
import { FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DeedStatus } from "@/lib/types"
import { DATA_SOURCE } from "@/lib/data"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** Wax-seal mark. Draws itself on first paint. */
export function SealLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8", className)} aria-hidden>
      <defs>
        <radialGradient id="seal" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="oklch(0.9 0.12 85)" />
          <stop offset="60%" stopColor="oklch(0.72 0.15 70)" />
          <stop offset="100%" stopColor="oklch(0.5 0.13 55)" />
        </radialGradient>
      </defs>
      <motion.path
        d="M20 2.5l3.6 2.4 4.3-.5 2 3.8 4 1.7-.3 4.3 2.6 3.4-2.6 3.4.3 4.3-4 1.7-2 3.8-4.3-.5L20 33.5l-3.6-2.4-4.3.5-2-3.8-4-1.7.3-4.3L3.8 18.4l2.6-3.4-.3-4.3 4-1.7 2-3.8 4.3.5z"
        fill="url(#seal)"
        initial={{ scale: 0.6, rotate: -30, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 14 }}
        style={{ transformOrigin: "20px 18px" }}
      />
      <motion.path
        d="M14 12.5h5.2c3.6 0 6 2.3 6 5.5s-2.4 5.5-6 5.5H14z"
        fill="none"
        stroke="oklch(0.25 0.04 60)"
        strokeWidth="2.2"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, delay: 0.25, ease: "easeInOut" }}
      />
    </svg>
  )
}

const STATUS: Record<DeedStatus, { label: string; hint: string; dot: string; ring: string }> = {
  serving: {
    label: "Open for business",
    hint: "The service is answering paid requests right now.",
    dot: "bg-success",
    ring: "bg-success/15 text-success ring-success/25",
  },
  listed: {
    label: "For sale",
    hint: "Held safely by the escrow. The service pauses until the buyer switches it on.",
    dot: "bg-primary",
    ring: "bg-primary/15 text-primary ring-primary/30",
  },
  awaiting_activation: {
    label: "New owner, getting ready",
    hint: "Just sold. Paused until the new owner switches the service on.",
    dot: "bg-info",
    ring: "bg-info/15 text-info ring-info/25",
  },
}

export function StatusPill({ status, className }: { status: DeedStatus; className?: string }) {
  const s = STATUS[status]
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
              s.ring,
              className,
            )}
          />
        }
      >
        <span className="relative flex size-2">
          <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", s.dot)} />
          <span className={cn("relative inline-flex size-2 rounded-full", s.dot)} />
        </span>
        {s.label}
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{s.hint}</TooltipContent>
    </Tooltip>
  )
}

/** Smooth area sparkline that draws itself in. */
export function Sparkline({
  data,
  className,
  stroke = "var(--primary)",
}: {
  data: number[]
  className?: string
  stroke?: string
}) {
  const w = 200
  const h = 56
  const max = Math.max(...data, 0.0001)
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 4 - (v / max) * (h - 10)] as const)
  const line = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`
    const [px, py] = pts[i - 1]
    const cx = (px + x) / 2
    return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`
  }, "")
  const id = `g${Math.round(max * 1000)}${data.length}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-14 w-full overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={`${line} L${w},${h} L0,${h} Z`}
        fill={`url(#${id})`}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.6 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, ease: "easeInOut" }}
      />
    </svg>
  )
}

export function SampleBadge({ className }: { className?: string }) {
  if (DATA_SOURCE !== "sample") return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-dashed border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary",
              className,
            )}
          />
        }
      >
        <FlaskConical className="size-3" /> Sample data
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        These numbers are examples to show how the page works. Live testnet data replaces them once the contracts are deployed.
      </TooltipContent>
    </Tooltip>
  )
}

/** Soft glowing blobs for section backgrounds. */
export function Aurora({ className, hue = 75 }: { className?: string; hue?: number }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <motion.div
        className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: `radial-gradient(closest-side, oklch(0.8 0.14 ${hue} / 0.22), transparent)` }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-20 -right-40 h-[380px] w-[380px] rounded-full blur-3xl"
        style={{ background: `radial-gradient(closest-side, oklch(0.7 0.12 ${hue + 170} / 0.16), transparent)` }}
        animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="bg-grid absolute inset-0" />
    </div>
  )
}
