// The paid-job rules of THREAT_MODEL.md §D, including the track's "sale in the middle of a payout".
// Chain and inference are in-memory fakes so every ordering can be forced deterministically.
import { describe, expect, test } from "bun:test"
import { resumeAwaiting, submitJob, type Activation, type Answer, type Chain, type Deps, type Job, type Payment } from "../src/jobs"

const NAME = "preflight.deedbot.deedhq.testnet"
const RUNTIME = "deedhq.testnet"
const ESCROW = "deed.deedhq.testnet"
const PRICE = 50_000_000_000_000_000_000_000n // 0.05 NEAR
const T0 = Date.UTC(2026, 10, 3, 12) // ms
const ns = (ms: number) => BigInt(ms) * 1_000_000n
const TX = (n: number) => `${"9".repeat(43 - String(n).length)}${n}`.replace(/0/g, "A")
const REQ = { receiver_id: "usdt.testnet", actions: [{ type: "FunctionCall", params: { methodName: "ft_transfer", args: { receiver_id: "x.testnet", amount: "1" }, gas: "30000000000000", deposit: "1" } }] }

class World implements Chain {
  ownerOf = "kofi.testnet"
  act: Activation | null = act("kofi.testnet", 1)
  rotation = 0n
  payments = new Map<string, Payment>()
  down = false
  async owner() {
    if (this.down) throw new Error("rpc unavailable")
    return this.ownerOf
  }
  async activation() {
    if (this.down) throw new Error("rpc unavailable")
    return this.act
  }
  async payment(h: string) {
    if (this.down) throw new Error("rpc unavailable")
    return this.payments.get(h) ?? null
  }
  async lastRotationNs() {
    if (this.down) throw new Error("rpc unavailable")
    return this.rotation
  }
  /** Simulates a sale: the registry owner changes and the rotation time moves. */
  sell(to: string, atMs: number) {
    this.ownerOf = to
    this.rotation = ns(atMs)
  }
  pay(n: number, atMs: number, opts: Partial<Payment> = {}) {
    const p: Payment = { hash: TX(n), signer: "alice.testnet", receiver: NAME, depositYocto: PRICE, timestampNs: ns(atMs), success: true, ...opts }
    this.payments.set(p.hash, p)
    return p.hash
  }
}
function act(owner: string, version: number, runtime = RUNTIME): Activation {
  return { owner, runtime_id: runtime, config_hash: "ab".repeat(32), price_yocto: PRICE.toString(), version, activated_at_ns: "0" }
}
function memStore() {
  const m = new Map<string, Job>()
  return { get: (id: string) => m.get(id), put: (j: Job) => void m.set(j.id, structuredClone(j)), list: () => [...m.values()] }
}
const answer = (): Answer => ({
  explanation: "Sends 1 unit of USDT to x.testnet.",
  model: "z-ai/glm-5.3-flash",
  chatId: "chat-1",
  requestBody: "{}",
  responseBody: "{}",
  signature: null,
  check: null,
})
function deps(world: World, opts: { onExplain?: () => void | Promise<void>; fail?: boolean; nowMs?: number } = {}) {
  let calls = 0
  let now = opts.nowMs ?? T0
  const d: Deps & { calls: () => number; setNow: (ms: number) => void } = {
    chain: world,
    inference: {
      async explain() {
        calls++
        await opts.onExplain?.()
        if (opts.fail) throw new Error("model timeout")
        return answer()
      },
    },
    store: memStore(),
    runtimeId: RUNTIME,
    escrow: ESCROW,
    now: () => now,
    calls: () => calls,
    setNow: (ms: number) => (now = ms),
  }
  return d
}
const submit = (d: Deps, tx: string, sender = "alice.testnet") => submitJob(d, { name: NAME, payment_tx: tx, sender, request: REQ })

describe("accept and serve", () => {
  test("a valid payment under an active owner is answered, with risk flags", async () => {
    const w = new World()
    const d = deps(w)
    const r = await submit(d, w.pay(1, T0 - 5_000))
    expect(r.http).toBe(200)
    expect(r.job?.status).toBe("served")
    expect(r.job?.eraOwner).toBe("kofi.testnet")
    expect(r.job?.flags.map((f) => f.code)).toContain("moves_assets")
  })
})

describe("D1: sale in the middle of a paid job", () => {
  test("the name is sold while the AI is answering: the job is still delivered once, era = the seller", async () => {
    const w = new World()
    const d = deps(w, { onExplain: () => w.sell("maya.testnet", T0 + 1) })
    const r = await submit(d, w.pay(2, T0 - 5_000))
    expect(r.http).toBe(200)
    expect(r.job?.status).toBe("served")
    expect(r.job?.eraOwner).toBe("kofi.testnet") // accepted under Kofi
    expect(r.job?.ownerAtDelivery).toBe("maya.testnet") // delivered after the sale
    expect(d.calls()).toBe(1)
  })

  test("paid before the sale but submitted after: the seller's service is gone, so it's refund_due (not served by the buyer)", async () => {
    const w = new World()
    const tx = w.pay(3, T0 - 60_000)
    w.sell("maya.testnet", T0 - 30_000) // sweep paid this money to Kofi
    w.act = act("maya.testnet", 2) // Maya even switched on already
    const d = deps(w)
    const r = await submit(d, tx)
    expect(r.http).toBe(409)
    expect(r.job?.status).toBe("refund_due")
    expect(d.calls()).toBe(0)
  })

  test("paid after the sale, before the buyer switches on: held, then answered under the buyer", async () => {
    const w = new World()
    w.sell("maya.testnet", T0 - 60_000) // Kofi's activation is still stored but stale
    const d = deps(w)
    const tx = w.pay(4, T0 - 10_000)
    const r = await submit(d, tx)
    expect(r.http).toBe(202)
    expect(r.job?.status).toBe("awaiting_activation")
    expect(d.calls()).toBe(0)
    w.act = act("maya.testnet", 2)
    expect(await resumeAwaiting(d)).toBe(1)
    const job = d.store.get(tx)!
    expect(job.status).toBe("served")
    expect(job.eraOwner).toBe("maya.testnet")
  })

  test("held job expires to refund_due after 24 h if the buyer never switches on", async () => {
    const w = new World()
    w.sell("maya.testnet", T0 - 60_000)
    const d = deps(w)
    const tx = w.pay(5, T0 - 10_000)
    await submit(d, tx)
    d.setNow(T0 + 25 * 3600 * 1000)
    await resumeAwaiting(d)
    expect(d.store.get(tx)!.status).toBe("refund_due")
  })

  test("while listed (escrow owns the name) nothing is served", async () => {
    const w = new World()
    w.sell(ESCROW, T0 - 60_000)
    w.act = act(ESCROW, 9) // even a bogus activation naming the escrow
    const d = deps(w)
    const r = await submit(d, w.pay(6, T0 - 1_000))
    expect(r.job?.status).toBe("awaiting_activation")
    expect(d.calls()).toBe(0)
  })
})

describe("D2: stale or foreign activations", () => {
  test("old owner's activation after a transfer is not honoured", async () => {
    const w = new World()
    w.sell("maya.testnet", T0 - 60_000) // activation still says kofi
    const d = deps(w)
    const r = await submit(d, w.pay(7, T0 - 1_000))
    expect(r.job?.status).toBe("awaiting_activation")
  })
  test("an activation that names a different runtime is not served by this one", async () => {
    const w = new World()
    w.act = act("kofi.testnet", 1, "rogue-runtime.testnet")
    const d = deps(w)
    const r = await submit(d, w.pay(8, T0 - 1_000))
    expect(r.job?.status).toBe("awaiting_activation")
  })

  test("an activation for a different service config is not served (the fingerprint must match what runs)", async () => {
    const w = new World()
    const d = { ...deps(w), configHash: "cd".repeat(32) }
    const r = await submit(d, w.pay(18, T0 - 1_000))
    expect(r.job?.status).toBe("awaiting_activation")
  })
})

describe("D4: one payment, one job", () => {
  test("re-submitting a payment is refused and nothing runs twice", async () => {
    const w = new World()
    const d = deps(w)
    const tx = w.pay(9, T0 - 1_000)
    expect((await submit(d, tx)).http).toBe(200)
    const again = await submit(d, tx)
    expect(again.http).toBe(409)
    expect(d.calls()).toBe(1)
  })
  test("two simultaneous submissions of one payment: exactly one is answered", async () => {
    const w = new World()
    const d = deps(w, { onExplain: () => new Promise((r) => setTimeout(r, 20)) })
    const tx = w.pay(10, T0 - 1_000)
    const [a, b] = await Promise.all([submit(d, tx), submit(d, tx)])
    expect([a.http, b.http].sort()).toEqual([200, 409])
    expect(d.calls()).toBe(1)
  })
})

describe("D5: fail closed", () => {
  test("RPC unavailable: refuse, record nothing, run nothing", async () => {
    const w = new World()
    const tx = w.pay(11, T0 - 1_000)
    w.down = true
    const d = deps(w)
    const r = await submit(d, tx)
    expect(r.http).toBe(503)
    expect(d.store.list()).toHaveLength(0)
    expect(d.calls()).toBe(0)
  })
})

describe("payment checks", () => {
  test("wrong receiver, wrong sender, failed, missing, too old, underpaid", async () => {
    const w = new World()
    const d = deps(w)
    expect((await submit(d, w.pay(12, T0, { receiver: "other.testnet" }))).http).toBe(402)
    expect((await submit(d, w.pay(13, T0), "mallory.testnet")).http).toBe(402)
    expect((await submit(d, w.pay(14, T0, { success: false }))).http).toBe(402)
    expect((await submit(d, TX(99))).http).toBe(402)
    expect((await submit(d, w.pay(15, T0 - 25 * 3600 * 1000))).http).toBe(410)
    const under = await submit(d, w.pay(16, T0, { depositYocto: PRICE - 1n }))
    expect(under.job?.status).toBe("refund_due")
    expect(d.calls()).toBe(0)
  })
  test("malformed input is rejected with what to send", async () => {
    const d = deps(new World())
    const r = await submitJob(d, { name: "x", payment_tx: "nope", sender: "a", request: REQ })
    expect(r.http).toBe(400)
    expect(r.error).toContain("payment_tx")
  })
})

describe("inference failure", () => {
  test("model fails: refund_due, never 'served'", async () => {
    const w = new World()
    const d = deps(w, { fail: true })
    const r = await submit(d, w.pay(17, T0 - 1_000))
    expect(r.http).toBe(502)
    expect(r.job?.status).toBe("refund_due")
  })
})
