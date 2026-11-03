// Pays out refund_due jobs from the runtime operator account (THREAT_MODEL decision 2: the
// operator funds refunds, never the Deed). Dry run by default; pass --yes to send.
//   bun run refunds          # show what would be refunded
//   bun run refunds --yes    # send with near-cli-rs (legacy keychain), record tx hashes
import { spawnSync } from "node:child_process"
import { CONFIG } from "./config"
import { fileStore } from "./store"

const store = fileStore(CONFIG.dataFile)
const due = store.list().filter((j) => j.status === "refund_due")
const send = process.argv.includes("--yes")
if (!due.length) {
  console.log("No refunds due.")
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
  if (r.status === 0 && hash) {
    store.put({ ...j, status: "refunded", refundTx: hash, updatedAt: new Date().toISOString() })
    console.log(`  sent: ${hash}`)
  } else {
    console.log(`  FAILED: ${out.split("\n").filter(Boolean).slice(-2).join(" | ")}`)
  }
}
if (!send) console.log("\nDry run. Re-run with --yes to send.")
