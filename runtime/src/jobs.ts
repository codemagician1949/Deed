// The Preflight job lifecycle. Rules (THREAT_MODEL.md §D, written before this code):
//
//   A job belongs to the owner on whose watch its payment landed.
//   - Accept: payment is final, to this name, from the caller, >= the activated price, < 24 h old;
//     AND a FRESH owner read (no cache) equals the signer of the current activation, which names
//     this runtime. Any chain read failure => refuse (fail closed, D5).
//   - Serve: an accepted job is ALWAYS delivered, even if the name is sold mid-job (D1). Its payment
//     landed before the sale, so the protocol sweep paid it to the seller; the customer is served.
//   - Paid before the latest ownership change => that owner's service is gone: refund_due (operator pays).
//   - Paid after the change but the new owner hasn't switched on yet => awaiting_activation; served
//     once they do, refund_due after 24 h.
//   - Inference fails => refund_due.
//   - One payment, one job: the payment tx hash is the job id (D4).
import { finalVerdict } from "./verdict"
import { jobMessage, RECIPIENT, verifyNep413 } from "./nep413"
import { riskFlags, type ProposedTx, type RiskFlag } from "./risk"
import type { SignatureCheck } from "./tee"

export interface Activation {
  owner: string
  runtime_id: string
  config_hash: string
  price_yocto: string
  version: number
  activated_at_ns: string
}
export interface Payment {
  hash: string
  signer: string
  receiver: string
  depositYocto: bigint
  timestampNs: bigint
  success: boolean
}
export interface Chain {
  owner(name: string): Promise<string | null>
  activation(name: string): Promise<Activation | null>
  payment(txHash: string, sender: string): Promise<Payment | null>
  /** Block time (ns) of the latest ownership change of the name, 0n if never moved. */
  lastRotationNs(name: string): Promise<bigint>
  /** Whether publicKey ("ed25519:...") is a full-access key of account right now. */
  hasFullAccessKey(account: string, publicKey: string): Promise<boolean>
  /** Seller of the name's active listing in the sale escrow, or null if it isn't listed. */
  listingSeller(name: string): Promise<string | null>
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
export interface Inference {
  explain(tx: ProposedTx, flags: RiskFlag[]): Promise<Answer>
}

export type JobStatus = "processing" | "served" | "awaiting_activation" | "refund_due" | "refunded"
export interface Job {
  id: string
  name: string
  payer: string
  amountYocto: string
  paidAtNs: string
  status: JobStatus
  /** Owner whose activation accepted the job (the "era" the payment belongs to). */
  eraOwner: string | null
  activationVersion: number | null
  /** Owner read again at delivery; differs from eraOwner when the name was sold mid-job (D1). */
  ownerAtDelivery?: string | null
  request: ProposedTx
  flags: RiskFlag[]
  answer?: Answer
  /** Stricter of the model's verdict and the flags' rating (see verdict.ts). */
  verdict?: ReturnType<typeof finalVerdict>
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
  /** Accounts that are never valid owners for serving (the sale escrow holds names while listed). */
  escrow: string
  /** sha256 of the service config this runtime runs; activations must name it. Unset = don't check. */
  configHash?: string
  now: () => number
}
export interface JobInput {
  name: string
  payment_tx: string
  sender: string
  request: ProposedTx
  /** NEP-413 signature by the sender over jobMessage(name, payment_tx, request). */
  auth?: { public_key: string; signature: string; nonce: string /* base64, 32 bytes */ }
}
export interface JobResult {
  http: number
  job?: Job
  error?: string
}

const DAY_MS = 24 * 3600 * 1000
const nsToMs = (ns: bigint) => Number(ns / 1_000_000n)
const NAME_RE = /^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/
const HASH_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/

// Payments currently being checked; closes the race where two requests reuse one payment at once (D4).
const inflight = new Set<string>()

export async function submitJob(d: Deps, input: JobInput): Promise<JobResult> {
  if (input?.payment_tx && inflight.has(input.payment_tx)) {
    return { http: 409, error: "This payment is already being used for a job right now." }
  }
  if (input?.payment_tx) inflight.add(input.payment_tx)
  try {
    return await submitJobInner(d, input)
  } finally {
    if (input?.payment_tx) inflight.delete(input.payment_tx)
  }
}

async function submitJobInner(d: Deps, input: JobInput): Promise<JobResult> {
  if (!input || !NAME_RE.test(input.name ?? "") || !HASH_RE.test(input.payment_tx ?? "") || !NAME_RE.test(input.sender ?? "") && !/^[0-9a-f]{64}$/.test(input.sender ?? "")) {
    return { http: 400, error: "Send {name, payment_tx, sender, request}: the Deed name, the hash of your payment to it, the account that paid, and the transaction to explain." }
  }
  if (!input.request || typeof input.request.receiver_id !== "string" || !Array.isArray(input.request.actions)) {
    return { http: 400, error: "request must be {receiver_id, actions[]} describing the transaction you want explained." }
  }

  // The caller must prove they control the paying account and bind this payment to this request.
  const auth = input.auth
  let nonce: Uint8Array | null = null
  try {
    nonce = auth?.nonce ? Uint8Array.from(Buffer.from(auth.nonce, "base64")) : null
  } catch {
    nonce = null
  }
  if (!auth || !nonce || nonce.length !== 32) {
    return { http: 401, error: `Sign the job with the paying account (NEP-413, recipient "${RECIPIENT}") and send auth {public_key, signature, nonce}.` }
  }
  const signedOk = verifyNep413({
    message: jobMessage(input.name, input.payment_tx, input.request),
    nonce,
    recipient: RECIPIENT,
    publicKey: auth.public_key,
    signature: auth.signature,
  })
  if (!signedOk) return { http: 401, error: "The signature doesn't match this payment and request. Sign the exact job message." }

  // D4: one payment, one job.
  const existing = d.store.get(input.payment_tx)
  if (existing) {
    return { http: 409, job: existing, error: `This payment already paid for a job (status: ${existing.status}). Each payment buys one answer.` }
  }

  // Fresh chain reads; any failure => refuse without recording anything (D5).
  // Cheapest check first: the signing key must belong to the claimed payer (one fast RPC read).
  try {
    if (!(await d.chain.hasFullAccessKey(input.sender, auth.public_key))) {
      return { http: 401, error: `${auth.public_key} is not a full-access key of ${input.sender}.` }
    }
  } catch (e) {
    return { http: 503, error: `Can't verify your key right now (${e instanceof Error ? e.message : e}). Nothing was recorded; try again.` }
  }

  let owner: string | null, activation: Activation | null, payment: Payment | null, rotation: bigint
  try {
    ;[owner, activation, payment, rotation] = await Promise.all([
      d.chain.owner(input.name),
      d.chain.activation(input.name),
      d.chain.payment(input.payment_tx, input.sender),
      d.chain.lastRotationNs(input.name),
    ])
    owner = await servingOwner(d, input.name, owner)
  } catch (e) {
    return { http: 503, error: `Can't verify the owner or your payment right now (${e instanceof Error ? e.message : e}). Nothing was recorded; try again.` }
  }
  if (!owner) return { http: 404, error: `${input.name} is not a Deed in this registry.` }
  if (!payment || !payment.success) return { http: 402, error: "Payment not found or failed. Send NEAR to the Deed name, then submit that transaction hash." }
  if (payment.receiver !== input.name) return { http: 402, error: `That payment went to ${payment.receiver}, not ${input.name}.` }
  if (payment.signer !== input.sender) return { http: 402, error: `That payment was sent by ${payment.signer}, not ${input.sender}.` }
  if (d.now() - nsToMs(payment.timestampNs) > DAY_MS) return { http: 410, error: "That payment is older than 24 hours. Ask the operator for a refund." }

  if (!(await stillSame(d, input.name, owner, activation, rotation))) {
    return { http: 503, error: "The Deed's ownership or activation changed while your job was being checked. Nothing was recorded; submit the same payment again." }
  }

  const now = new Date(d.now()).toISOString()
  const job: Job = {
    id: input.payment_tx,
    name: input.name,
    payer: payment.signer,
    amountYocto: payment.depositYocto.toString(),
    paidAtNs: payment.timestampNs.toString(),
    status: "processing",
    eraOwner: null,
    activationVersion: null,
    request: input.request,
    flags: riskFlags(input.request),
    createdAt: now,
    updatedAt: now,
  }

  if (payment.timestampNs < rotation) {
    return save(d, job, "refund_due", "Paid before the Deed changed hands; the previous owner's service can no longer answer.", 409)
  }
  const entitled = isEntitled(d, owner, activation)
  if (!entitled) {
    return save(d, job, "awaiting_activation", "The current owner hasn't switched the service on for this runtime yet. Your payment is held; it will be answered once they do, or refunded after 24 hours.", 202)
  }
  if (payment.depositYocto < BigInt(activation!.price_yocto)) {
    return save(d, job, "refund_due", `Paid less than the price (${activation!.price_yocto} yocto).`, 402)
  }
  job.eraOwner = owner
  job.activationVersion = activation!.version
  return serve(d, job)
}

/**
 * Who the service works for right now. While a Deed is listed, the sale escrow holds the name, but
 * the seller still owns the business (payments made while listed reach them at the sale, invariant
 * B3), so the seller's activation keeps serving until the name is sold or the listing is cancelled.
 */
async function servingOwner(d: Deps, name: string, registryOwner: string | null): Promise<string | null> {
  if (registryOwner !== d.escrow) return registryOwner
  return (await d.chain.listingSeller(name)) ?? registryOwner
}

/**
 * The reads above run in parallel and may come from different blocks. Before recording any decision
 * (serve, hold or refund), read owner, activation and last rotation again: if anything moved between
 * the two reads, nothing is decided and the payer retries.
 * Throws (= fail closed) on RPC trouble.
 */
async function stillSame(d: Deps, name: string, owner: string, activation: Activation | null, rotation: bigint): Promise<boolean> {
  try {
    const [o, a, r] = await Promise.all([d.chain.owner(name), d.chain.activation(name), d.chain.lastRotationNs(name)])
    const o2 = await servingOwner(d, name, o)
    const same = (x: Activation | null, y: Activation | null) =>
      x === y || (!!x && !!y && x.owner === y.owner && x.version === y.version && x.runtime_id === y.runtime_id && x.config_hash === y.config_hash && x.price_yocto === y.price_yocto)
    return o2 === owner && r === rotation && same(a, activation)
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
  d.store.put(job) // claim the payment before the slow part
  try {
    job.answer = await d.inference.explain(job.request, job.flags)
  } catch (e) {
    return save(d, job, "refund_due", `The AI answer failed (${e instanceof Error ? e.message : e}); the operator refunds this payment.`, 502)
  }
  job.verdict = finalVerdict(job.answer.explanation, job.flags)
  // D1: deliver regardless; record who owns it now so a mid-job sale is visible.
  job.ownerAtDelivery = await d.chain.owner(job.name).catch(() => null)
  return save(d, job, "served", undefined, 200)
}

function save(d: Deps, job: Job, status: JobStatus, reason: string | undefined, http: number): JobResult {
  job.status = status
  job.reason = reason
  job.updatedAt = new Date(d.now()).toISOString()
  d.store.put(job)
  return { http, job }
}

/** Serve held jobs once their owner switches on; expire them to refund_due after 24 h. */
export async function resumeAwaiting(d: Deps): Promise<number> {
  let changed = 0
  for (const job of d.store.list().filter((j) => j.status === "awaiting_activation")) {
    if (d.now() - nsToMs(BigInt(job.paidAtNs)) > DAY_MS) {
      save(d, job, "refund_due", "Not answered within 24 hours because the owner never switched on.", 200)
      changed++
      continue
    }
    let owner: string | null, activation: Activation | null, rotation: bigint
    try {
      ;[owner, activation, rotation] = await Promise.all([d.chain.owner(job.name), d.chain.activation(job.name), d.chain.lastRotationNs(job.name)])
      owner = await servingOwner(d, job.name, owner)
    } catch {
      continue // fail closed: try again later
    }
    if (!owner || !(await stillSame(d, job.name, owner, activation, rotation))) continue // changing under us: retry next pass
    if (BigInt(job.paidAtNs) < rotation) {
      save(d, job, "refund_due", "The Deed changed hands again before this was answered.", 200)
      changed++
      continue
    }
    if (owner && activation && isEntitled(d, owner, activation)) {
      if (BigInt(job.amountYocto) < BigInt(activation.price_yocto)) {
        save(d, job, "refund_due", "Paid less than the price the owner set.", 200)
      } else {
        job.eraOwner = owner
        job.activationVersion = activation.version
        await serve(d, job)
      }
      changed++
    }
  }
  return changed
}

/**
 * Marks a refund_due job refunded, given the operator's refund transaction. Checked on chain:
 * a successful transfer FROM this runtime's operator account TO the payer, of at least the amount
 * paid, made AFTER the payment (so an older, unrelated transfer can't be passed off as a refund),
 * and not already used for another job (one refund tx settles exactly one job).
 */
export async function recordRefund(d: Deps, jobId: string, refundTx: string): Promise<{ http: number; error?: string; job?: Job }> {
  const job = d.store.get(jobId)
  if (!job) return { http: 404, error: "No job for that payment." }
  if (job.status !== "refund_due") return { http: 409, error: `Job is ${job.status}, not refund_due.` }
  if (d.store.list().some((j) => j.refundTx === refundTx)) return { http: 409, error: "That refund tx is already used for another job." }
  let p: Payment | null
  try {
    p = await d.chain.payment(refundTx, d.runtimeId)
  } catch (e) {
    return { http: 503, error: `Can't read the refund tx right now (${e instanceof Error ? e.message : e}). Try again.` }
  }
  if (!p || !p.success || p.signer !== d.runtimeId) return { http: 402, error: `Refund tx not found as a successful transfer from ${d.runtimeId}.` }
  if (p.receiver !== job.payer || p.depositYocto < BigInt(job.amountYocto)) return { http: 402, error: `Refund must send at least ${job.amountYocto} yocto to ${job.payer}.` }
  if (p.timestampNs <= BigInt(job.paidAtNs)) return { http: 402, error: "That transfer happened before the payment, so it can't be its refund." }
  // Re-check uniqueness right before writing (another request may have used it meanwhile).
  if (d.store.list().some((j) => j.refundTx === refundTx)) return { http: 409, error: "That refund tx is already used for another job." }
  const done: Job = { ...job, status: "refunded", refundTx, updatedAt: new Date(d.now()).toISOString() }
  d.store.put(done)
  return { http: 200, job: done }
}

/**
 * Crash recovery. A job is written as "processing" before the model is called (so the payment is
 * claimed first). If the runtime dies mid-answer, that job would stay stuck: replay protection refuses
 * a resubmission and it never becomes refundable. On startup, every "processing" job is moved to
 * refund_due. A payment checked but never written is simply unused: the payer can submit it again.
 */
export function recoverInterrupted(d: Deps): number {
  let n = 0
  for (const job of d.store.list().filter((j) => j.status === "processing")) {
    save(d, job, "refund_due", "The runtime restarted while answering; the operator refunds this payment.", 200)
    n++
  }
  return n
}
