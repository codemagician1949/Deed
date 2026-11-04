// Command-line client: how an agent (or a person with near-cli-rs) uses a Deed's Preflight service.
// 1. reads the Deed's current price from its activation, 2. pays the Deed's own account,
// 3. signs the job (NEP-413) binding that payment to this exact request, 4. submits and prints the answer.
//
//   bun run ask --as maya.deedhq.testnet [--deed preflight.deedbot.deedhq.testnet] [--runtime https://...] [--request tx.json | --example approve]
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { CONFIG } from "./config"
import { jobMessage, RECIPIENT } from "./nep413"

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : d
}
const as = arg("as")
const deed = arg("deed", "preflight.deedbot.deedhq.testnet")!
const runtime = (arg("runtime", process.env.RUNTIME_URL ?? `http://localhost:${CONFIG.port}`) ?? "").replace(/\/$/, "")
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
const priceNear = (Number(BigInt(activation.price_yocto) / 10n ** 18n) / 1e6).toString()
console.log(`Paying ${priceNear} NEAR to ${deed} (switched on by ${activation.owner}, v${activation.version})…`)
const pay = near("tokens", as, "send-near", deed, `${priceNear} NEAR`, "network-config", "testnet", "sign-with-legacy-keychain", "send")
const paymentTx = pay.out.match(/Transaction ID: ([1-9A-HJ-NP-Za-km-z]+)/)?.[1]
if (!pay.ok || !paymentTx) {
  console.error("Payment failed:", pay.out.split("\n").filter(Boolean).slice(-2).join(" | "))
  process.exit(1)
}
console.log(`  payment ${paymentTx}`)

const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64")
const sig = near("message", "sign-nep413", "utf8", jobMessage(deed, paymentTx, request), "nonce", nonce, "recipient", RECIPIENT, "sign-as", as, "sign-with-legacy-keychain", "network-config", "testnet")
const publicKey = sig.out.match(/"publicKey": "([^"]+)"/)?.[1]
const signature = sig.out.match(/"signature": "([^"]+)"/)?.[1]
if (!sig.ok || !publicKey || !signature) {
  console.error("Signing failed:", sig.out.split("\n").filter(Boolean).slice(-2).join(" | "))
  process.exit(1)
}
await Bun.sleep(2500) // let the payment reach finality
console.log(`Asking ${runtime}…`)
const res = await fetch(`${runtime}/v1/jobs`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: deed, payment_tx: paymentTx, sender: as, request, auth: { public_key: publicKey, signature, nonce } }),
})
const body = (await res.json()) as { error?: string; job?: { status: string; reason?: string; flags: { severity: string; message: string }[]; answer?: { explanation: string; check?: Record<string, unknown> }; verdict?: { final: string; raised: boolean } } }
console.log(`HTTP ${res.status} · ${body.job?.status ?? body.error}`)
for (const f of body.job?.flags ?? []) console.log(`  [${f.severity}] ${f.message}`)
if (body.job?.answer) {
  console.log(`\n${body.job.answer.explanation}\n`)
  console.log("enclave checks:", body.job.answer.check)
  if (body.job.verdict?.raised) console.log(`final verdict: ${body.job.verdict.final} (raised by the risk flags)`)
} else if (body.job?.reason) console.log(body.job.reason)
