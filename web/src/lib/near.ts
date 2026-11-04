import { CONFIG } from "./config"

export const YOCTO = 10n ** 24n
export const toNear = (yocto: string | bigint) => Number(BigInt(yocto) * 10000n / YOCTO) / 10000
export const nearToYocto = (near: string) => {
  const [i, f = ""] = near.trim().split(".")
  return (BigInt(i || "0") * YOCTO + BigInt((f + "0".repeat(24)).slice(0, 24))).toString()
}
export const TGAS = (n: number) => (BigInt(n) * 10n ** 12n).toString()

let rpcId = 0
async function rpc<T>(method: string, params: unknown, attempt = 0): Promise<T> {
  const res = await fetch(CONFIG.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  })
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    return rpc(method, params, attempt + 1)
  }
  const json = await res.json()
  if (json.error) throw new Error(json.error?.cause?.name ?? json.error?.message ?? "RPC error")
  return json.result as T
}

/** Call a view method. Returns null when the method panics (e.g. "not an owner"). */
export async function view<T>(contract: string, method: string, args: object = {}): Promise<T> {
  const result = await rpc<{ result?: number[]; error?: string }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: contract,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  })
  if (result.error || !result.result) throw new Error(result.error ?? "view failed")
  return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))) as T
}

export async function viewAccount(accountId: string): Promise<{ amount: string; code_hash: string } | null> {
  try {
    return await rpc("query", { request_type: "view_account", finality: "final", account_id: accountId })
  } catch {
    return null
  }
}

export async function accessKeyCount(accountId: string): Promise<number> {
  const r = await rpc<{ keys: unknown[] }>("query", { request_type: "view_access_key_list", finality: "final", account_id: accountId })
  return r.keys.length
}

// ---------- FastNEAR transaction API ----------

export interface TxSummary {
  hash: string
  signer: string
  receiver: string
  timestampNs: string
  actions: { kind: string; method?: string; args?: unknown; deposit?: string }[]
  success: boolean
  failure?: string
  events: { standard: string; event: string; data: unknown; executor: string }[]
}

export async function accountTxHashes(accountId: string, attempt = 0): Promise<string[]> {
  const r = await fetch(`${CONFIG.txApi}/v0/account`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: accountId }),
  })
  if (r.status === 429 && attempt < 4) {
    await new Promise((res) => setTimeout(res, 700 * (attempt + 1)))
    return accountTxHashes(accountId, attempt + 1)
  }
  if (!r.ok) throw new Error(`history service returned ${r.status}`)
  const j = await r.json()
  return (j.account_txs ?? []).map((t: { transaction_hash: string }) => t.transaction_hash)
}

function decodeArgs(b64: string | undefined): unknown {
  if (!b64) return undefined
  try {
    return JSON.parse(atob(b64))
  } catch {
    return undefined
  }
}

function failureText(status: unknown): string | undefined {
  const s = JSON.stringify(status)
  const m = s.match(/panicked: ([^"\\]+(?:\\"[^"\\]*\\"[^"\\]*)*)/) ?? s.match(/"ExecutionError":"([^"]+)"/)
  return m ? m[1].replace(/\\"/g, '"').slice(0, 160) : s.includes("Failure") ? "failed" : undefined
}

async function fetchTxBatch(batch: string[], attempt = 0): Promise<any[]> {
  const r = await fetch(`${CONFIG.txApi}/v0/transactions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tx_hashes: batch }),
  })
  if (r.status === 429 && attempt < 4) {
    await new Promise((res) => setTimeout(res, 700 * (attempt + 1)))
    return fetchTxBatch(batch, attempt + 1)
  }
  if (!r.ok) throw new Error(`history service returned ${r.status}`)
  return (await r.json()).transactions ?? []
}

export async function transactions(hashes: string[]): Promise<TxSummary[]> {
  const batches: string[][] = []
  for (let i = 0; i < hashes.length; i += 20) batches.push(hashes.slice(i, i + 20))
  const raw = (await Promise.all(batches.map((b) => fetchTxBatch(b)))).flat()
  const out: TxSummary[] = []
  for (const t of raw) {
      const tx = t.transaction
      const receipts = t.receipts ?? []
      const events: TxSummary["events"] = []
      let failure: string | undefined
      for (const rc of receipts) {
        const o = rc.execution_outcome.outcome
        for (const l of o.logs as string[]) {
          if (!l.startsWith("EVENT_JSON:")) continue
          try {
            const e = JSON.parse(l.slice(11))
            events.push({ standard: e.standard, event: e.event, data: e.data, executor: o.executor_id })
          } catch {
            /* not an event */
          }
        }
        // The first failing receipt to the receiver is the outcome that matters for "did the call work".
        if (!failure && rc.receipt.receiver_id === tx.receiver_id && JSON.stringify(o.status).includes("Failure")) {
          failure = failureText(o.status)
        }
      }
      out.push({
        hash: tx.hash,
        signer: tx.signer_id,
        receiver: tx.receiver_id,
        timestampNs: String(t.execution_outcome?.block_timestamp ?? receipts[0]?.execution_outcome?.block_timestamp ?? "0"),
        actions: (tx.actions as unknown[]).map((a) => {
          if (typeof a === "string") return { kind: a }
          const [kind, p] = Object.entries(a as Record<string, Record<string, string>>)[0]
          return { kind, method: p?.method_name, args: decodeArgs(p?.args), deposit: p?.deposit }
        }),
        success: !failure,
        failure,
        events,
      })
  }
  return out
}

/** The decoded return value of a finished function-call transaction (fallback when a wallet doesn't return it). */
export async function txReturnValue(hash: string, sender: string): Promise<unknown> {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(CONFIG.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tx", params: { tx_hash: hash, sender_account_id: sender, wait_until: "FINAL" } }),
    }).then((x) => x.json() as Promise<{ result?: { status?: { SuccessValue?: string } } }>)
    const sv = r.result?.status?.SuccessValue
    if (sv) return JSON.parse(atob(sv))
    await new Promise((res) => setTimeout(res, 1500))
  }
  return null
}
