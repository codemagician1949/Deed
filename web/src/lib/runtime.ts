// Client for the Preflight runtime (runtime/src/server.ts).
import { CONFIG } from "./config"

export interface RiskFlag {
  code: string
  severity: "high" | "medium" | "info"
  message: string
}
export interface ProposedTx {
  receiver_id: string
  actions: { type: string; params?: Record<string, unknown> }[]
}
export interface Job {
  id: string
  /** v3: the on-chain job id in the Deed contract. */
  escrowJobId?: string
  name: string
  payer: string
  amountYocto: string
  paidAtNs: string
  status: "processing" | "served" | "awaiting_activation" | "refund_due" | "refunded"
  eraOwner: string | null
  activationVersion: number | null
  ownerAtDelivery?: string | null
  /** Absent in the public record (only the payer and the holder see the transaction). */
  request?: ProposedTx
  flags: (RiskFlag | { code: string; severity: RiskFlag["severity"]; message?: undefined })[]
  /** true when this is the public view: question and explanation are left out. */
  redacted?: boolean
  verdict?: { model: string | null; final: "SAFE TO SIGN" | "CHECK FIRST" | "DO NOT SIGN"; raised: boolean }
  settlement?: { outcome: "settled" | "refunded" | "pending"; tx?: string; reason?: string }
  answer?: {
    explanation?: string
    requestSha256?: string
    responseSha256?: string
    model: string
    chatId: string
    signature: { text: string; signature: string; signing_address: string; signing_algo: string } | null
    check: { hashesMatch: boolean; recovered: string | null; signerMatches: boolean; attested?: boolean | null } | null
  }
  reason?: string
  refundTx?: string
  createdAt: string
}

type V = "SAFE TO SIGN" | "CHECK FIRST" | "DO NOT SIGN"
const RANK: V[] = ["SAFE TO SIGN", "CHECK FIRST", "DO NOT SIGN"]
/** Same rule as runtime/src/verdict.ts: the stricter of the model's verdict and the flags' rating. */
export function finalVerdict(job: Pick<Job, "answer" | "flags">): { model: V | null; final: V; raised: boolean } | null {
  if (!job.answer?.explanation) return null
  const m = job.answer.explanation!.match(/Verdict:\s*(SAFE TO SIGN|CHECK FIRST|DO NOT SIGN)/i)
  const model = m ? (m[1].toUpperCase() as V) : null
  const floor: V = job.flags.some((f) => f.severity === "high") ? "DO NOT SIGN" : job.flags.some((f) => f.severity === "medium") ? "CHECK FIRST" : "SAFE TO SIGN"
  const final = RANK[Math.max(RANK.indexOf(floor), model ? RANK.indexOf(model) : 1)]
  return { model, final, raised: final !== model }
}
export interface Health {
  service: string
  runtime_id: string
  model: string
  config_hash: string
  can_answer: boolean
  jobs: number
}

const strip = (u: string) => u.replace(/\/+$/, "")

/** A runtime URL given in the page address (?runtime=https://…), e.g. a buyer's own runtime. */
export function runtimeOverride(): string | null {
  try {
    const u = new URLSearchParams(window.location.search).get("runtime")
    return u && /^https?:\/\//.test(u) ? strip(u) : null
  } catch {
    return null
  }
}

/**
 * Where to reach the runtime a Deed's activation names: ?runtime= override, then the URL the owner
 * recorded on chain in the activation, then the directory, then the default.
 */
export function runtimeUrlFor(runtimeId: string | null | undefined, runtimeUrl?: string | null): string {
  return (
    runtimeOverride() ??
    (runtimeUrl ? strip(runtimeUrl) : runtimeId && CONFIG.runtimes[runtimeId] ? strip(CONFIG.runtimes[runtimeId]) : strip(CONFIG.runtime))
  )
}

/** Every runtime we know of (to collect a Deed's jobs across runtime changes). */
export function knownRuntimes(): string[] {
  return Array.from(new Set([runtimeOverride(), ...Object.values(CONFIG.runtimes).map(strip), strip(CONFIG.runtime)].filter((u): u is string => !!u)))
}

async function call<T>(path: string, init?: RequestInit, base = CONFIG.runtime): Promise<{ status: number; body: T }> {
  const r = await fetch(`${strip(base)}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } })
  return { status: r.status, body: (await r.json()) as T }
}

export const runtimeHealth = (base?: string) => call<Health>("/v1/health", undefined, base).then((r) => r.body)

/**
 * The client-side checks of docs/CLIENTS.md (3 and 4): the runtime we're about to pay through is the one
 * the Deed's current activation names, running the exact config the owner signed.
 */
export function serviceChecks(
  health: Health | null,
  activation: { runtime_id: string; config_hash: string; runtime_url?: string | null } | null | undefined,
  url: string,
) {
  const checks = [
    { label: "This runtime is the one the owner switched on", ok: !!health && !!activation && health.runtime_id === activation.runtime_id },
    { label: "It reports the config fingerprint the owner signed", ok: !!health && !!activation && health.config_hash === activation.config_hash },
  ]
  if (activation?.runtime_url) checks.unshift({ label: "Its address is the one recorded on chain", ok: strip(activation.runtime_url) === strip(url) })
  return checks
}
export type Verdict = "allow" | "warn" | "block"
export interface CounterpartyCheck {
  verdict: Verdict
  reasons: { code: string; verdict: Verdict; account?: string; message: string; source: string }[]
  counterparties: { account: string; exists: boolean | null; is_contract: boolean | null; existed_7d_ago: boolean | null; tx_count: number | null; prior_from_agent: number | null; reports: { reporter: string; reason: string; evidence: string }[] }[]
  policy: { trusted_reporters: string[]; min_reporters: number; source: string }
  reports_contract: string
  checked_at: string
}
/** Free counterparty check (runtime/src/counterparty.ts): allow / warn / block for whoever this transaction pays. */
export const counterpartyCheck = (tx: ProposedTx, agentId?: string) =>
  call<CounterpartyCheck & { error?: string }>("/v1/check", { method: "POST", body: JSON.stringify({ tx, agent_id: agentId || undefined }) }).then((r) => {
    if (r.status !== 200) throw new Error(r.body.error ?? `HTTP ${r.status}`)
    return r.body
  })
export const riskPreview = (request: ProposedTx) =>
  call<{ flags: RiskFlag[] }>("/v1/flags", { method: "POST", body: JSON.stringify({ request }) }).then((r) => r.body.flags)
/** sha256 (hex) of JSON.stringify(request): what pay_job binds the payment to (runtime/src/jobs.ts requestHash). */
export async function requestHash(request: ProposedTx): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(request)))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** Must match runtime/src/owner.ts ownerMessage exactly. */
export const OWNER_RECIPIENT = "deed-console"
export const ownerMessage = (name: string, issuedAt: string) => `Deed holder sign-in\nDeed: ${name}\nIssued: ${issuedAt}`

/** The full job record (questions and answers) for the Deed's current holder, proven by a NEP-413 signature. */
export const ownerJobs = (base: string, body: { name: string; account: string; public_key: string; signature: string; nonce: string; issued_at: string }) =>
  call<{ error?: string; jobs?: Job[] }>("/v1/owner/jobs", { method: "POST", body: JSON.stringify(body) }, base)

export const submitJob = (base: string, input: { job_id: string; request: ProposedTx }) =>
  call<{ error?: string; job?: Job }>("/v1/jobs", { method: "POST", body: JSON.stringify(input) }, base)

/** A Deed's jobs from every known runtime (after a buyer switches runtimes, older jobs stay on the old one). Rejects only if none answers. */
export async function jobsFor(name: string): Promise<Job[]> {
  const results = await Promise.allSettled(knownRuntimes().map((b) => call<{ jobs: Job[] }>(`/v1/jobs?name=${encodeURIComponent(name)}`, undefined, b).then((r) => r.body.jobs)))
  const ok = results.filter((r): r is PromiseFulfilledResult<Job[]> => r.status === "fulfilled")
  if (!ok.length) throw new Error("no runtime reachable")
  const byId = new Map<string, Job>()
  for (const j of ok.flatMap((r) => r.value)) byId.set(j.id, j)
  return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/** Published snapshot of the live ledger (verify/preflight-jobs-testnet.json), used when the runtime isn't reachable. */
export const jobsSnapshot = (name: string) =>
  fetch("/preflight-jobs.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no snapshot"))))
    .then((s: { taken_at: string; jobs: Job[] }) => ({ takenAt: s.taken_at, jobs: s.jobs.filter((j) => j.name === name) }))

const vaultPay = (to: string, yocto: string, memo: string): ProposedTx => ({
  receiver_id: CONFIG.agentVault,
  actions: [{ type: "FunctionCall", params: { methodName: "pay", args: { receiver_id: to, amount: yocto, memo }, gas: "100000000000000", deposit: "0" } }],
})

export const EXAMPLES: { label: string; tx: ProposedTx; agent?: string }[] = [
  {
    label: "Send 5 NEAR to a friend",
    tx: { receiver_id: "friend.testnet", actions: [{ type: "Transfer", params: { deposit: "5000000000000000000000000" } }] },
  },
  {
    label: "Approve unlimited token spending",
    tx: {
      receiver_id: "usdc.fakes.testnet",
      actions: [{ type: "FunctionCall", params: { methodName: "ft_approve", args: { spender_id: "dex-promo.testnet", amount: "340282366920938463463374607431768211455" }, gas: "30000000000000", deposit: "1" } }],
    },
  },
  {
    label: "Add a full-access key (drainer pattern)",
    tx: { receiver_id: "me.testnet", actions: [{ type: "AddKey", params: { publicKey: "ed25519:8hSHprDq2StXwMtNd43wDTXQYsjXcD4MJTXQYsjXcD4M", accessKey: { permission: "FullAccess" } } }] },
  },
  {
    label: "Send an NFT to a marketplace",
    tx: {
      receiver_id: "nft.examples.testnet",
      actions: [{ type: "FunctionCall", params: { methodName: "nft_transfer_call", args: { receiver_id: "market.testnet", token_id: "42", msg: "{\"price\":\"1\"}" }, gas: "100000000000000", deposit: "1" } }],
    },
  },
  ...(CONFIG.agentVault
    ? [
        { label: "Agent pays a look-alike from a tampered invoice", tx: vaultPay(`mayastudio-billing.${CONFIG.root}`, "400000000000000000000000", "invoice 1043"), agent: CONFIG.agentVault },
        { label: "Agent pays its usual vendor", tx: vaultPay(`maya.${CONFIG.root}`, "100000000000000000000000", "invoice 1044"), agent: CONFIG.agentVault },
      ]
    : []),
]
