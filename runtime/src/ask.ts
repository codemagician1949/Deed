// Command-line client: how an agent (or a person with near-cli-rs) uses a Deed's Preflight service.
// 1. reads the Deed's activation (price, runtime URL), 2. pays the Deed contract's job escrow with
// pay_job(name, sha256(request)), 3. sends {job_id, request} to the runtime and prints the answer and how
// the job settled on chain (paid to the name's wallet, or refunded).
//
//   bun run ask --as maya.deedhq.testnet [--deed preflight.deedbot.deedhq.testnet] [--runtime https://...] [--request tx.json | --example approve]
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { CONFIG } from "./config"
import { requestHash } from "./jobs"

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : d
}
const as = arg("as")
const deed = arg("deed", "preflight.deedbot.deedhq.testnet")!
let runtime = (arg("runtime", process.env.RUNTIME_URL ?? "") ?? "").replace(/\/$/, "")
const EXAMPLES: Record<string, unknown> = {
  approve: { receiver_id: "usdc.fakes.testnet", actions: [{ type: "FunctionCall", params: { methodName: "ft_approve", args: { spender_id: "dex-promo.testnet", amount: "340282366920938463463374607431768211455" }, gas: "30000000000000", deposit: "1" } }] },
  fullkey: { receiver_id: "me.testnet", actions: [{ type: "AddKey", params: { publicKey: "ed25519:8hSHprDq2StXwMtNd43wDTXQYsjXcD4MJTXQYsjXcD4M", accessKey: { permission: "FullAccess" } } }] },
  send: { receiver_id: "friend.testnet", actions: [{ type: "Transfer", params: { deposit: "5000000000000000000000000" } }] },
}
if (!as) {
  console.error("Usage: bun run ask --as <your-account.testnet> [--deed <name>] [--runtime <url>] [--request tx.json | --example approve|fullkey|send]")
  process.exit(2)
}
const request = arg("request") ? JSON.parse(readFileSync(arg("request")!, "utf8")) : EXAMPLES[arg("example", "approve")!]
const near = (...a: string[]) => {
  const r = spawnSync("near", a, { encoding: "utf8" })
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` }
}

const act = await fetch(CONFIG.rpc, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "final", account_id: CONFIG.deed, method_name: "get_activation", args_base64: Buffer.from(JSON.stringify({ token_id: deed })).toString("base64") } }),
}).then((r) => r.json() as Promise<{ result?: { result: number[] } }>)
const activation = act.result ? JSON.parse(Buffer.from(act.result.result).toString()) : null
if (!activation) {
  console.error(`${deed} is not switched on; nothing to pay for.`)
  process.exit(1)
}
runtime ||= (activation.runtime_url ?? `http://localhost:${CONFIG.port}`).replace(/\/$/, "")
const priceNear = (Number(BigInt(activation.price_yocto) / 10n ** 18n) / 1e6).toString()
const hash = requestHash(request)
console.log(`Paying ${priceNear} NEAR into the Deed contract's escrow for ${deed} (switched on by ${activation.owner}, v${activation.version}, runtime ${activation.runtime_id})…`)
const pay = near("contract", "call-function", "as-transaction", CONFIG.deed, "pay_job", "json-args", JSON.stringify({ token_id: deed, request_hash: hash }),
  "prepaid-gas", "30 Tgas", "attached-deposit", `${priceNear} NEAR`, "sign-as", as, "network-config", "testnet", "sign-with-legacy-keychain", "send")
const payTx = pay.out.match(/Transaction ID: ([1-9A-HJ-NP-Za-km-z]+)/)?.[1]
if (!pay.ok || !payTx) {
  console.error("Payment failed:", pay.out.split("\n").filter(Boolean).slice(-2).join(" | "))
  process.exit(1)
}
const txr = await fetch(CONFIG.rpc, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tx", params: { tx_hash: payTx, sender_account_id: as, wait_until: "FINAL" } }),
}).then((r) => r.json() as Promise<{ result?: { status: { SuccessValue?: string } } }>)
const jobId = JSON.parse(Buffer.from(txr.result?.status.SuccessValue ?? "", "base64").toString() || "null") as string | null
if (!jobId) {
  console.error(`Paid (${payTx}) but couldn't read the job id from the transaction.`)
  process.exit(1)
}
console.log(`  pay_job ${payTx} → job ${jobId} (held by ${CONFIG.deed})`)
console.log(`Asking ${runtime}…`)
const res = await fetch(`${runtime}/v1/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_id: jobId, request }) })
const body = (await res.json()) as {
  error?: string
  job?: { status: string; reason?: string; flags: { severity: string; message?: string; code: string }[]; answer?: { explanation: string; check?: Record<string, unknown> }; verdict?: { final: string; raised: boolean }; settlement?: { outcome: string; tx?: string; reason?: string } }
}
console.log(`HTTP ${res.status} · ${body.job?.status ?? body.error}`)
for (const f of body.job?.flags ?? []) console.log(`  [${f.severity}] ${f.message ?? f.code}`)
if (body.job?.answer) {
  console.log(`\n${body.job.answer.explanation}\n`)
  console.log("enclave checks:", body.job.answer.check)
  if (body.job.verdict?.raised) console.log(`final verdict: ${body.job.verdict.final} (raised by the risk flags)`)
} else if (body.job?.reason) console.log(body.job.reason)
if (body.job?.settlement) console.log(`on chain: ${body.job.settlement.outcome}${body.job.settlement.tx ? " " + body.job.settlement.tx : ""}${body.job.settlement.reason ? " (" + body.job.settlement.reason + ")" : ""}`)
