import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { ArrowRight, CircleCheck, Loader2, Power, Signature, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Aurora } from "@/components/bits"
import { Page, Reveal, ease } from "@/components/motion"
import { activateNew, rent } from "@/lib/actions"
import { CONFIG } from "@/lib/config"
import { explorerTx, near } from "@/lib/format"
import { toNear, view } from "@/lib/near"
import { useWallet } from "@/lib/wallet"
import { cn } from "@/lib/utils"

type Quote = { state: "idle" | "checking" | "free" | "taken" | "invalid"; totalYocto?: string; reason?: string }

const LABEL = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Turns a registry panic like {"code":"label_too_short"} into words. */
function readable(e: unknown): string {
  const m = String(e instanceof Error ? e.message : e)
  const code = m.match(/"code\\?":\\?"([a-z_]+)/)?.[1] ?? m.match(/\b([a-z]+(?:_[a-z]+)+)\b/)?.[1]
  const words: Record<string, string> = {
    label_too_short: "That name is too short.",
    length_out_of_bounds: "That name is too short or too long.",
    disallowed_character: "Use only lowercase letters, digits and single hyphens.",
    sub_account_name_taken: "Someone already has that name.",
    rate_stale: "The registry's price feed is out of date; try again later.",
  }
  return (code && words[code]) ?? m.slice(0, 160)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function NewDeedPage() {
  const { account, preview, connect, call } = useWallet()
  const [label, setLabel] = useState("")
  const [price, setPrice] = useState("0.05")
  const [quote, setQuote] = useState<Quote>({ state: "idle" })
  const [step, setStep] = useState<"choose" | "renting" | "rented" | "activating" | "done">("choose")
  const [txs, setTxs] = useState<{ rent?: string; activate?: string }>({})
  const tokenId = `${label}.${CONFIG.tla}`

  useEffect(() => {
    if (step !== "choose") return
    if (!label) return setQuote({ state: "idle" })
    if (!LABEL.test(label)) return setQuote({ state: "invalid", reason: "Use only lowercase letters, digits and single hyphens." })
    setQuote({ state: "checking" })
    let live = true
    const t = setTimeout(async () => {
      try {
        const token = await view<unknown>(CONFIG.registry, "nft_token", { token_id: tokenId })
        if (!live) return
        if (token) return setQuote({ state: "taken", reason: "Someone already has that name." })
        const q = await view<{ total_yocto: string }>(CONFIG.registry, "get_rent_price", { tla_id: CONFIG.tla, name: label })
        if (live) setQuote({ state: "free", totalYocto: q.total_yocto })
      } catch (e) {
        if (live) setQuote({ state: "invalid", reason: readable(e) })
      }
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [label, tokenId, step])

  const needWallet = !account || preview

  const doRent = async () => {
    if (needWallet) return void connect().catch(() => undefined)
    if (quote.state !== "free" || !quote.totalYocto) return
    try {
      setStep("renting")
      const tx = await rent(call, label, quote.totalYocto)
      setTxs((t) => ({ ...t, rent: tx }))
      // Wait until the registry shows the new owner (the account is created in a few blocks).
      for (let i = 0; i < 20; i++) {
        const t = await view<{ owner_id: string } | null>(CONFIG.registry, "nft_token", { token_id: tokenId }).catch(() => null)
        if (t?.owner_id === account) break
        await sleep(1500)
      }
      setStep("rented")
    } catch (e) {
      setStep("choose")
      toast.error("Not rented", { description: readable(e) })
    }
  }

  const doActivate = async () => {
    if (needWallet) return void connect().catch(() => undefined)
    try {
      setStep("activating")
      const tx = await activateNew(call, tokenId, price)
      setTxs((t) => ({ ...t, activate: tx }))
      setStep("done")
    } catch (e) {
      setStep("rented")
      toast.error("Not switched on", { description: readable(e) })
    }
  }

  const validPrice = /^\d+(\.\d{1,6})?$/.test(price) && Number(price) > 0

  return (
    <Page>
      <section className="relative">
        <Aurora hue={120} />
        <div className="relative mx-auto max-w-3xl px-4 pt-10 pb-8 sm:px-6">
          <Reveal>
            <div className="mb-3 text-xs font-medium tracking-[0.2em] text-primary uppercase">Your own Deed, in two signatures</div>
            <h1 className="font-heading text-5xl leading-none tracking-tight sm:text-7xl">Start a Deed</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Claim a name, then switch Preflight on under it. The name is yours: its own wallet, its earnings, and the right to sell it. You need a NEAR testnet
              wallet with about 0.5 test NEAR (free from the testnet faucet).
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-3xl space-y-4 px-4 pb-28 sm:px-6">
        <Reveal className={cn("rounded-3xl border bg-card p-5", step === "choose" || step === "renting" ? "border-primary/40" : "border-border")}>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            {step === "choose" || step === "renting" ? <Signature className="size-4" /> : <CircleCheck className="size-4 text-primary" />} 1. Claim a name
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value.toLowerCase().trim())}
              disabled={step !== "choose"}
              placeholder="myservice"
              className="h-11 rounded-xl font-mono"
              aria-label="Name"
            />
            <span className="shrink-0 font-mono text-xs text-muted-foreground">.{CONFIG.tla}</span>
          </div>
          <div className="mt-2 min-h-5 text-xs">
            {quote.state === "checking" && <span className="text-muted-foreground">Checking…</span>}
            {quote.state === "free" && quote.totalYocto && (
              <span className="text-primary">Available · {near(toNear(quote.totalYocto), 3)} (rent + the new account's starting balance)</span>
            )}
            {(quote.state === "taken" || quote.state === "invalid") && <span className="text-destructive">{quote.reason}</span>}
          </div>
          {step === "choose" || step === "renting" ? (
            <Button className="mt-3 h-11 w-full rounded-xl" disabled={!needWallet && (quote.state !== "free" || step === "renting")} onClick={doRent}>
              {step === "renting" ? <Loader2 className="animate-spin" /> : needWallet ? <Wallet /> : <Signature />}
              {step === "renting" ? "Confirm in your wallet, then the account is created…" : needWallet ? "Connect a testnet wallet" : `Claim ${label || "the name"}`}
            </Button>
          ) : (
            txs.rent && (
              <a href={explorerTx(txs.rent)} target="_blank" rel="noreferrer" className="mt-2 block font-mono text-[11px] text-muted-foreground underline">
                rent transaction {txs.rent.slice(0, 10)}…
              </a>
            )
          )}
        </Reveal>

        <Reveal delay={0.05} className={cn("rounded-3xl border bg-card p-5", step === "rented" || step === "activating" ? "border-primary/40" : "border-border", step === "choose" || step === "renting" ? "opacity-60" : "")}>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            {step === "done" ? <CircleCheck className="size-4 text-primary" /> : <Power className="size-4" />} 2. Switch Preflight on
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Records on chain that you, the owner, run Preflight under this name at your price. The hosted runtime then answers paid questions, and the
            payments land in your name's wallet.
          </p>
          <div className="flex gap-2">
            <Input value={price} onChange={(e) => setPrice(e.target.value)} disabled={step !== "rented"} className="h-11 rounded-xl" aria-label="Price per job in NEAR" />
            <Button className="h-11 rounded-xl" disabled={step !== "rented" || !validPrice} onClick={doActivate}>
              {step === "activating" ? <Loader2 className="animate-spin" /> : <Power />} Switch on
            </Button>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">NEAR per question</div>
        </Reveal>

        <AnimatePresence>
          {step === "done" && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ease }} className="rounded-3xl border border-primary/40 bg-primary/5 p-5">
              <div className="font-heading text-3xl">{tokenId} is live</div>
              <p className="mt-2 text-sm text-muted-foreground">
                It's your Deed now: its page shows its history from the chain, and you can sell it from <Link to="/console" className="underline">My Deeds</Link>.
                {txs.activate && (
                  <>
                    {" "}
                    <a href={explorerTx(txs.activate)} target="_blank" rel="noreferrer" className="underline">
                      Activation transaction
                    </a>
                    .
                  </>
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="rounded-full" render={<Link to={`/deed/${tokenId}`} />} nativeButton={false}>
                  Open its page <ArrowRight />
                </Button>
                <Button variant="outline" className="rounded-full" render={<Link to="/try" />} nativeButton={false}>
                  Ask it a question
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </Page>
  )
}
