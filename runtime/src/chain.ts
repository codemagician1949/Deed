// Real chain access for the job rules: registry owner, the Deed's activation and listing, the escrowed
// job, and the runtime's two writes (settle_job / refund_job). Every read is fresh (no cache); any read
// failure throws so the caller fails closed.
import { CONFIG } from "./config"
import type { Activation, Chain, EscrowJob } from "./jobs"
import { makeSigner, type Signer } from "./signer"

let id = 0
async function rpc<T>(method: string, params: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(CONFIG.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 429 && attempt < 3) {
      await Bun.sleep(500 * (attempt + 1))
      continue
    }
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
    const j = (await res.json()) as { result?: T; error?: { cause?: { name?: string }; message?: string } }
    if (j.error) {
      const name = j.error.cause?.name ?? j.error.message ?? "RPC error"
      throw Object.assign(new Error(name), { rpcName: name })
    }
    return j.result as T
  }
}

async function view<T>(contract: string, method: string, args: object): Promise<T> {
  const r = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  })
  return JSON.parse(Buffer.from(r.result).toString("utf8")) as T
}

let signer: Signer | null = null
function getSigner(): Signer {
  if (!CONFIG.runtimeKey) throw new Error("RUNTIME_KEY is not set: this runtime can't settle or refund jobs on chain")
  signer ??= makeSigner(CONFIG.rpc, CONFIG.runtimeId, CONFIG.runtimeKey)
  return signer
}

/** Public half of the runtime's settle/refund key (so anyone can read its remaining gas allowance on chain). */
export function settleKey(): string | null {
  return CONFIG.runtimeKey ? getSigner().publicKey : null
}

export const chain: Chain = {
  async owner(name) {
    const t = await view<{ owner_id: string } | null>(CONFIG.registry, "nft_token", { token_id: name })
    return t?.owner_id ?? null
  },
  async activation(name) {
    return view<Activation | null>(CONFIG.deed, "get_activation", { token_id: name })
  },
  async listingSeller(name) {
    // ListingState is serialized as {"kind": "Active"} (serde tag).
    const l = await view<{ seller: string; state: { kind?: string } | string } | null>(CONFIG.deed, "get_listing", { token_id: name })
    const kind = typeof l?.state === "string" ? l.state : l?.state?.kind
    return l && kind === "Active" ? l.seller : null
  },
  async job(jobId) {
    return view<EscrowJob | null>(CONFIG.deed, "get_job", { job_id: jobId })
  },
  async settle(jobId, answerHash) {
    const r = await getSigner().call(CONFIG.deed, "settle_job", { job_id: jobId, answer_hash: answerHash }, 100)
    return { tx: r.hash, state: r.value as EscrowJob["state"] }
  },
  async refund(jobId) {
    const r = await getSigner().call(CONFIG.deed, "refund_job", { job_id: jobId }, 30)
    return { tx: r.hash, state: r.value as EscrowJob["state"] }
  },
}
