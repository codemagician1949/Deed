// Real chain reads for the job rules: registry owner, Deed activation, the payment tx, and the
// time of the latest ownership change. Every read is fresh (no cache); any failure throws so the
// caller fails closed.
import { CONFIG } from "./config"
import type { Activation, Chain, Payment } from "./jobs"

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

export const chain: Chain = {
  async owner(name) {
    const t = await view<{ owner_id: string } | null>(CONFIG.registry, "nft_token", { token_id: name })
    return t?.owner_id ?? null
  },
  async activation(name) {
    return view<Activation | null>(CONFIG.deed, "get_activation", { token_id: name })
  },
  async payment(txHash, sender): Promise<Payment | null> {
    let r: any
    try {
      r = await rpc("tx", { tx_hash: txHash, sender_account_id: sender, wait_until: "FINAL" })
    } catch (e) {
      // Unknown tx is "no payment", not an outage.
      if (/UNKNOWN_TRANSACTION|INVALID_TRANSACTION|PARSE_ERROR|TIMEOUT_ERROR/.test(String((e as { rpcName?: string }).rpcName ?? e))) return null
      throw e
    }
    const tx = r.transaction
    const transfers = (tx.actions as unknown[]).filter((a) => typeof a === "object" && a && "Transfer" in (a as object))
    const deposit = transfers.reduce((s: bigint, a: any) => s + BigInt(a.Transfer.deposit), 0n)
    const block = await rpc<{ header: { timestamp_nanosec: string } }>("block", { block_id: r.transaction_outcome.block_hash })
    return {
      hash: tx.hash,
      signer: tx.signer_id,
      receiver: tx.receiver_id,
      depositYocto: deposit,
      timestampNs: BigInt(block.header.timestamp_nanosec),
      success: !!r.status && "SuccessValue" in r.status && transfers.length > 0,
    }
  },
  async lastRotationNs(name) {
    const list = await fetch(`${CONFIG.txApi}/v0/account`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account_id: name }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!list.ok) throw new Error(`history HTTP ${list.status}`)
    const hashes: string[] = ((await list.json()) as any).account_txs.map((t: any) => t.transaction_hash)
    let latest = 0n
    for (let i = 0; i < hashes.length; i += 20) {
      const r = await fetch(`${CONFIG.txApi}/v0/transactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tx_hashes: hashes.slice(i, i + 20) }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!r.ok) throw new Error(`history HTTP ${r.status}`)
      for (const t of ((await r.json()) as any).transactions ?? []) {
        for (const rc of t.receipts ?? []) {
          for (const l of rc.execution_outcome.outcome.logs as string[]) {
            if (!l.startsWith("EVENT_JSON:") || !l.includes("nft_transfer")) continue
            const e = JSON.parse(l.slice(11))
            const d = Array.isArray(e.data) ? e.data[0] : e.data
            if (e.standard === "nep171" && e.event === "nft_transfer" && (d?.token_ids ?? []).includes(name)) {
              const ts = BigInt(rc.execution_outcome.block_timestamp)
              if (ts > latest) latest = ts
            }
          }
        }
      }
    }
    return latest
  },
}
