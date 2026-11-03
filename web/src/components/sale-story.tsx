import { useEffect, useRef, useState } from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { Bot, Check, Coins, KeyRound, Pause, Play, RotateCcw, ShieldCheck, Timer, User, Vault } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ease } from "./motion"

const STEPS = [
  { title: "Kofi owns preflight.bot", body: "It's his name, his wallet and his AI service. He gave his AI agent permission to pay small bills." },
  { title: "Maya pays 40 NEAR", body: "Her money waits in a neutral escrow, not with Kofi." },
  { title: "The name moves to Maya", body: "One step: the account, its name and its record now belong to her." },
  { title: "Kofi's keys stop working", body: "The account's own wallet wipes every permission Kofi or his agent had. Not a promise; it's in the code." },
  { title: "Kofi gets what he earned", body: "The 4.2 NEAR his service earned goes to Kofi automatically, in the same step." },
  { title: "5-minute settlement window", body: "Kofi's payment waits 5 minutes before anyone can release it, a simple safety margin before money leaves the escrow." },
  { title: "Kofi is paid", body: "39 NEAR to Kofi, 1 NEAR royalty to the template creator." },
  { title: "Maya switches it on", body: "The service starts answering again and earning into the same name, now for Maya." },
]
const LAST = STEPS.length - 1

export function SaleStory({ className }: { className?: string }) {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const reduce = useReducedMotion()
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!playing) return
    if (step >= LAST) {
      setPlaying(false)
      return
    }
    timer.current = window.setTimeout(() => setStep((s) => s + 1), step === 5 ? 2600 : 2100)
    return () => window.clearTimeout(timer.current)
  }, [playing, step])

  const play = () => {
    if (step >= LAST) setStep(0)
    setPlaying(true)
  }

  const deedWith: "seller" | "buyer" = step >= 2 ? "buyer" : "seller"
  const sellerKeysAlive = step < 3
  const escrowHolds = step >= 1 && step < 6
  const serving = step === 0 || step === LAST

  return (
    <div className={cn("relative overflow-hidden rounded-[2rem] border border-border bg-card/60 p-4 backdrop-blur sm:p-8", className)}>
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Stage */}
        <LayoutGroup>
          <div className="relative grid min-h-[380px] grid-cols-3 items-start gap-3 sm:gap-6">
            <Party who="Kofi" role="Seller" icon={User} tone="seller">
              <div className="flex min-h-10 flex-col items-center gap-1.5">
                <AnimatePresence>
                  {sellerKeysAlive &&
                    [
                      { k: "owner", label: "Owner key", Icon: KeyRound },
                      { k: "agent", label: "Agent permission", Icon: Bot },
                    ].map(({ k, label, Icon }) => (
                      <motion.div
                        key={k}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{
                          opacity: 0,
                          scale: 0.6,
                          rotate: k === "owner" ? -25 : 25,
                          y: 30,
                          filter: "blur(4px)",
                          transition: { duration: 0.6, ease },
                        }}
                        className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px]"
                      >
                        <Icon className="size-3" /> {label}
                      </motion.div>
                    ))}
                </AnimatePresence>
                <AnimatePresence>
                  {step >= 3 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 1.4 }}
                      animate={{ opacity: 1, scale: 1, x: [0, -6, 6, -4, 4, 0] }}
                      transition={{ duration: 0.6 }}
                      className="rounded-full bg-destructive/15 px-2.5 py-1 text-[11px] font-medium text-destructive"
                    >
                      Access wiped
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <Wallet amount={step >= 6 ? 43.2 : step >= 4 ? 4.2 : 0} highlight={step === 4 || step === 6} />
            </Party>

            {/* Escrow in the middle */}
            <div className="flex flex-col items-center gap-3 pt-10">
              <motion.div
                animate={{
                  scale: escrowHolds ? 1.05 : 1,
                  boxShadow: escrowHolds ? "0 0 0 6px color-mix(in oklch, var(--primary) 18%, transparent)" : "0 0 0 0px transparent",
                }}
                className="flex size-16 items-center justify-center rounded-2xl border border-border bg-background"
              >
                <Vault className="size-7 text-muted-foreground" />
              </motion.div>
              <div className="text-center text-[11px] text-muted-foreground">Escrow</div>
              <AnimatePresence>
                {escrowHolds && (
                  <motion.div
                    initial={{ opacity: 0, x: 80, scale: 0.6 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -80, scale: 0.6 }}
                    transition={{ duration: 0.7, ease }}
                    className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                  >
                    <Coins className="size-3.5" /> 40 NEAR
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {step === 5 && <Countdown key="cd" reduce={!!reduce} />}
              </AnimatePresence>
            </div>

            <Party who="Maya" role="Buyer" icon={User} tone="buyer">
              <div className="flex min-h-10 flex-col items-center gap-1.5">
                <AnimatePresence>
                  {step >= 2 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 18 }}
                      className="flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] text-success"
                    >
                      <KeyRound className="size-3" /> Owner key
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <Wallet amount={step >= 1 ? 60 : 100} highlight={step === 1} />
            </Party>

            {/* The deed token, which travels */}
            <div className={cn("col-span-3 flex", deedWith === "seller" ? "justify-start" : "justify-end")}>
              <motion.div
                layout
                transition={{ type: "spring", stiffness: 70, damping: 16 }}
                className="w-[calc(33.333%-0.5rem)] min-w-[120px]"
              >
                <MiniDeed serving={serving} earned={step >= 4 ? 0 : 4.2} owner={deedWith === "seller" ? "Kofi" : "Maya"} />
              </motion.div>
            </div>
          </div>
        </LayoutGroup>

        {/* Steps */}
        <div className="flex flex-col">
          <div className="mb-4 flex items-center gap-2">
            {playing ? (
              <Button variant="outline" className="rounded-full" onClick={() => setPlaying(false)}>
                <Pause /> Pause
              </Button>
            ) : (
              <Button className="rounded-full" onClick={play}>
                {step >= LAST ? <RotateCcw /> : <Play />} {step >= LAST ? "Watch again" : step === 0 ? "Watch a sale" : "Continue"}
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <ol className="space-y-1">
            {STEPS.map((s, i) => {
              const done = i < step
              const active = i === step
              return (
                <li key={s.title}>
                  <button
                    onClick={() => {
                      setPlaying(false)
                      setStep(i)
                    }}
                    className={cn(
                      "flex w-full gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                      active ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors",
                        done && "border-success bg-success text-background",
                        active && "border-primary text-primary",
                        !done && !active && "border-border text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="size-3" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-sm", active ? "font-medium" : done ? "text-foreground/80" : "text-muted-foreground")}>
                        {s.title}
                      </span>
                      <AnimatePresence initial={false}>
                        {active && (
                          <motion.span
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease }}
                            className="block overflow-hidden text-sm text-muted-foreground"
                          >
                            <span className="block pt-1">{s.body}</span>
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}

function Party({
  who,
  role,
  icon: Icon,
  tone,
  children,
}: {
  who: string
  role: string
  icon: typeof User
  tone: "seller" | "buyer"
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-full ring-4",
          tone === "seller" ? "bg-chart-3/15 text-chart-3 ring-chart-3/10" : "bg-chart-2/15 text-chart-2 ring-chart-2/10",
        )}
      >
        <Icon className="size-6" />
      </div>
      <div className="text-center">
        <div className="text-sm font-medium">{who}</div>
        <div className="text-[11px] text-muted-foreground">{role}</div>
      </div>
      {children}
    </div>
  )
}

function Wallet({ amount, highlight }: { amount: number; highlight: boolean }) {
  return (
    <motion.div
      animate={{ scale: highlight ? [1, 1.12, 1] : 1 }}
      transition={{ duration: 0.6 }}
      className={cn(
        "rounded-xl border px-2.5 py-1.5 text-center transition-colors",
        highlight ? "border-success/50 bg-success/10" : "border-border",
      )}
    >
      <div className="text-[10px] text-muted-foreground">Wallet</div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={amount}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          className="text-xs font-semibold tabular-nums"
        >
          {amount.toLocaleString("en-US", { maximumFractionDigits: 1 })} NEAR
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

function MiniDeed({ serving, earned, owner }: { serving: boolean; earned: number; owner: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-[oklch(0.42_0.1_75)] to-[oklch(0.22_0.03_265)] p-3 text-white shadow-[0_20px_50px_-20px_var(--glow)]">
      <div className="flex items-center justify-between">
        <span className="font-heading text-lg leading-none">preflight.bot</span>
        <span className={cn("size-2 rounded-full", serving ? "animate-pulse bg-emerald-400" : "bg-white/30")} />
      </div>
      <div className="mt-2 flex items-end justify-between text-[10px] text-white/70">
        <span>
          Owner <span className="font-medium text-white">{owner}</span>
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={earned} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }}>
            {earned ? `${earned} NEAR inside` : "earnings paid out"}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-white/70">
        <ShieldCheck className="size-3" /> {serving ? "Open for business" : "Paused during sale"}
      </div>
    </div>
  )
}

function Countdown({ reduce }: { reduce: boolean }) {
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex flex-col items-center gap-1"
    >
      <div className="relative size-12">
        <svg viewBox="0 0 44 44" className="size-12 -rotate-90">
          <circle cx="22" cy="22" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
          <motion.circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: 0 }}
            animate={{ strokeDashoffset: c }}
            transition={{ duration: reduce ? 0 : 2.4, ease: "linear" }}
          />
        </svg>
        <Timer className="absolute inset-0 m-auto size-4 text-primary" />
      </div>
      <span className="text-[10px] text-muted-foreground">5 min, sped up</span>
    </motion.div>
  )
}
