import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { Ban, CircleCheck, CircleX, Loader2, ScanSearch, ShieldAlert, ShieldCheck, ShieldQuestion, UserSearch, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Aurora } from "@/components/bits"
import { Flags, JobCard } from "@/components/job-card"
import { Page, Reveal, ease } from "@/components/motion"
import { useDeeds } from "@/lib/data"
import { near } from "@/lib/format"
import { counterpartyCheck, EXAMPLES, requestHash, riskPreview, runtimeHealth, runtimeUrlFor, serviceChecks, submitJob, type CounterpartyCheck, type Health, type Job, type ProposedTx, type RiskFlag, type Verdict } from "@/lib/runtime"
import { CONFIG } from "@/lib/config"
import { txReturnValue } from "@/lib/near"
import { useWallet } from "@/lib/wallet"
import { cn } from "@/lib/utils"

type Step = "idle" | "paying" | "asking" | "done"

export function TryPage() {
  const { deeds } = useDeeds()
  const { account, preview, connect, callValue } = useWallet()
  // Switched on, including Deeds listed for sale (the seller's service keeps answering until the sale).
  const serving = deeds.filter((d) => d.activation && (d.status === "serving" || d.status === "listed"))
  const [deedId, setDeedId] = useState<string>("")
  const deed = serving.find((d) => d.id === deedId) ?? serving[0]
  const [text, setText] = useState(JSON.stringify(EXAMPLES[1].tx, null, 2))
  const [flags, setFlags] = useState<RiskFlag[] | null>(null)
  const [agentId, setAgentId] = useState("")
  const [cp, setCp] = useState<CounterpartyCheck | null>(null)
  const [cpError, setCpError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [step, setStep] = useState<Step>("idle")
  const [job, setJob] = useState<Job | null>(null)
  // The runtime this Deed's owner switched on (may differ from the default after a buyer brings their own).
  const deedRuntime = runtimeUrlFor(deed?.activation?.runtime_id, deed?.activation?.runtime_url)
  const [deedHealth, setDeedHealth] = useState<{ url: string; health: Health | null } | null>(null)
  useEffect(() => {
    if (!deed) return
    let live = true
    runtimeHealth(deedRuntime)
      .then((h) => live && setDeedHealth({ url: deedRuntime, health: h }))
      .catch(() => live && setDeedHealth({ url: deedRuntime, health: null }))
    return () => {
      live = false
    }
  }, [deed, deedRuntime])
  const checks = serviceChecks(deedHealth?.url === deedRuntime ? deedHealth.health : null, deed?.activation, deedRuntime)
  const checksPass = checks.every((c) => c.ok)

  const parsed = useMemo<ProposedTx | null>(() => {
    try {
      const t = JSON.parse(text)
      return t && typeof t.receiver_id === "string" && Array.isArray(t.actions) ? t : null
    } catch {
      return null
    }
  }, [text])

  useEffect(() => {
    runtimeHealth().catch(() => setOffline(true)) // the default runtime serves the free flags
  }, [])
  useEffect(() => {
    setFlags(null)
    if (!parsed || offline) return
    const t = setTimeout(() => riskPreview(parsed).then(setFlags).catch(() => setOffline(true)), 250)
    return () => clearTimeout(t)
  }, [parsed, offline])

  useEffect(() => {
    setCp(null)
    setCpError(null)
    if (!parsed || offline) return
    const t = setTimeout(
      () => counterpartyCheck(parsed, agentId.trim()).then(setCp).catch((e) => setCpError(e instanceof Error ? e.message : String(e))),
      400,
    )
    return () => clearTimeout(t)
  }, [parsed, agentId, offline])

  const ask = async () => {
    if (!deed || !parsed) return
    if (!checksPass) {
      toast.error("Not safe to pay", { description: `The runtime at ${deedRuntime} isn't the one this Deed's owner switched on.` })
      return
    }
    if (!account || preview) {
      await connect().catch(() => undefined)
      return
    }
    try {
      setStep("paying")
      const price = deed.activation?.price_yocto ?? "0"
      // The Deed contract holds the payment, bound to this exact question (sha256), until the runtime answers.
      const { hash, value } = await callValue({
        receiverId: CONFIG.deed,
        method: "pay_job",
        args: { token_id: deed.id, request_hash: await requestHash(parsed) },
        depositYocto: price,
        tgas: 30,
      })
      const jobId = value ?? (await txReturnValue(hash, account))
      if (!jobId) throw new Error(`Paid (${hash}) but couldn't read the job id. It will be refundable on chain after 15 minutes.`)
      setStep("asking")
      const r = await submitJob(deedRuntime, { job_id: String(jobId), request: parsed })
      if (!r.body.job) throw new Error(r.body.error ?? `runtime returned ${r.status}`)
      setJob(r.body.job)
      setStep("done")
    } catch (e) {
      setStep("idle")
      toast.error("Not answered", { description: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <Page>
      <section className="relative">
        <Aurora hue={200} />
        <div className="relative mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-6">
          <Reveal className="max-w-2xl">
            <div className="mb-3 text-xs font-medium tracking-[0.2em] text-primary uppercase">The service inside a Deed</div>
            <h1 className="font-heading text-5xl leading-none tracking-tight sm:text-7xl">Ask Preflight before you sign</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Paste a NEAR transaction you're about to sign. You'll see the risk flags and a check of who it pays, for free. Pay the Deed {deed ? near(deed.service.priceNear) : "its price"} and
              you get a plain-words explanation signed inside a secure enclave, so anyone can check it wasn't changed.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-24 sm:px-6 lg:grid-cols-2">
        <Reveal className="min-w-0 space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="mb-3 text-sm font-medium">1. The transaction</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e.label}
                  onClick={() => {
                    setText(JSON.stringify(e.tx, null, 2))
                    setAgentId(e.agent ?? "")
                  }}
                  className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
                >
                  {e.label}
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              className={cn(
                "h-64 w-full resize-y rounded-2xl border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring/40",
                parsed ? "border-border" : "border-destructive/50",
              )}
            />
            {!parsed && <p className="mt-1 text-xs text-destructive">Needs JSON like {"{ receiver_id, actions: [...] }"}.</p>}
            <label htmlFor="agent-id" className="mt-3 block text-xs text-muted-foreground">
              Paying as (optional): the agent's account, to check past payments and the reporters its vault trusts
            </label>
            <input
              id="agent-id"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="e.g. agent-vault.deedhq.testnet"
              spellCheck={false}
              className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <ShieldQuestion className="size-4" /> 2. Free check: risk flags
            </div>
            {offline ? (
              <p className="text-sm text-muted-foreground">
                The Preflight runtime isn't reachable. Run it with <code className="font-mono">cd runtime && bun run start</code>.
              </p>
            ) : flags ? (
              <Flags flags={flags} />
            ) : (
              <div className="h-16 animate-pulse rounded-xl bg-muted/50" />
            )}
          </div>

        </Reveal>

        <Reveal delay={0.1} className="min-w-0 space-y-4">
          <div id="counterparty" className="rounded-3xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <UserSearch className="size-4" /> 3. Free check: who you're paying
            </div>
            {offline ? (
              <p className="text-sm text-muted-foreground">The Preflight runtime isn't reachable.</p>
            ) : cpError ? (
              <p className="text-sm text-destructive">Couldn't run the check: {cpError}. Treat the receiver as unchecked.</p>
            ) : cp ? (
              <Counterparty check={cp} />
            ) : (
              <div className="h-16 animate-pulse rounded-xl bg-muted/50" />
            )}
          </div>

          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="mb-3 text-sm font-medium">4. Pay a Deed and get the explanation</div>
            {serving.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Deed is switched on right now. <Link to="/market" className="underline">Browse Deeds</Link>.</p>
            ) : (
              <>
                <select
                  value={deed?.id}
                  onChange={(e) => setDeedId(e.target.value)}
                  className="mb-3 h-10 w-full max-w-full min-w-0 truncate rounded-xl border border-border bg-background px-3 font-mono text-xs"
                >
                  {serving.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id} · {near(d.service.priceNear)} · owner {d.owner}
                    </option>
                  ))}
                </select>
                <ul className="mb-3 space-y-1 rounded-2xl border border-border bg-background/60 p-3 text-xs">
                  {checks.map((c) => (
                    <li key={c.label} className="flex items-center gap-2">
                      {deedHealth?.url !== deedRuntime ? (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      ) : c.ok ? (
                        <CircleCheck className="size-3.5 text-primary" />
                      ) : (
                        <CircleX className="size-3.5 text-destructive" />
                      )}
                      {c.label}
                    </li>
                  ))}
                  <li className="truncate pt-1 font-mono text-[10px] text-muted-foreground" title={deedRuntime}>
                    runtime {deed?.activation?.runtime_id} · {deedRuntime}
                  </li>
                </ul>
                <Button className="h-11 w-full rounded-xl" disabled={!parsed || offline || (deedHealth?.url === deedRuntime && !checksPass) || step === "paying" || step === "asking"} onClick={ask}>
                  {step === "paying" || step === "asking" ? <Loader2 className="animate-spin" /> : account && !preview ? <ScanSearch /> : <Wallet />}
                  {step === "paying"
                    ? "Confirm the payment in your wallet (held by the Deed contract)…"
                    : step === "asking"
                      ? "Checking the owner, asking the enclave, settling on chain…"
                      : account && !preview
                        ? `Pay ${deed ? near(deed.service.priceNear) : ""} and explain`
                        : "Connect a testnet wallet to pay"}
                </Button>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Your payment is held by the Deed contract, bound to this exact question. When the answer is delivered it is paid into
                  the Deed's own wallet; if anything fails, the contract returns it to you, and after 15 minutes anyone can trigger that refund.
                  {deedHealth?.health && !deedHealth.health.can_answer && " Note: this runtime has no AI key configured, so paid jobs are refunded."}
                  {deedHealth?.url === deedRuntime && !checksPass && " Paying is blocked: this runtime isn't the one the Deed's current activation names. If the owner runs their own, open this page with ?runtime=<their URL>."}
                </p>
              </>
            )}
          </div>
          <AnimatePresence>
            {job && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ease }}>
                <JobCard job={job} />
              </motion.div>
            )}
          </AnimatePresence>
        </Reveal>
      </section>
    </Page>
  )
}

const VERDICT: Record<Verdict, { label: string; icon: typeof Ban; cls: string; hint: string }> = {
  allow: { label: "Allow", icon: ShieldCheck, cls: "bg-success/12 text-success ring-success/25", hint: "An agent's wrapper signs this." },
  warn: { label: "Warn", icon: ShieldAlert, cls: "bg-primary/12 text-primary ring-primary/25", hint: "An agent's wrapper asks a human first." },
  block: { label: "Block", icon: Ban, cls: "bg-destructive/12 text-destructive ring-destructive/25", hint: "An agent's wrapper refuses to sign, and the agent's vault refuses on chain." },
}

function Counterparty({ check }: { check: CounterpartyCheck }) {
  const v = VERDICT[check.verdict]
  const shown = check.reasons.filter((r) => r.verdict !== "allow" || r.code === "known_counterparty")
  return (
    <div className="space-y-3">
      <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-inset", v.cls)}>
        <v.icon className="size-5 shrink-0" />
        <span className="font-heading text-lg leading-none">{v.label}</span>
        <span className="text-xs opacity-80">{v.hint}</span>
      </div>
      {shown.length ? (
        <ul className="space-y-2">
          {shown.map((r, i) => (
            <motion.li
              key={r.code + i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, ease }}
              className="rounded-xl bg-background/60 px-3 py-2 text-sm ring-1 ring-border ring-inset"
            >
              <span className="mr-1.5 font-mono text-[10px] tracking-wide uppercase opacity-70">{r.verdict}</span>
              <span className="break-words">{r.message}</span>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">source: {r.source}</div>
            </motion.li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No reports, not new, active, no code change this week.</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Checked {check.counterparties.map((c) => c.account).join(", ") || "nothing to check"} against the shared blocklist{" "}
        <span className="font-mono">{check.reports_contract}</span>, the chain as it was 7 days ago, and its history. Blocking needs a report from{" "}
        {check.policy.trusted_reporters.length ? <span className="font-mono">{check.policy.trusted_reporters.join(", ")}</span> : "a trusted reporter"} or{" "}
        {check.policy.min_reporters} reporters ({check.policy.source}).
      </p>
    </div>
  )
}
