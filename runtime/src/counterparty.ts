// Counterparty check for agents that pay: before an agent sends funds or calls a contract, it asks
// about the receiver and gets allow, warn or block, with the reasons and the evidence behind each.
//
// Signals, all read live from chain data (no keys, no cache):
//   - shared blocklist      reports contract `get_status` (bonded reports with evidence, disputes)
//   - account age           the account read as it was 7 days ago (archival RPC): absent then = new
//   - code changed recently the contract's code hash 7 days ago vs now
//   - activity              number of transactions that touched the account (FastNEAR index)
//   - prior interactions    transactions this agent signed that also touched the receiver
// plus the deterministic transaction flags from risk.ts (unlimited approvals, full-access keys…).
//
// Rule (same as the agent-vault contract for the blocklist part):
//   block  reported by a trusted reporter, or by >= minReporters distinct reporters; or any high flag
//   warn   new (< 7 days) or little activity (both only notes once this agent has paid the receiver before),
//          code changed < 7 days ago, named account that doesn't exist,
//          reported below the block rule or disputed, first payment to this receiver at or above the
//          first-payment threshold, any medium flag, or a signal we couldn't read (fail toward caution)
//   allow  otherwise
import { riskFlags, type ProposedTx, type RiskFlag } from "./risk"

export type Verdict = "allow" | "warn" | "block"
export interface Reason {
  code: string
  verdict: Verdict
  account?: string
  message: string
  /** Where the fact comes from, so a human can check it. */
  source: string
}
export interface Report {
  reporter: string
  reason: string
  evidence: string
  at_ns?: string
}
export interface Signals {
  account: string
  exists: boolean | null
  is_contract: boolean | null
  code_hash: string | null
  /** null = couldn't tell */
  existed_7d_ago: boolean | null
  code_changed_7d: boolean | null
  tx_count: number | null
  prior_from_agent: number | null
  reports: Report[]
  dispute: { statement: string } | null
  /** false if the blocklist couldn't be read */
  blocklist_read: boolean
}
export interface Policy {
  trustedReporters: string[]
  minReporters: number
  /** First payment to a receiver at or above this (yoctoNEAR) is a warn. */
  firstPaymentWarnYocto: bigint
  lowActivityTxs: number
}
export interface CheckResult {
  verdict: Verdict
  reasons: Reason[]
  counterparties: Signals[]
  flags: RiskFlag[]
  amount_yocto: string
  policy: { trusted_reporters: string[]; min_reporters: number; source: string }
}

/** What the check reads; injectable for tests. */
export interface Sources {
  /** code_hash now, or null if the account doesn't exist. */
  accountNow(id: string): Promise<{ code_hash: string } | null>
  /** The same, 7 days ago (archival). */
  account7dAgo(id: string): Promise<{ code_hash: string } | null>
  /** Transaction hashes that touched the account, and whether `id` signed each one. */
  history(id: string): Promise<{ count: number; txs: { hash: string; signer: boolean }[] }>
  reportStatus(id: string): Promise<{ reports: Report[]; dispute: { statement: string } | null }>
  /** The agent's vault config, if `agentId` is an agent-vault. */
  vaultPolicy(agentId: string): Promise<{ trusted_reporters: string[]; min_reporters: number } | null>
}

const NO_CODE = "11111111111111111111111111111111"
const ORDER: Record<Verdict, number> = { allow: 0, warn: 1, block: 2 }
const IMPLICIT = /^[0-9a-f]{64}$|^0x[0-9a-f]{40}$/

/** Who the transaction pays or hands control to, and how much NEAR moves. */
export function counterpartiesOf(tx: ProposedTx, agentId?: string): { accounts: string[]; amount: bigint } {
  const out = new Set<string>()
  let amount = 0n
  const big = (v: unknown) => {
    try {
      return BigInt(String(v ?? "0"))
    } catch {
      return 0n
    }
  }
  for (const a of tx.actions ?? []) {
    const p = (a.params ?? {}) as Record<string, unknown>
    if (a.type === "Transfer") amount += big(p.deposit)
    if (a.type === "FunctionCall") {
      const args = (typeof p.args === "object" && p.args ? p.args : {}) as Record<string, unknown>
      const method = String(p.methodName ?? p.method_name ?? "")
      amount += big(p.deposit)
      // A payment through the agent's own vault: the real counterparty is the vault's receiver.
      if (method === "pay" && tx.receiver_id === agentId) amount += big(args.amount)
      for (const k of ["receiver_id", "spender_id", "account_id", "new_owner_id"]) if (typeof args[k] === "string") out.add(args[k] as string)
    }
    if (a.type === "DeleteAccount" && typeof p.beneficiaryId === "string") out.add(p.beneficiaryId)
  }
  if (tx.receiver_id && tx.receiver_id !== agentId) out.add(tx.receiver_id)
  if (agentId) out.delete(agentId)
  return { accounts: [...out].slice(0, 5), amount }
}

export function blockedBy(reports: Report[], policy: Pick<Policy, "trustedReporters" | "minReporters">): string | null {
  const t = reports.find((r) => policy.trustedReporters.includes(r.reporter))
  if (t) return `reported by ${t.reporter} (a reporter this agent trusts): ${t.reason} [evidence: ${t.evidence}]`
  if (policy.minReporters > 0 && reports.length >= policy.minReporters) return `reported by ${reports.length} accounts (limit ${policy.minReporters}), first: ${reports[0].reason}`
  return null
}

async function settle<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p
  } catch {
    return undefined
  }
}

export async function gatherSignals(src: Sources, account: string, agentId: string | undefined): Promise<Signals> {
  const [now, then, hist, status, agentHist] = await Promise.all([
    settle(src.accountNow(account)),
    settle(src.account7dAgo(account)),
    settle(src.history(account)),
    settle(src.reportStatus(account)),
    agentId ? settle(src.history(agentId)) : Promise.resolve(undefined),
  ])
  const signed = agentHist ? new Set(agentHist.txs.filter((t) => t.signer).map((t) => t.hash)) : null
  return {
    account,
    exists: now === undefined ? null : now !== null,
    is_contract: now ? now.code_hash !== NO_CODE : now === null ? false : null,
    code_hash: now?.code_hash ?? null,
    existed_7d_ago: then === undefined ? null : then !== null,
    code_changed_7d: now && then ? now.code_hash !== then.code_hash : now && then === null ? now.code_hash !== NO_CODE : null,
    tx_count: hist?.count ?? null,
    prior_from_agent: signed && hist ? hist.txs.filter((t) => signed.has(t.hash)).length : null,
    reports: status?.reports ?? [],
    dispute: status?.dispute ?? null,
    blocklist_read: status !== undefined,
  }
}

export function judge(signals: Signals[], flags: RiskFlag[], amount: bigint, policy: Policy): Reason[] {
  const r: Reason[] = []
  signals.forEach((s) => {
    const a = s.account
    const blocked = blockedBy(s.reports, policy)
    if (blocked) r.push({ code: "blocklisted", verdict: "block", account: a, message: `${a} is ${blocked}.`, source: "reports contract get_status" })
    else if (s.reports.length) r.push({ code: "reported", verdict: "warn", account: a, message: `${a} has ${s.reports.length} report(s), below the block rule (none from a trusted reporter): ${s.reports.map((x) => x.reason).join("; ")}.`, source: "reports contract get_status" })
    if (s.dispute) r.push({ code: "disputed", verdict: "warn", account: a, message: `${a} disputes its reports: "${s.dispute.statement}"`, source: "reports contract get_status" })
    if (!s.blocklist_read) r.push({ code: "blocklist_unreadable", verdict: "warn", account: a, message: `Couldn't read the shared blocklist for ${a}; treat it as unchecked.`, source: "reports contract" })
    if (s.exists === false) {
      if (!IMPLICIT.test(a)) r.push({ code: "no_such_account", verdict: "warn", account: a, message: `${a} doesn't exist. A payment to it fails and comes back; a typo or a look-alike name is likely.`, source: "RPC view_account" })
      else r.push({ code: "fresh_implicit", verdict: "warn", account: a, message: `${a} is an implicit address nobody has used yet.`, source: "RPC view_account" })
    } else if (s.exists === null) r.push({ code: "unreadable", verdict: "warn", account: a, message: `Couldn't read ${a} from the chain; treat it as unchecked.`, source: "RPC view_account" })
    // Newness and low activity matter less once this agent has done business with the receiver.
    const known = (s.prior_from_agent ?? 0) > 0
    const soft: Verdict = known ? "allow" : "warn"
    if (s.exists && s.existed_7d_ago === false) r.push({ code: "new_account", verdict: soft, account: a, message: `${a} was created in the last 7 days.`, source: "archival RPC view_account 7 days ago" })
    if (s.exists && s.existed_7d_ago && s.code_changed_7d) r.push({ code: "code_changed", verdict: "warn", account: a, message: `${a}'s contract code changed in the last 7 days (code hash now ${s.code_hash?.slice(0, 10)}…). Approvals or calls that were safe last week may not be.`, source: "archival RPC view_account: code hash 7 days ago vs now" })
    if (s.exists && s.tx_count !== null && s.tx_count < policy.lowActivityTxs) r.push({ code: "low_activity", verdict: soft, account: a, message: `${a} has only ${s.tx_count} transaction(s) in its history.`, source: "FastNEAR account index" })
    if (s.prior_from_agent === 0 && amount >= policy.firstPaymentWarnYocto && amount > 0n)
      r.push({ code: "first_payment", verdict: "warn", account: a, message: `This agent has never transacted with ${a}, and this sends ${(Number(amount / 10n ** 21n) / 1000).toString()} NEAR.`, source: "FastNEAR account index (agent's signed transactions ∩ receiver's)" })
    if (s.prior_from_agent && s.prior_from_agent > 0) r.push({ code: "known_counterparty", verdict: "allow", account: a, message: `This agent has ${s.prior_from_agent} earlier transaction(s) with ${a}.`, source: "FastNEAR account index" })
  })
  for (const f of flags) if (f.severity !== "info") r.push({ code: f.code, verdict: f.severity === "high" ? "block" : "warn", message: f.message, source: "transaction flags (risk.ts)" })
  return r.sort((x, y) => ORDER[y.verdict] - ORDER[x.verdict])
}

export const DEFAULT_POLICY: Omit<Policy, "trustedReporters"> = { minReporters: 3, firstPaymentWarnYocto: 5n * 10n ** 23n, lowActivityTxs: 3 }

export async function checkCounterparty(src: Sources, tx: ProposedTx, agentId: string | undefined, defaults: { trustedReporters: string[] }): Promise<CheckResult> {
  const flags = riskFlags(tx)
  const { accounts, amount } = counterpartiesOf(tx, agentId)
  const vault = agentId ? await settle(src.vaultPolicy(agentId)) : undefined
  const policy: Policy = {
    ...DEFAULT_POLICY,
    trustedReporters: vault?.trusted_reporters ?? defaults.trustedReporters,
    minReporters: vault?.min_reporters ?? DEFAULT_POLICY.minReporters,
  }
  const signals = await Promise.all(accounts.map((a) => gatherSignals(src, a, agentId)))
  const reasons = judge(signals, flags, amount, policy)
  const verdict = reasons.reduce<Verdict>((v, x) => (ORDER[x.verdict] > ORDER[v] ? x.verdict : v), "allow")
  return {
    verdict,
    reasons,
    counterparties: signals,
    flags,
    amount_yocto: amount.toString(),
    policy: { trusted_reporters: policy.trustedReporters, min_reporters: policy.minReporters, source: vault ? `agent-vault ${agentId} get_config` : "runtime default" },
  }
}

// ---------- live sources ----------

type Rpc = (method: string, params: unknown) => Promise<Record<string, unknown>>

export function liveSources(opts: { rpc: string; archival: string; txApi: string; reports: string }): Sources {
  const call = (url: string): Rpc => async (method, params) => {
    const r = (await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15_000) }).then((x) => x.json())) as { result?: Record<string, unknown>; error?: { cause?: { name?: string } } }
    if (r.error) throw Object.assign(new Error(r.error.cause?.name ?? "RPC error"), { cause: r.error.cause?.name })
    return r.result!
  }
  const rpc = call(opts.rpc)
  const arch = call(opts.archival)
  const view = async (contract: string, method: string, args: unknown) => {
    const r = await rpc("query", { request_type: "call_function", finality: "final", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") })
    return JSON.parse(Buffer.from(r.result as number[]).toString())
  }
  const account = async (r: Rpc, id: string, block?: number) => {
    try {
      const a = await r("query", block ? { request_type: "view_account", block_id: block, account_id: id } : { request_type: "view_account", finality: "final", account_id: id })
      return { code_hash: String(a.code_hash) }
    } catch (e) {
      if ((e as { cause?: string }).cause === "UNKNOWN_ACCOUNT") return null
      throw e
    }
  }
  // Height ~7 days ago from the recent block rate; cached for 10 min. Retries nearby heights (skipped blocks).
  let weekAgo: { height: number; at: number } | null = null
  const heightWeekAgo = async () => {
    if (weekAgo && Date.now() - weekAgo.at < 600_000) return weekAgo.height
    const head = ((await rpc("block", { finality: "final" })).header as { height: number; timestamp: number })
    const back = 100_000
    const old = ((await arch("block", { block_id: head.height - back })).header as { timestamp: number })
    const nsPerBlock = (head.timestamp - old.timestamp) / back
    weekAgo = { height: Math.floor(head.height - (7 * 86_400e9) / nsPerBlock), at: Date.now() }
    return weekAgo.height
  }
  return {
    accountNow: (id) => account(rpc, id),
    account7dAgo: async (id) => {
      const h = await heightWeekAgo()
      for (let d = 0; d < 6; d++) {
        try {
          return await account(arch, id, h + d)
        } catch (e) {
          if (!/UNKNOWN_BLOCK|GARBAGE/.test(String((e as { cause?: string }).cause))) throw e
        }
      }
      throw new Error("no block near 7 days ago")
    },
    history: async (id) => {
      const r = (await fetch(`${opts.txApi}/v0/account`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account_id: id }), signal: AbortSignal.timeout(15_000) }).then((x) => x.json())) as {
        txs_count?: number
        account_txs?: { transaction_hash: string; is_signer: boolean }[]
      }
      const txs = (r.account_txs ?? []).map((t) => ({ hash: t.transaction_hash, signer: t.is_signer }))
      return { count: r.txs_count ?? txs.length, txs }
    },
    reportStatus: async (id) => {
      const s = (await view(opts.reports, "get_status", { account_id: id })) as { reports: Report[]; dispute: { statement: string } | null }
      return { reports: s.reports ?? [], dispute: s.dispute ?? null }
    },
    vaultPolicy: async (agentId) => {
      try {
        const c = (await view(agentId, "get_config", {})) as { trusted_reporters?: string[]; min_reporters?: number; reports?: string }
        return c && Array.isArray(c.trusted_reporters) && c.reports === opts.reports ? { trusted_reporters: c.trusted_reporters, min_reporters: c.min_reporters ?? 3 } : null
      } catch {
        return null
      }
    },
  }
}
