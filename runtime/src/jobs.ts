// The Preflight job lifecycle (THREAT_MODEL.md §D), v3: payments are held on chain by the Deed contract.
//
//   1. The customer calls `deed.pay_job(name, sha256(request))` with at least the activated price. The
//      contract holds the money and records the job: payer, amount, the runtime and activation version it
//      was paid under, and the request hash.
//   2. The customer sends {job_id, request} here. This runtime serves it only if the on-chain job is still
//      pending, was paid to THIS runtime, matches this exact request, and a FRESH read shows the activation
//      it was paid under is still current and its owner still owns the name (or listed it for sale).
//      Any chain read failure => refuse and record nothing (fail closed, D5).
//   3. Served => `settle_job`: the contract re-checks the owner and pays the name's own wallet (or refunds
//      the payer if the name changed hands meanwhile). Not entitled, or the model failed => `refund_job`.
//      If this runtime never acts, anyone can refund the job on chain after the contract's timeout.
//   One on-chain job, one answer: the contract settles or refunds a job once (D4).
import { createHash } from "node:crypto"
import { finalVerdict } from "./verdict"
import { riskFlags, type ProposedTx, type RiskFlag } from "./risk"
import type { SignatureCheck } from "./tee"

export interface Activation {
  owner: string
  runtime_id: string
  runtime_url?: string | null
  config_hash: string
  price_yocto: string
  version: number
  activated_at_ns: string
}
export type EscrowState = "Pending" | "Settling" | { Settled: { answer_hash: string } } | { Refunded: { reason: string } }
export interface EscrowJob {
  id: string
  token_id: string
  payer: string
  amount_yocto: string
  runtime_id: string
  activation_version: number
  activation_owner: string
  request_hash: string
  paid_at_ns: string
  state: EscrowState
}
export interface Chain {
  owner(name: string): Promise<string | null>
  activation(name: string): Promise<Activation | null>
  /** Seller of the name's active listing in the sale escrow, or null if it isn't listed. */
  listingSeller(name: string): Promise<string | null>
  job(jobId: string): Promise<EscrowJob | null>
  settle(jobId: string, answerHash: string): Promise<{ tx: string; state: EscrowState }>
  refund(jobId: string): Promise<{ tx: string; state: EscrowState }>
}
export interface Answer {
  explanation: string
  model: string
  chatId: string
  requestBody: string
  responseBody: string
  signature: { text: string; signature: string; signing_address: string; signing_algo: string } | null
  check: SignatureCheck | null
}
/** Named in the signed request, so a signed answer is bound to this Deed, job, runtime and config. */
export interface JobContext {
  deed: string
  job_id: string
  runtime_id: string
  config_hash?: string
}
export interface Inference {
  explain(tx: ProposedTx, flags: RiskFlag[], job?: JobContext): Promise<Answer>
}

/** "refund_due" / "awaiting_activation" only appear on jobs from before v3 (direct payments). */
export type JobStatus = "processing" | "served" | "refunded" | "refund_due" | "awaiting_activation"
export interface Job {
  id: string
  /** v3: the on-chain job id in the Deed contract (absent on pre-v3 jobs, whose id is a payment tx). */
  escrowJobId?: string
  name: string
  payer: string
  amountYocto: string
  paidAtNs: string
  status: JobStatus
  /** Owner whose activation the job was paid under. */
  eraOwner: string | null
  activationVersion: number | null
  /** Owner read again at delivery; differs from eraOwner when the name was sold mid-job (D1). */
  ownerAtDelivery?: string | null
  request: ProposedTx
  flags: RiskFlag[]
  answer?: Answer
  verdict?: ReturnType<typeof finalVerdict>
  /** On-chain outcome: settled to the name's wallet, or refunded to the payer, with its tx. */
  settlement?: { outcome: "settled" | "refunded" | "pending"; tx?: string; reason?: string }
  reason?: string
  refundTx?: string
  createdAt: string
  updatedAt: string
}
export interface Store {
  get(id: string): Job | undefined
  put(job: Job): void
  list(): Job[]
}
export interface Deps {
  chain: Chain
  inference: Inference
  store: Store
  runtimeId: string
  /** The sale escrow (the Deed contract): it holds names while they are listed. */
  escrow: string
  /** sha256 of the service config this runtime runs; activations must name it. Unset = don't check. */
  configHash?: string
  now: () => number
}
export interface JobInput {
  job_id: string
  request: ProposedTx
}
export interface JobResult {
  http: number
  job?: Job
  error?: string
}

const JOB_ID_RE = /^[0-9]{1,18}$/
export const requestHash = (request: ProposedTx) => createHash("sha256").update(JSON.stringify(request)).digest("hex")
const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex")
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Jobs currently being checked; closes the race where two requests use one job at once (D4).
const inflight = new Set<string>()

export async function submitJob(d: Deps, input: JobInput): Promise<JobResult> {
  const key = String(input?.job_id ?? "")
  if (inflight.has(key)) return { http: 409, error: "This job is already being answered right now." }
  inflight.add(key)
  try {
    return await submitJobInner(d, input)
  } finally {
    inflight.delete(key)
  }
}

async function submitJobInner(d: Deps, input: JobInput): Promise<JobResult> {
  if (!input || !JOB_ID_RE.test(String(input.job_id ?? ""))) {
    return { http: 400, error: "Send {job_id, request}: the id pay_job returned, and the exact transaction you paid to have explained." }
  }
  if (!input.request || typeof input.request.receiver_id !== "string" || !Array.isArray(input.request.actions)) {
    return { http: 400, error: "request must be {receiver_id, actions[]} describing the transaction you want explained." }
  }
  const existing = d.store.get(input.job_id)
  if (existing) return { http: 409, job: existing, error: `This job was already handled (status: ${existing.status}). Each payment buys one answer.` }

  let ej: EscrowJob | null
  try {
    ej = await d.chain.job(input.job_id)
  } catch (e) {
    return { http: 503, error: `Can't read your job on chain right now (${errMsg(e)}). Nothing was recorded; try again.` }
  }
  if (!ej) return { http: 404, error: `No job ${input.job_id} in the Deed contract. Pay with pay_job first, then send the id it returned.` }
  if (ej.runtime_id !== d.runtimeId) return { http: 403, error: `Job ${ej.id} was paid to runtime ${ej.runtime_id}, not this one (${d.runtimeId}). Send it there.` }
  if (ej.state !== "Pending") return { http: 409, error: `Job ${ej.id} is no longer pending on chain (${JSON.stringify(ej.state)}).` }
  if (requestHash(input.request) !== ej.request_hash) {
    return { http: 400, error: "This request doesn't match the hash you paid for. Send the exact transaction you hashed in pay_job (sha256 of its JSON)." }
  }

  let owner: string | null, activation: Activation | null
  try {
    ;[owner, activation] = await Promise.all([d.chain.owner(ej.token_id), d.chain.activation(ej.token_id)])
    owner = await servingOwner(d, ej.token_id, owner)
  } catch (e) {
    return { http: 503, error: `Can't verify the Deed's owner right now (${errMsg(e)}). Nothing was recorded; try again.` }
  }
  if (!(await stillSame(d, ej.token_id, owner, activation))) {
    return { http: 503, error: "The Deed's ownership or activation changed while your job was being checked. Nothing was recorded; send it again." }
  }

  const now = new Date(d.now()).toISOString()
  const job: Job = {
    id: ej.id,
    escrowJobId: ej.id,
    name: ej.token_id,
    payer: ej.payer,
    amountYocto: ej.amount_yocto,
    paidAtNs: ej.paid_at_ns,
    status: "processing",
    eraOwner: ej.activation_owner,
    activationVersion: ej.activation_version,
    request: input.request,
    flags: riskFlags(input.request),
    createdAt: now,
    updatedAt: now,
  }
  if (!owner || !isEntitled(d, owner, activation) || activation!.version !== ej.activation_version) {
    return refundOnChain(d, job, "The Deed changed hands or its service changed since you paid, so this runtime may not answer it. Your payment is returned on chain.", 409)
  }
  return serve(d, job)
}

/**
 * Who the service works for right now. While a Deed is listed, the sale escrow holds the name, but the
 * seller still owns the business (the activation stays until the sale; payments made while listed reach
 * the seller at the sale, B3), so the seller's activation keeps serving until the sale or a cancel.
 */
async function servingOwner(d: Deps, name: string, registryOwner: string | null): Promise<string | null> {
  if (registryOwner !== d.escrow) return registryOwner
  return (await d.chain.listingSeller(name)) ?? registryOwner
}

/**
 * The two reads above run in parallel and may come from different blocks. Before deciding, read them
 * again: if anything moved, nothing is decided and the customer retries (D7). Read failure = not same.
 */
async function stillSame(d: Deps, name: string, owner: string | null, activation: Activation | null): Promise<boolean> {
  try {
    const [o, a] = await Promise.all([d.chain.owner(name), d.chain.activation(name)])
    const o2 = await servingOwner(d, name, o)
    const same = (x: Activation | null, y: Activation | null) =>
      x === y || (!!x && !!y && x.owner === y.owner && x.version === y.version && x.runtime_id === y.runtime_id && x.config_hash === y.config_hash && x.price_yocto === y.price_yocto)
    return o2 === owner && same(a, activation)
  } catch {
    return false
  }
}

/** The person who owns the name right now switched on THIS runtime running THIS config. */
function isEntitled(d: Deps, owner: string, activation: Activation | null): boolean {
  return (
    !!activation &&
    owner !== d.escrow &&
    activation.owner === owner &&
    activation.runtime_id === d.runtimeId &&
    (!d.configHash || activation.config_hash === d.configHash)
  )
}

async function serve(d: Deps, job: Job): Promise<JobResult> {
  job.status = "processing"
  job.updatedAt = new Date(d.now()).toISOString()
  d.store.put(job) // claim the job before the slow part
  try {
    job.answer = await d.inference.explain(job.request, job.flags, { deed: job.name, job_id: job.escrowJobId ?? job.id, runtime_id: d.runtimeId, config_hash: d.configHash })
  } catch (e) {
    return refundOnChain(d, job, `The AI answer failed (${errMsg(e)}); your payment is returned on chain.`, 502)
  }
  job.verdict = finalVerdict(job.answer.explanation, job.flags)
  // D1: deliver regardless; record who owns it now so a mid-job sale is visible.
  job.ownerAtDelivery = await d.chain.owner(job.name).catch(() => null)
  job.status = "served"
  d.store.put(job)
  await settleOnChain(d, job)
  return { http: 200, job: d.store.get(job.id) ?? job }
}

/** Ask the contract to pay the name's wallet for a delivered answer. It refunds instead if the name changed hands. */
async function settleOnChain(d: Deps, job: Job): Promise<void> {
  try {
    const r = await d.chain.settle(job.escrowJobId!, sha256Hex(job.answer!.responseBody))
    const refunded = typeof r.state === "object" && "Refunded" in r.state
    job.settlement = refunded
      ? { outcome: "refunded", tx: r.tx, reason: (r.state as { Refunded: { reason: string } }).Refunded.reason }
      : { outcome: "settled", tx: r.tx }
  } catch (e) {
    job.settlement = { outcome: "pending", reason: `settle_job failed (${errMsg(e)}); retried automatically` }
  }
  job.updatedAt = new Date(d.now()).toISOString()
  d.store.put(job)
}

async function refundOnChain(d: Deps, job: Job, reason: string, http: number): Promise<JobResult> {
  job.reason = reason
  try {
    const r = await d.chain.refund(job.escrowJobId!)
    job.status = "refunded"
    job.refundTx = r.tx
    job.settlement = { outcome: "refunded", tx: r.tx, reason }
  } catch (e) {
    // The contract still holds the payment; anyone can refund it after the timeout. We retry too.
    job.status = "refund_due"
    job.settlement = { outcome: "pending", reason: `refund_job failed (${errMsg(e)}); retried automatically, and anyone can refund it on chain after the timeout` }
  }
  job.updatedAt = new Date(d.now()).toISOString()
  d.store.put(job)
  return { http, job }
}

/**
 * Retries on-chain duties that failed (RPC trouble): settlements of served jobs and refunds of jobs that
 * couldn't be refunded. Reads the on-chain state first, so a job settled or refunded by anyone else is
 * just recorded, never paid twice (the contract also refuses a second settle/refund).
 */
export async function retryOnChain(d: Deps): Promise<number> {
  let n = 0
  for (const job of d.store.list()) {
    if (!job.escrowJobId) continue
    const needs = job.settlement?.outcome === "pending" || (job.status === "refund_due" && !job.refundTx)
    if (!needs) continue
    let ej: EscrowJob | null
    try {
      ej = await d.chain.job(job.escrowJobId)
    } catch {
      continue
    }
    if (!ej) continue
    if (ej.state !== "Pending") {
      const refunded = typeof ej.state === "object" && "Refunded" in ej.state
      job.settlement = { outcome: refunded ? "refunded" : ej.state === "Settling" ? "pending" : "settled", reason: "recorded from chain" }
      if (refunded && job.status === "refund_due") job.status = "refunded"
      job.updatedAt = new Date(d.now()).toISOString()
      d.store.put(job)
      n++
      continue
    }
    if (job.status === "served") await settleOnChain(d, job)
    else await refundOnChain(d, job, job.reason ?? "retry", 200)
    n++
  }
  return n
}

/**
 * Crash recovery. A job is written as "processing" before the model is called. If the runtime dies
 * mid-answer, the job would stay stuck; on startup each one is refunded on chain (or left for retry).
 */
export async function recoverInterrupted(d: Deps): Promise<number> {
  let n = 0
  for (const job of d.store.list().filter((j) => j.status === "processing")) {
    if (job.escrowJobId) await refundOnChain(d, job, "The runtime restarted while answering; your payment is returned on chain.", 200)
    else {
      job.status = "refund_due"
      job.reason = "The runtime restarted while answering."
      d.store.put(job)
    }
    n++
  }
  return n
}
