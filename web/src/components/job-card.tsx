import { motion } from "motion/react"
import { BadgeCheck, CircleAlert, Clock, ExternalLink, Fingerprint, Undo2 } from "lucide-react"
import type { Job, RiskFlag } from "@/lib/runtime"
import { explorerTx, near, when } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ease } from "./motion"

const SEV: Record<RiskFlag["severity"], string> = {
  high: "bg-destructive/12 text-destructive ring-destructive/25",
  medium: "bg-primary/12 text-primary ring-primary/25",
  info: "bg-muted text-muted-foreground ring-border",
}

export function Flags({ flags }: { flags: RiskFlag[] }) {
  if (!flags.length) return <p className="text-sm text-muted-foreground">No risk flags.</p>
  return (
    <ul className="space-y-2">
      {flags.map((f, i) => (
        <motion.li
          key={f.code + i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06, ease }}
          className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-sm ring-1 ring-inset", SEV[f.severity])}
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="mr-1.5 font-mono text-[10px] tracking-wide uppercase opacity-80">{f.severity}</span>
            {f.message}
          </span>
        </motion.li>
      ))}
    </ul>
  )
}

const STATUS: Record<Job["status"], { label: string; icon: typeof Clock; cls: string }> = {
  processing: { label: "Answering…", icon: Clock, cls: "text-primary" },
  served: { label: "Answered", icon: BadgeCheck, cls: "text-success" },
  awaiting_activation: { label: "Held: owner hasn't switched on", icon: Clock, cls: "text-info" },
  refund_due: { label: "Refund due", icon: Undo2, cls: "text-primary" },
  refunded: { label: "Refunded", icon: Undo2, cls: "text-muted-foreground" },
}

export function JobCard({ job }: { job: Job }) {
  const s = STATUS[job.status]
  const verdict = job.answer?.explanation.match(/Verdict:\s*(.+)$/im)?.[1]
  const body = job.answer?.explanation.replace(/\n?Verdict:.*$/im, "").trim()
  const sig = job.answer?.check
  return (
    <div className="space-y-4 rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", s.cls)}>
          <s.icon className="size-4" /> {s.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {near(Number(BigInt(job.amountYocto)) / 1e24)} from {job.payer} · {when(job.createdAt)}
        </span>
      </div>
      {body && <p className="text-sm leading-relaxed whitespace-pre-line">{body}</p>}
      {verdict && (
        <div
          className={cn(
            "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
            /DO NOT/i.test(verdict) ? "bg-destructive/15 text-destructive" : /CHECK/i.test(verdict) ? "bg-primary/15 text-primary" : "bg-success/15 text-success",
          )}
        >
          {verdict}
        </div>
      )}
      <Flags flags={job.flags} />
      {job.reason && <p className="text-xs text-muted-foreground">{job.reason}</p>}
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          Accepted under <span className="font-mono text-foreground">{job.eraOwner ?? "—"}</span>
          {job.activationVersion ? ` (activation v${job.activationVersion})` : ""}
          {job.ownerAtDelivery && job.eraOwner && job.ownerAtDelivery !== job.eraOwner && (
            <span className="block text-info">Sold mid-job: delivered after ownership moved to {job.ownerAtDelivery}.</span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 sm:justify-end">
          <a className="inline-flex items-center gap-1 hover:text-foreground" href={explorerTx(job.id)} target="_blank" rel="noreferrer">
            payment <ExternalLink className="size-3" />
          </a>
          {job.refundTx && (
            <a className="inline-flex items-center gap-1 hover:text-foreground" href={explorerTx(job.refundTx)} target="_blank" rel="noreferrer">
              refund <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
      {job.answer && (
        <div className="rounded-2xl bg-muted/50 p-3 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <Fingerprint className="size-3.5" /> Signed inside a secure enclave (NEAR AI, {job.answer.model})
          </div>
          {sig ? (
            <ul className="space-y-0.5 text-muted-foreground">
              <li>{sig.hashesMatch ? "✓" : "✗"} signature covers the exact question and answer bytes</li>
              <li>{sig.signerMatches ? "✓" : "✗"} signer {job.answer.signature?.signing_address} recovered from the signature</li>
            </ul>
          ) : (
            <p className="text-muted-foreground">Signature not available for this answer.</p>
          )}
        </div>
      )}
    </div>
  )
}
