// Agent-side wrapper: the only way the agent pays. Before signing, it asks Preflight's counterparty
// check about the payment and:
//   block -> refuses, never signs
//   warn  -> asks a human (askHuman); signs only on an explicit yes
//   allow -> signs
// If the check can't be reached, that's treated as warn (ask the human), never as allow.
//
// What it signs is one call: `pay` on the agent's own vault, with the agent's function-call key. The vault
// contract repeats the blocklist check on chain, so an agent that skips this wrapper is still refused.
import type { Signer } from "../src/signer"
import type { CheckResult, Verdict } from "../src/counterparty"

export interface Payment {
  receiver_id: string
  amount_yocto: bigint
  memo: string
}
export type Outcome =
  | { status: "paid"; verdict: Verdict; tx: string; check: CheckResult | null; human?: boolean }
  | { status: "refused"; by: "check" | "human" | "chain"; verdict: Verdict | "unreachable"; reasons: string[]; check: CheckResult | null; tx?: string; error?: string }

export interface GuardDeps {
  checkUrl: string
  vault: string
  signer: Signer
  askHuman(p: Payment, check: CheckResult | null, why: string[]): Promise<boolean>
  log(line: string): void
}

export function payTx(vault: string, p: Payment) {
  return {
    receiver_id: vault,
    actions: [{ type: "FunctionCall", params: { methodName: "pay", args: { receiver_id: p.receiver_id, amount: p.amount_yocto.toString(), memo: p.memo }, gas: "100000000000000", deposit: "0" } }],
  }
}

export async function check(checkUrl: string, vault: string, p: Payment): Promise<CheckResult> {
  const r = await fetch(`${checkUrl.replace(/\/$/, "")}/v1/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tx: payTx(vault, p), agent_id: vault }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!r.ok) throw new Error(`check answered HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()) as CheckResult
}

export async function guardedPay(d: GuardDeps, p: Payment): Promise<Outcome> {
  let c: CheckResult | null = null
  try {
    c = await check(d.checkUrl, d.vault, p)
  } catch (e) {
    d.log(`  check unreachable (${(e as Error).message}); treating it as warn`)
  }
  const verdict: Verdict | "unreachable" = c?.verdict ?? "unreachable"
  const why = c ? c.reasons.filter((x) => x.verdict !== "allow").map((x) => `[${x.verdict}] ${x.message}`) : ["the counterparty check couldn't be reached"]
  d.log(`  check: ${verdict.toUpperCase()}${why.length ? "\n    " + why.join("\n    ") : ""}`)
  if (verdict === "block") {
    d.log(`  REFUSED by the wrapper: not signing.`)
    return { status: "refused", by: "check", verdict, reasons: why, check: c }
  }
  let human: boolean | undefined
  if (verdict === "warn" || verdict === "unreachable") {
    human = await d.askHuman(p, c, why)
    d.log(`  asked a human: ${human ? "approved" : "declined"}`)
    if (!human) return { status: "refused", by: "human", verdict, reasons: why, check: c }
  }
  try {
    const r = await d.signer.call(d.vault, "pay", { receiver_id: p.receiver_id, amount: p.amount_yocto.toString(), memo: p.memo }, 100)
    d.log(`  signed vault.pay with the agent's function-call key: ${r.hash}`)
    return { status: "paid", verdict: verdict === "unreachable" ? "warn" : verdict, tx: r.hash, check: c, human }
  } catch (e) {
    const msg = (e as Error).message
    d.log(`  REFUSED on chain: ${msg}`)
    return { status: "refused", by: "chain", verdict, reasons: why, check: c, tx: (e as { hash?: string }).hash, error: msg }
  }
}
