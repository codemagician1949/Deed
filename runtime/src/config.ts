import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, "..", "..")

// Load the repo-root .env too (git-ignored). Never printed.
for (const f of [join(repo, ".env"), join(here, "..", ".env")]) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

const deploy = JSON.parse(readFileSync(join(repo, "deploy", "testnet.json"), "utf8"))

export const CONFIG = {
  rpc: process.env.RPC ?? deploy.rpc,
  txApi: process.env.TX_API ?? "https://tx.test.fastnear.com",
  registry: deploy.registry as string,
  /** The team account that deployed this replica (its runtime is the hosted one). */
  root: deploy.root as string,
  deed: deploy.deed as string,
  /** The account owners name as runtime_id when they switch on. Refunds are paid from it. */
  runtimeId: process.env.RUNTIME_ID ?? (deploy.root as string),
  nearAiBase: process.env.NEARAI_BASE ?? "https://cloud-api.near.ai/v1",
  nearAiKey: process.env.NEARAI_API_KEY ?? "",
  /** Function-call key of runtimeId, limited to settle_job/refund_job on the Deed contract (deploy/runtime-key.sh). */
  runtimeKey: process.env.RUNTIME_KEY ?? "",
  port: Number(process.env.PORT ?? 8787),
  dataFile: process.env.JOBS_FILE ?? join(here, "..", "data", "jobs.json"),
  /** On first boot with an empty volume, start from this published ledger snapshot (keeps replay protection). */
  seedJobs: process.env.SEED_JOBS ?? "",
}

// The public service config. Its sha256 is the config_hash owners sign at activation; the runtime
// serves only activations that name exactly this config, so the fingerprint proves what ran.
const configPath = join(here, "..", "preflight.config.json")
const configBytes = readFileSync(configPath)
export const SERVICE = JSON.parse(configBytes.toString("utf8")) as {
  service: string
  model: string
  system_prompt: string
  max_tokens: number
  temperature: number
  reasoning_effort?: string
}
export const CONFIG_HASH = createHash("sha256").update(configBytes).digest("hex")
export const CONFIG_BYTES = configBytes
