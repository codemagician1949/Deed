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
  name: string
  payer: string
  amountYocto: string
  paidAtNs: string
  status: "processing" | "served" | "awaiting_activation" | "refund_due" | "refunded"
  eraOwner: string | null
  activationVersion: number | null
  ownerAtDelivery?: string | null
  request: ProposedTx
  flags: RiskFlag[]
  answer?: {
    explanation: string
    model: string
    chatId: string
    signature: { text: string; signature: string; signing_address: string; signing_algo: string } | null
    check: { hashesMatch: boolean; recovered: string | null; signerMatches: boolean; attested?: boolean | null } | null
  }
  reason?: string
  refundTx?: string
  createdAt: string
}
export interface Health {
  service: string
  runtime_id: string
  model: string
  can_answer: boolean
  jobs: number
}

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const r = await fetch(`${CONFIG.runtime}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } })
  return { status: r.status, body: (await r.json()) as T }
}

export const runtimeHealth = () => call<Health>("/v1/health").then((r) => r.body)
export const riskPreview = (request: ProposedTx) =>
  call<{ flags: RiskFlag[] }>("/v1/flags", { method: "POST", body: JSON.stringify({ request }) }).then((r) => r.body.flags)
/** Must match runtime/src/nep413.ts jobMessage exactly: binds the Deed, the payment and the exact request. */
export const RECIPIENT = "deed-preflight"
export async function jobMessage(name: string, paymentTx: string, request: ProposedTx): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(request)))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
  return `Preflight job\nDeed: ${name}\nPayment: ${paymentTx}\nRequest sha256: ${hex}`
}

export const submitJob = (input: {
  name: string
  payment_tx: string
  sender: string
  request: ProposedTx
  auth: { public_key: string; signature: string; nonce: string }
}) =>
  call<{ error?: string; job?: Job }>("/v1/jobs", { method: "POST", body: JSON.stringify(input) })
export const jobsFor = (name: string) => call<{ jobs: Job[] }>(`/v1/jobs?name=${encodeURIComponent(name)}`).then((r) => r.body.jobs)

/** Published snapshot of the live ledger (verify/preflight-jobs-testnet.json), used when the runtime isn't reachable. */
export const jobsSnapshot = (name: string) =>
  fetch("/preflight-jobs.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no snapshot"))))
    .then((s: { taken_at: string; jobs: Job[] }) => ({ takenAt: s.taken_at, jobs: s.jobs.filter((j) => j.name === name) }))

export const EXAMPLES: { label: string; tx: ProposedTx }[] = [
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
]
