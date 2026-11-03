import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { CheckCircle2, ExternalLink, Radio, ShieldX, XCircle } from "lucide-react"
import { explorerTx } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ease } from "./motion"

interface Step {
  row: string
  expect: "ok" | "fail"
  got: "ok" | "fail"
  verdict: "PASS" | "FAIL"
  what: string
  tx: string | null
  error: string | null
}
interface Report {
  network: string
  name: string
  ran_at: string
  passed: boolean
  failures: number
  steps: Step[]
}

/** The latest live run of verify/testnet-sale.sh, published as /report-testnet.json. */
export function LiveRun() {
  const [report, setReport] = useState<Report | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    fetch("/report-testnet.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setReport)
      .catch(() => setMissing(true))
  }, [])

  if (missing) return null
  if (!report) return <div className="h-40 animate-pulse rounded-3xl bg-muted/40" />

  const attacks = report.steps.filter((s) => s.expect === "fail")
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-success uppercase">
            <Radio className="size-3.5" /> Live on NEAR {report.network}
          </div>
          <h3 className="mt-1 font-heading text-3xl">A real sale of {report.name.split(".")[0]}</h3>
          <p className="text-sm text-muted-foreground">
            Run {new Date(report.ran_at).toLocaleString()} · every line is a real transaction you can open.
          </p>
        </div>
        <div
          className={cn(
            "rounded-2xl px-4 py-2 text-right",
            report.passed ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive",
          )}
        >
          <div className="font-heading text-3xl">
            {attacks.filter((a) => a.verdict === "PASS").length}/{attacks.length}
          </div>
          <div className="text-xs">attacks blocked</div>
        </div>
      </div>
      <ol className="divide-y divide-border">
        {report.steps.map((s, i) => {
          const attack = s.expect === "fail"
          const Icon = s.verdict === "FAIL" ? XCircle : attack ? ShieldX : CheckCircle2
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: Math.min(i, 12) * 0.03, ease }}
              className="flex items-start gap-3 px-5 py-3"
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  s.verdict === "FAIL" ? "text-destructive" : attack ? "text-destructive/80" : "text-success",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  {s.what}
                  {attack && s.verdict === "PASS" && <span className="ml-2 text-xs font-medium text-destructive">blocked</span>}
                </div>
                {attack && s.error && (
                  <code className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">{s.error}</code>
                )}
              </div>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{s.row}</span>
              {s.tx && (
                <a
                  href={explorerTx(s.tx)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  tx <ExternalLink className="size-3" />
                </a>
              )}
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}
