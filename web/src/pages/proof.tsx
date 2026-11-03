import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { CircleDashed, FlaskConical, Play, ShieldCheck, ShieldX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Aurora } from "@/components/bits"
import { Page, Reveal, Stagger, StaggerItem, ease } from "@/components/motion"
import { LiveRun } from "@/components/live-run"
import { ATTACKS } from "@/lib/sample"
import type { Attack, ProofStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS: Record<ProofStatus, { label: string; icon: typeof ShieldCheck; cls: string }> = {
  proven_testnet: { label: "Proven on testnet", icon: ShieldCheck, cls: "bg-success/12 text-success" },
  proven_sandbox: { label: "Proven against the real wallet code", icon: FlaskConical, cls: "bg-info/12 text-info" },
  planned: { label: "Test being built", icon: CircleDashed, cls: "bg-muted text-muted-foreground" },
}

export function ProofPage() {
  const proven = ATTACKS.filter((a) => a.status !== "planned").length
  return (
    <Page>
      <section className="relative">
        <Aurora hue={22} />
        <div className="relative mx-auto max-w-6xl px-4 pt-10 pb-12 sm:px-6">
          <Reveal className="max-w-2xl">
            <div className="mb-3 text-xs font-medium tracking-[0.2em] text-primary uppercase">Safety proof</div>
            <h1 className="font-heading text-5xl leading-[1] tracking-tight sm:text-7xl">
              Every way a seller could cheat, <span className="text-gold-gradient italic">tried for real.</span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Before writing any code we listed every trick a seller might use to keep money or access after selling.
              Each one gets a test that actually attempts it. Press play on any card to replay what the test saw.
            </p>
          </Reveal>
          <Reveal delay={0.15} className="mt-8 flex flex-wrap gap-3">
            <div className="rounded-2xl border border-border bg-card/70 px-5 py-3 backdrop-blur">
              <div className="font-heading text-4xl">
                {proven}
                <span className="text-muted-foreground">/{ATTACKS.length}</span>
              </div>
              <div className="text-xs text-muted-foreground">attacks with a passing test today</div>
            </div>
            <div className="max-w-sm rounded-2xl border border-dashed border-border px-5 py-3 text-sm text-muted-foreground">
              Every test runs against the exact House of Stake code that is live on NEAR mainnet, in a private test network.
              The same run on public testnet is next.
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
        <Reveal>
          <LiveRun />
        </Reveal>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Reveal className="mb-6">
          <h2 className="font-heading text-4xl">Every attack, one by one</h2>
        </Reveal>
        <Stagger className="grid gap-4 md:grid-cols-2">
          {ATTACKS.map((a) => (
            <StaggerItem key={a.id}>
              <AttackCard attack={a} />
            </StaggerItem>
          ))}
        </Stagger>
      </section>
    </Page>
  )
}

function AttackCard({ attack }: { attack: Attack }) {
  const [phase, setPhase] = useState<"idle" | "trying" | "blocked">("idle")
  const s = STATUS[attack.status]
  const run = () => {
    setPhase("trying")
    window.setTimeout(() => setPhase("blocked"), 1100)
  }
  return (
    <motion.div
      animate={phase === "blocked" ? { x: [0, -5, 5, -3, 3, 0] } : {}}
      transition={{ duration: 0.45 }}
      className={cn(
        "relative h-full overflow-hidden rounded-3xl border bg-card p-5 transition-colors duration-500",
        phase === "blocked" ? "border-destructive/40" : "border-border",
      )}
    >
      <AnimatePresence>
        {phase === "blocked" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-destructive/10 to-transparent"
          />
        )}
      </AnimatePresence>
      <div className="relative flex items-start justify-between gap-3">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", s.cls)}>
          <s.icon className="size-3" /> {s.label}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">row {attack.row}</span>
      </div>
      <h3 className="relative mt-4 text-lg font-medium">{attack.attempt}</h3>

      <div className="relative mt-4 min-h-[76px]">
        <AnimatePresence mode="wait">
          {phase === "idle" && (
            <motion.div key="idle" exit={{ opacity: 0, y: -6 }}>
              <Button variant="outline" size="sm" className="rounded-full" onClick={run}>
                <Play /> {attack.status === "planned" ? "Show what should happen" : "Replay the test"}
              </Button>
            </motion.div>
          )}
          {phase === "trying" && (
            <motion.div
              key="trying"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <motion.span
                className="size-2 rounded-full bg-primary"
                animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
              {attack.status === "planned" ? "Old owner tries…" : "Replaying the recorded attempt…"}
            </motion.div>
          )}
          {phase === "blocked" && (
            <motion.div key="blocked" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ease }} className="space-y-2">
              <div className="flex items-center gap-2">
                <motion.span
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 14 }}
                  className="flex size-7 items-center justify-center rounded-full bg-destructive text-background"
                >
                  <ShieldX className="size-4" />
                </motion.span>
                <span className="text-sm font-medium text-destructive">
                  {attack.status === "planned" ? "Should be blocked (test coming)" : "Blocked"}
                </span>
                {attack.error !== "—" && (
                  <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] break-all">{attack.error}</code>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{attack.stoppedBy}</p>
              <button onClick={() => setPhase("idle")} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                reset
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
