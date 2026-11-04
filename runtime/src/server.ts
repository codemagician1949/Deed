// Preflight HTTP API.
//   POST /v1/jobs        {name, payment_tx, sender, request}  -> answer (or held / refund_due)
//   GET  /v1/jobs?name=  public job ledger for a Deed (evidence for its title page)
//   GET  /v1/jobs/:id    one job
//   POST /v1/flags       {request} -> deterministic risk flags (free)
//   GET  /v1/health      what this runtime is and whether it can answer
import { chain } from "./chain"
import { CONFIG, CONFIG_HASH, SERVICE } from "./config"
import { recordRefund, recoverInterrupted, resumeAwaiting, submitJob, type Deps, type Job } from "./jobs"
import { nearAi } from "./nearai"
import { riskFlags } from "./risk"
import { fileStore } from "./store"

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

// Seed only the team's own runtime with its published ledger; another operator starts with an empty ledger.
if (!existsSync(CONFIG.dataFile) && CONFIG.seedJobs && existsSync(CONFIG.seedJobs) && CONFIG.runtimeId === CONFIG.root) {
  mkdirSync(dirname(CONFIG.dataFile), { recursive: true })
  const snap = JSON.parse(readFileSync(CONFIG.seedJobs, "utf8")) as { jobs: Job[] }
  writeFileSync(CONFIG.dataFile, JSON.stringify(snap.jobs, null, 2))
  console.log(`Seeded ledger with ${snap.jobs.length} jobs from ${CONFIG.seedJobs}`)
}

const deps: Deps = {
  chain,
  inference: nearAi,
  store: fileStore(CONFIG.dataFile),
  runtimeId: CONFIG.runtimeId,
  escrow: CONFIG.deed,
  configHash: CONFIG_HASH,
  now: () => Date.now(),
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2), {
    status,
    headers: { "content-type": "application/json", ...cors },
  })
/** Public view: keeps everything needed to verify an answer, drops nothing secret (there is nothing secret). */
const pub = (j: Job) => j

const server = Bun.serve({
  port: CONFIG.port,
  async fetch(req) {
    const url = new URL(req.url)
    if (req.method === "OPTIONS") return new Response(null, { headers: cors })
    if (url.pathname === "/v1/health") {
      return json(200, {
        service: "Preflight",
        runtime_id: CONFIG.runtimeId,
        registry: CONFIG.registry,
        deed_contract: CONFIG.deed,
        model: SERVICE.model,
        config_hash: CONFIG_HASH,
        can_answer: !!CONFIG.nearAiKey,
        jobs: deps.store.list().length,
      })
    }
    if (url.pathname === "/v1/config") return json(200, { config_hash: CONFIG_HASH, config: SERVICE })
    if (url.pathname === "/v1/flags" && req.method === "POST") {
      // Free: the deterministic risk flags, so people see them before paying for the explanation.
      try {
        const body = (await req.json()) as { request?: unknown }
        return json(200, { flags: riskFlags(body.request as never) })
      } catch {
        return json(400, { error: "Body must be JSON: {request: {receiver_id, actions[]}}." })
      }
    }
    if (url.pathname === "/v1/jobs" && req.method === "POST") {
      let body: unknown
      try {
        body = await req.json()
      } catch {
        return json(400, { error: "Body must be JSON: {name, payment_tx, sender, request}." })
      }
      const r = await submitJob(deps, body as never)
      return json(r.http, { error: r.error, job: r.job && pub(r.job) })
    }
    if (url.pathname === "/v1/jobs" && req.method === "GET") {
      const name = url.searchParams.get("name")
      const list = deps.store
        .list()
        .filter((j) => !name || j.name === name)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      return json(200, { jobs: list.map(pub) })
    }
    const rf = url.pathname.match(/^\/v1\/jobs\/([1-9A-HJ-NP-Za-km-z]{43,44})\/refund$/)
    if (rf && req.method === "POST") {
      // Record a refund. No secret needed: the server checks the refund on chain itself
      // (sent by this runtime's operator account, to the payer, for at least the amount paid).
      const job = deps.store.get(rf[1])
      if (!job) return json(404, { error: "No job for that payment." })
      if (job.status !== "refund_due") return json(409, { error: `Job is ${job.status}, not refund_due.` })
      let refundTx = ""
      try {
        refundTx = String(((await req.json()) as { refund_tx?: string }).refund_tx ?? "")
      } catch {
        /* fall through */
      }
      if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(refundTx)) return json(400, { error: "Body must be {refund_tx}." })
      const r = await recordRefund(deps, job.id, refundTx)
      if (r.http !== 200) return json(r.http, { error: r.error })
      return json(200, { job: deps.store.get(job.id) })
    }
    const m = url.pathname.match(/^\/v1\/jobs\/([1-9A-HJ-NP-Za-km-z]{43,44})$/)
    if (m && req.method === "GET") {
      const j = deps.store.get(m[1])
      return j ? json(200, { job: pub(j) }) : json(404, { error: "No job for that payment." })
    }
    return json(404, { error: "Not found. See GET /v1/health." })
  },
})

// Jobs left mid-answer by a crash or redeploy become refund_due (nothing in flight at startup).
const interrupted = recoverInterrupted(deps)
if (interrupted) console.log(`moved ${interrupted} interrupted job(s) to refund_due`)
setInterval(() => void resumeAwaiting(deps).catch(() => undefined), 60_000)
console.log(`Preflight runtime ${CONFIG.runtimeId} on http://localhost:${server.port} (model ${SERVICE.model}, config ${CONFIG_HASH.slice(0, 12)}…, answers: ${CONFIG.nearAiKey ? "on" : "OFF: set NEARAI_API_KEY"})`)
