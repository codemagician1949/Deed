// Pays out refund_due jobs from the runtime operator account (THREAT_MODEL decision 2: the
// operator funds refunds, never the Deed). Runs on the operator's machine, where the NEAR key is;
// the hosted runtime never holds a key. Dry run by default; pass --yes to send.
//   bun run refunds                                   # local ledger (runtime/data/jobs.json)
//   RUNTIME_URL=https://<host> bun run refunds --yes   # hosted runtime: pay, then post the tx as proof
import { spawnSync } from "node:child_process"
import { CONFIG } from "./config"
import type { Job } from "./jobs"
import { fileStore } from "./store"

const remote = process.env.RUNTIME_URL?.replace(/\/$/, "")
const send = process.argv.includes("--yes")
const store = remote ? null : fileStore(CONFIG.dataFile)
const all: Job[] = remote ? ((await (await fetch(`${remote}/v1/jobs`)).json()) as { jobs: Job[] }).jobs : store!.list()
const due = all.filter((j) => j.status === "refund_due")
if (!due.length) {
  console.log(`No refunds due${remote ? ` on ${remote}` : ""}.`)
  process.exit(0)
}
for (const j of due) {
  const near = (Number(BigInt(j.amountYocto) / 10n ** 18n) / 1e6).toFixed(6)
  console.log(`${send ? "Refunding" : "Would refund"} ${near} NEAR to ${j.payer} for job ${j.id} (${j.reason ?? "no reason"})`)
  if (!send) continue
  const r = spawnSync(
    "near",
    ["tokens", CONFIG.runtimeId, "send-near", j.payer, `${near} NEAR`, "network-config", "testnet", "sign-with-legacy-keychain", "send"],
    { encoding: "utf8" },
  )
  const out = `${r.stdout}${r.stderr}`
  const hash = out.match(/Transaction ID: ([1-9A-HJ-NP-Za-km-z]+)/)?.[1]
  if (r.status !== 0 || !hash) {
    console.log(`  FAILED: ${out.split("\n").filter(Boolean).slice(-2).join(" | ")}`)
    continue
  }
  if (remote) {
    await Bun.sleep(3000)
    const res = await fetch(`${remote}/v1/jobs/${j.id}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refund_tx: hash }),
    })
    console.log(`  sent: ${hash} · recorded by runtime: ${res.status === 200 ? "yes" : `no (${res.status} ${await res.text()})`}`)
  } else {
    store!.put({ ...j, status: "refunded", refundTx: hash, updatedAt: new Date().toISOString() })
    console.log(`  sent: ${hash}`)
  }
}
if (!send) console.log("\nDry run. Re-run with --yes to send.")
