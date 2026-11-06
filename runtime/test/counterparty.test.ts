import { describe, expect, test } from "bun:test"
import { checkCounterparty, counterpartiesOf, type Sources } from "../src/counterparty"

const CODE = "Ccode111111111111111111111111111"
const NONE = "11111111111111111111111111111111"
const NEAR = 10n ** 24n

type Acct = { now: string | null; ago?: string | null; txs?: { hash: string; signer: boolean }[]; reports?: { reporter: string; reason: string; evidence: string }[]; dispute?: string }
function fake(world: Record<string, Acct>, opts: { vault?: { trusted_reporters: string[]; min_reporters: number }; down?: string[] } = {}): Sources {
  const get = (id: string) => {
    if (opts.down?.includes(id)) throw new Error("rpc down")
    return world[id]
  }
  return {
    accountNow: async (id) => (get(id)?.now == null ? null : { code_hash: get(id)!.now! }),
    account7dAgo: async (id) => (get(id)?.ago == null ? null : { code_hash: get(id)!.ago! }),
    history: async (id) => ({ count: get(id)?.txs?.length ?? 0, txs: get(id)?.txs ?? [] }),
    reportStatus: async (id) => ({ reports: (get(id)?.reports ?? []).map((r) => ({ ...r })), dispute: get(id)?.dispute ? { statement: get(id)!.dispute! } : null }),
    vaultPolicy: async (id) => (id === "vault.testnet" ? (opts.vault ?? null) : null),
  }
}
const pay = (to: string, near: bigint) => ({ receiver_id: "vault.testnet", actions: [{ type: "FunctionCall", params: { methodName: "pay", args: { receiver_id: to, amount: (near * NEAR).toString(), memo: "" }, gas: "100000000000000", deposit: "0" } }] })
const old = (n: number) => Array.from({ length: n }, (_, i) => ({ hash: `h${i}`, signer: false }))
const DEF = { trustedReporters: ["watchdog.testnet"] }
const vaultTxs = [{ hash: "p1", signer: true }]

describe("counterparty check", () => {
  test("a vault payment's counterparty is the vault's receiver, with the amount from its args", () => {
    const c = counterpartiesOf(pay("shop.testnet", 2n) as never, "vault.testnet")
    expect(c.accounts).toEqual(["shop.testnet"])
    expect(c.amount).toBe(2n * NEAR)
  })

  test("allow: old, active, known receiver, no reports", async () => {
    const r = await checkCounterparty(fake({ "shop.testnet": { now: NONE, ago: NONE, txs: [...old(10), { hash: "p1", signer: false }] }, "vault.testnet": { now: CODE, ago: CODE, txs: vaultTxs } }), pay("shop.testnet", 1n) as never, "vault.testnet", DEF)
    expect(r.verdict).toBe("allow")
    expect(r.reasons.map((x) => x.code)).toContain("known_counterparty")
  })

  test("block: reported by a reporter the vault trusts, with the evidence in the reason", async () => {
    const world = { "drainer.testnet": { now: NONE, ago: NONE, txs: old(9), reports: [{ reporter: "watchdog.testnet", reason: "fake airdrop drainer", evidence: "tx:ABC" }] }, "vault.testnet": { now: CODE, ago: CODE, txs: vaultTxs } }
    const r = await checkCounterparty(fake(world, { vault: { trusted_reporters: ["watchdog.testnet"], min_reporters: 3 } }), pay("drainer.testnet", 1n) as never, "vault.testnet", { trustedReporters: [] })
    expect(r.verdict).toBe("block")
    expect(r.reasons[0].message).toContain("tx:ABC")
    expect(r.policy.source).toContain("agent-vault")
  })

  test("one untrusted report is a warn, not a block; three distinct reporters block", async () => {
    const rep = (n: number) => Array.from({ length: n }, (_, i) => ({ reporter: `r${i}.testnet`, reason: "scam", evidence: "tx:X" }))
    const w = (n: number) => ({ "x.testnet": { now: NONE, ago: NONE, txs: old(9), reports: rep(n) }, "vault.testnet": { now: CODE, ago: CODE, txs: [] } })
    expect((await checkCounterparty(fake(w(1)), pay("x.testnet", 0n) as never, "vault.testnet", DEF)).verdict).toBe("warn")
    expect((await checkCounterparty(fake(w(3)), pay("x.testnet", 0n) as never, "vault.testnet", DEF)).verdict).toBe("block")
  })

  test("warn: account created in the last 7 days", async () => {
    const r = await checkCounterparty(fake({ "new.testnet": { now: NONE, ago: null, txs: old(5) } }), { receiver_id: "new.testnet", actions: [{ type: "Transfer", params: { deposit: "1" } }] } as never, undefined, DEF)
    expect(r.verdict).toBe("warn")
    expect(r.reasons.map((x) => x.code)).toContain("new_account")
  })

  test("warn: contract code changed in the last 7 days", async () => {
    const r = await checkCounterparty(fake({ "dex.testnet": { now: CODE, ago: "Cold1111111111111111111111111111", txs: old(50) } }), { receiver_id: "dex.testnet", actions: [{ type: "FunctionCall", params: { methodName: "swap", args: {}, gas: "1", deposit: "0" } }] } as never, undefined, DEF)
    expect(r.reasons.map((x) => x.code)).toContain("code_changed")
    expect(r.verdict).toBe("warn")
  })

  test("warn: first payment above the threshold; a look-alike name that doesn't exist", async () => {
    const world = { "shop.testnet": { now: NONE, ago: NONE, txs: old(10) }, "vault.testnet": { now: CODE, ago: CODE, txs: [] } }
    const first = await checkCounterparty(fake(world), pay("shop.testnet", 1n) as never, "vault.testnet", DEF)
    expect(first.reasons.map((x) => x.code)).toContain("first_payment")
    const typo = await checkCounterparty(fake(world), pay("sh0p.testnet", 1n) as never, "vault.testnet", DEF)
    expect(typo.reasons.map((x) => x.code)).toContain("no_such_account")
  })

  test("fails toward caution: unreadable chain data is a warn, never an allow", async () => {
    const r = await checkCounterparty(fake({}, { down: ["shop.testnet"] }), { receiver_id: "shop.testnet", actions: [{ type: "Transfer", params: { deposit: "1" } }] } as never, undefined, DEF)
    expect(r.verdict).toBe("warn")
    expect(r.reasons.map((x) => x.code)).toEqual(expect.arrayContaining(["unreadable", "blocklist_unreadable"]))
  })

  test("high transaction flags block even for a clean receiver (unlimited approval)", async () => {
    const tx = { receiver_id: "usdc.fakes.testnet", actions: [{ type: "FunctionCall", params: { methodName: "ft_approve", args: { spender_id: "shop.testnet", amount: "340282366920938463463374607431768211455" }, gas: "1", deposit: "1" } }] }
    const world = { "usdc.fakes.testnet": { now: CODE, ago: CODE, txs: old(99) }, "shop.testnet": { now: NONE, ago: NONE, txs: old(9) } }
    const r = await checkCounterparty(fake(world), tx as never, undefined, DEF)
    expect(r.verdict).toBe("block")
  })
})
