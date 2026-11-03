import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { Loader2, ScanSearch, ShieldQuestion, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Aurora } from "@/components/bits"
import { Flags, JobCard } from "@/components/job-card"
import { Page, Reveal, ease } from "@/components/motion"
import { useDeeds } from "@/lib/data"
import { near } from "@/lib/format"
import { EXAMPLES, jobMessage, RECIPIENT, riskPreview, runtimeHealth, submitJob, type Health, type Job, type ProposedTx, type RiskFlag } from "@/lib/runtime"
import { useWallet } from "@/lib/wallet"
import { cn } from "@/lib/utils"

type Step = "idle" | "paying" | "signing" | "asking" | "done"

export function TryPage() {
  const { deeds } = useDeeds()
  const { account, preview, connect, transfer, signMessage } = useWallet()
  const serving = deeds.filter((d) => d.status === "serving")
  const [deedId, setDeedId] = useState<string>("")
  const deed = serving.find((d) => d.id === deedId) ?? serving[0]
  const [text, setText] = useState(JSON.stringify(EXAMPLES[1].tx, null, 2))
  const [flags, setFlags] = useState<RiskFlag[] | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [offline, setOffline] = useState(false)
  const [step, setStep] = useState<Step>("idle")
  const [job, setJob] = useState<Job | null>(null)

  const parsed = useMemo<ProposedTx | null>(() => {
    try {
      const t = JSON.parse(text)
      return t && typeof t.receiver_id === "string" && Array.isArray(t.actions) ? t : null
    } catch {
      return null
    }
  }, [text])

  useEffect(() => {
    runtimeHealth().then(setHealth).catch(() => setOffline(true))
  }, [])
  useEffect(() => {
    setFlags(null)
    if (!parsed || offline) return
    const t = setTimeout(() => riskPreview(parsed).then(setFlags).catch(() => setOffline(true)), 250)
    return () => clearTimeout(t)
  }, [parsed, offline])

  const ask = async () => {
    if (!deed || !parsed) return
    if (!account || preview) {
      await connect().catch(() => undefined)
      return
    }
    try {
      setStep("paying")
      const price = deed.activation?.price_yocto ?? "0"
      const paymentTx = await transfer(deed.id, price)
      // Prove this account paid, and bind the payment to this exact question (NEP-413).
      setStep("signing")
      const auth = await signMessage(await jobMessage(deed.id, paymentTx, parsed), RECIPIENT)
      setStep("asking")
      const r = await submitJob({ name: deed.id, payment_tx: paymentTx, sender: account, request: parsed, auth })
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
              Paste a NEAR transaction you're about to sign. You'll see the risk flags for free. Pay the Deed {deed ? near(deed.service.priceNear) : "its price"} and
              you get a plain-words explanation signed inside a secure enclave, so anyone can check it wasn't changed.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-24 sm:px-6 lg:grid-cols-2">
        <Reveal className="space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="mb-3 text-sm font-medium">1. The transaction</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e.label}
                  onClick={() => setText(JSON.stringify(e.tx, null, 2))}
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

        <Reveal delay={0.1} className="space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="mb-3 text-sm font-medium">3. Pay a Deed and get the explanation</div>
            {serving.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Deed is switched on right now. <Link to="/market" className="underline">Browse Deeds</Link>.</p>
            ) : (
              <>
                <select
                  value={deed?.id}
                  onChange={(e) => setDeedId(e.target.value)}
                  className="mb-3 h-10 w-full rounded-xl border border-border bg-background px-3 font-mono text-xs"
                >
                  {serving.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id} · {near(d.service.priceNear)} · owner {d.owner}
                    </option>
                  ))}
                </select>
                <Button className="h-11 w-full rounded-xl" disabled={!parsed || offline || step === "paying" || step === "signing" || step === "asking"} onClick={ask}>
                  {step === "paying" || step === "signing" || step === "asking" ? <Loader2 className="animate-spin" /> : account && !preview ? <ScanSearch /> : <Wallet />}
                  {step === "paying"
                    ? "1/2 Confirm the payment in your wallet…"
                    : step === "signing"
                      ? "2/2 Sign the request (no fee) so only you can use this payment…"
                      : step === "asking"
                      ? "Checking owner, payment, asking the enclave…"
                      : account && !preview
                        ? `Pay ${deed ? near(deed.service.priceNear) : ""} and explain`
                        : "Connect a testnet wallet to pay"}
                </Button>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  The payment goes to the Deed's own account (its owner earns it). The runtime checks, live, that the person who owns
                  the Deed right now switched it on. If anything fails after you pay, the operator refunds you.
                  {health && !health.can_answer && " Note: this runtime has no AI key configured, so paid jobs are refunded."}
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
