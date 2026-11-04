// Preflight HTTP API (v3: job payments are held on chain by the Deed contract).
//   POST /v1/jobs          {job_id, request}  -> the answer; the job is then settled or refunded on chain
//   GET  /v1/jobs?name=    public job record for a Deed: outcomes, verdicts, flags, enclave checks, hashes and
//                          settlement txs. Customers' transactions and the explanations are left out.
//   GET  /v1/jobs/:id      one job, same public view
//   POST /v1/owner/jobs    {name, account, public_key, signature, nonce, issued_at}: the full record (questions
//                          and answers), only for the Deed's CURRENT holder, proven by a NEP-413 signature
//   POST /v1/flags         {request} -> deterministic risk flags (free)
//   GET  /v1/health        what this runtime is and whether it can answer
import { chain } from "./chain"
import { CONFIG, CONFIG_BYTES, CONFIG_HASH, SERVICE } from "./config"
import { recoverInterrupted, retryOnChain, submitJob, type Deps, type Job } from "./jobs"
import { nearAi } from "./nearai"
import { verifyOwner } from "./owner"
import { riskFlags } from "./risk"
import { fileStore } from "./store"
import { publicJob } from "./public"

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
        can_settle: !!CONFIG.runtimeKey,
        jobs: deps.store.list().length,
      })
    }
    if (url.pathname === "/v1/config") return json(200, { config_hash: CONFIG_HASH, config: SERVICE })
    // The exact bytes whose sha256 is the config fingerprint, so anyone can recompute it.
    if (url.pathname === "/v1/config/raw") return new Response(CONFIG_BYTES, { headers: { "content-type": "application/json", ...cors } })
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
        return json(400, { error: "Body must be JSON: {job_id, request}." })
      }
      // The full job goes back to the caller: only someone holding the exact request could get here.
      const r = await submitJob(deps, body as never)
      return json(r.http, { error: r.error, job: r.job && (r.http === 409 ? publicJob(r.job) : r.job) })
    }
    if (url.pathname === "/v1/jobs" && req.method === "GET") {
      const name = url.searchParams.get("name")
      const list = deps.store
        .list()
        .filter((j) => !name || j.name === name)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      return json(200, { jobs: list.map(publicJob) })
    }
    if (url.pathname === "/v1/owner/jobs" && req.method === "POST") {
      let body: Record<string, string>
      try {
        body = (await req.json()) as Record<string, string>
      } catch {
        return json(400, { error: "Body must be JSON: {name, account, public_key, signature, nonce, issued_at}." })
      }
      const v = await verifyOwner(deps, body)
      if (!v.ok) return json(v.http, { error: v.error })
      const list = deps.store
        .list()
        .filter((j) => j.name === body.name)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      return json(200, { holder: body.account, jobs: list })
    }
    const m = url.pathname.match(/^\/v1\/jobs\/([0-9]{1,18}|[1-9A-HJ-NP-Za-km-z]{43,44})$/)
    if (m && req.method === "GET") {
      const j = deps.store.get(m[1])
      return j ? json(200, { job: publicJob(j) }) : json(404, { error: "No such job." })
    }
    return json(404, { error: "Not found. See GET /v1/health." })
  },
})

// Jobs left mid-answer by a crash or redeploy are refunded on chain; failed on-chain calls are retried.
void recoverInterrupted(deps).then((n) => n && console.log(`refunded ${n} interrupted job(s)`))
setInterval(() => void retryOnChain(deps).catch(() => undefined), 60_000)
console.log(
  `Preflight runtime ${CONFIG.runtimeId} on http://localhost:${server.port} (model ${SERVICE.model}, config ${CONFIG_HASH.slice(0, 12)}…, answers: ${CONFIG.nearAiKey ? "on" : "OFF: set NEARAI_API_KEY"}, on-chain settle: ${CONFIG.runtimeKey ? "on" : "OFF: set RUNTIME_KEY"})`,
)
