// The paid-job rules of THREAT_MODEL.md §D, including the track's "sale in the middle of a payout".
// Chain and inference are in-memory fakes so every ordering can be forced deterministically.
import { describe, expect, test } from "bun:test"
import { ed25519 } from "@noble/curves/ed25519.js"
import { recordRefund, recoverInterrupted, resumeAwaiting, submitJob, type Activation, type Answer, type Chain, type Deps, type Job, type JobInput, type Payment } from "../src/jobs"
import { base58Encode, jobMessage, RECIPIENT, signNep413 } from "../src/nep413"
import { fileStore } from "../src/store"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const NAME = "preflight.deedbot.deedhq.testnet"
const RUNTIME = "deedhq.testnet"
const ESCROW = "deed.deedhq.testnet"
const PRICE = 50_000_000_000_000_000_000_000n // 0.05 NEAR
const T0 = Date.UTC(2026, 10, 3, 12) // ms
const ns = (ms: number) => BigInt(ms) * 1_000_000n
const TX = (n: number) => `${"9".repeat(43 - String(n).length)}${n}`.replace(/0/g, "A")
const REQ = { receiver_id: "usdt.testnet", actions: [{ type: "FunctionCall", params: { methodName: "ft_transfer", args: { receiver_id: "x.testnet", amount: "1" }, gas: "30000000000000", deposit: "1" } }] }

// Each test account has one ed25519 full-access key.
const keys = new Map<string, Uint8Array>()
const keyOf = (account: string) => {
  if (!keys.has(account)) keys.set(account, ed25519.utils.randomSecretKey())
  return keys.get(account)!
}
const pubOf = (account: string) => "ed25519:" + base58Encode(ed25519.getPublicKey(keyOf(account)))
function signed(input: Omit<JobInput, "auth">, as = input.sender): JobInput {
  const nonce = crypto.getRandomValues(new Uint8Array(32))
  return {
    ...input,
    auth: {
      public_key: pubOf(as),
      signature: signNep413(jobMessage(input.name, input.payment_tx, input.request), nonce, RECIPIENT, keyOf(as)),
      nonce: Buffer.from(nonce).toString("base64"),
    },
  }
}

class World implements Chain {
  ownerOf = "kofi.testnet"
  act: Activation | null = act("kofi.testnet", 1)
  rotation = 0n
  payments = new Map<string, Payment>()
  down = false
  listedBy: string | null = null
  ownerReads = 0
  /** Runs after the Nth owner read: lets a test change the chain between the runtime's reads. */
  afterOwnerRead: ((n: number) => void) | null = null
  async owner() {
    if (this.down) throw new Error("rpc unavailable")
    const o = this.ownerOf
    this.ownerReads++
    this.afterOwnerRead?.(this.ownerReads)
    return o
  }
  async listingSeller() {
    if (this.down) throw new Error("rpc unavailable")
    return this.listedBy
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
  async hasFullAccessKey(account: string, pk: string) {
    if (this.down) throw new Error("rpc unavailable")
    return pubOf(account) === pk
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
const submit = (d: Deps, tx: string, sender = "alice.testnet") => submitJob(d, signed({ name: NAME, payment_tx: tx, sender, request: REQ }))

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

  test("escrow holds the name with no active listing (sale settling): nothing is served", async () => {
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

describe("payer authentication (NEP-413)", () => {
  test("no signature: refused, nothing recorded", async () => {
    const w = new World()
    const d = deps(w)
    const r = await submitJob(d, { name: NAME, payment_tx: w.pay(20, T0 - 1_000), sender: "alice.testnet", request: REQ })
    expect(r.http).toBe(401)
    expect(d.store.list()).toHaveLength(0)
  })
  test("someone else submits Alice's public payment with their own question: refused", async () => {
    const w = new World()
    const d = deps(w)
    const tx = w.pay(21, T0 - 1_000)
    const theirs = { receiver_id: "mallory.testnet", actions: [{ type: "Transfer", params: { deposit: "1" } }] }
    // Mallory claims to be Alice but signs with her own key.
    const r = await submitJob(d, signed({ name: NAME, payment_tx: tx, sender: "alice.testnet", request: theirs }, "mallory.testnet"))
    expect(r.http).toBe(401)
    // Alice can still use her payment afterwards.
    expect((await submit(d, tx)).http).toBe(200)
  })
  test("a valid signature for one request can't be reused for a different request", async () => {
    const w = new World()
    const d = deps(w)
    const tx = w.pay(22, T0 - 1_000)
    const good = signed({ name: NAME, payment_tx: tx, sender: "alice.testnet", request: REQ })
    const swapped = { ...good, request: { receiver_id: "other.testnet", actions: [{ type: "Transfer", params: { deposit: "2" } }] } }
    expect((await submitJob(d, swapped)).http).toBe(401)
  })
})

describe("D4 across restarts", () => {
  test("a used payment stays used after the runtime restarts (ledger on disk)", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "deed-ledger-")), "jobs.json")
    const w = new World()
    const tx = w.pay(30, T0 - 1_000)
    const first = { ...deps(w), store: fileStore(file) }
    expect((await submit(first, tx)).http).toBe(200)
    // "Restart": a brand-new store reading the same file, as after a redeploy with a persistent volume.
    const second = { ...deps(w), store: fileStore(file) }
    const again = await submit(second, tx)
    expect(again.http).toBe(409)
    expect(again.job?.status).toBe("served")
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
    const r = await submitJob(d, signed({ name: "x", payment_tx: "nope", sender: "a", request: REQ }))
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

describe("serving while listed", () => {
  test("listed for sale: the seller's activation keeps serving (payments while listed reach the seller at the sale)", async () => {
    const w = new World()
    w.sell(ESCROW, T0 - 60_000) // listing moves the name into the escrow
    w.listedBy = "kofi.testnet"
    const d = deps(w)
    const r = await submit(d, w.pay(30, T0 - 1_000))
    expect(r.job?.status).toBe("served")
    expect(r.job?.eraOwner).toBe("kofi.testnet")
  })
  test("listed by someone other than the activation owner: not served", async () => {
    const w = new World()
    w.sell(ESCROW, T0 - 60_000)
    w.listedBy = "mallory.testnet"
    const d = deps(w)
    const r = await submit(d, w.pay(31, T0 - 1_000))
    expect(r.job?.status).toBe("awaiting_activation")
    expect(d.calls()).toBe(0)
  })
})

describe("inconsistent reads", () => {
  test("the name is sold between the runtime's reads: refuse, record nothing, run nothing; a retry is judged afresh", async () => {
    const w = new World()
    // First owner read says Kofi; right after it, the name is sold and the buyer activates.
    w.afterOwnerRead = (n) => {
      if (n === 1) {
        w.sell("maya.testnet", T0 - 500)
        w.act = act("maya.testnet", 2)
      }
    }
    const d = deps(w)
    const tx = w.pay(32, T0 - 1_000)
    const r = await submit(d, tx)
    expect(r.http).toBe(503)
    expect(d.store.get(tx)).toBeUndefined()
    expect(d.calls()).toBe(0)
    w.afterOwnerRead = null
    const again = await submit(d, tx) // paid before the sale → the seller's era → refund
    expect(again.job?.status).toBe("refund_due")
    expect(d.calls()).toBe(0)
  })
  test("the activation changes between reads (owner switches runtime): refuse, record nothing", async () => {
    const w = new World()
    w.afterOwnerRead = (n) => {
      if (n === 2) w.act = act("kofi.testnet", 2, "other-runtime.testnet") // between the first and the confirming read
    }
    const d = deps(w)
    const tx = w.pay(33, T0 - 1_000)
    expect((await submit(d, tx)).http).toBe(503)
    expect(d.store.get(tx)).toBeUndefined()
  })
})

describe("crash recovery", () => {
  test("a runtime that dies mid-answer leaves the job refund_due on restart, never stuck", async () => {
    const w = new World()
    const d = deps(w)
    const tx = w.pay(34, T0 - 1_000)
    // Simulate the crash: the job was claimed ("processing") and the process died before answering.
    d.store.put({ id: tx, name: NAME, payer: "alice.testnet", amountYocto: PRICE.toString(), paidAtNs: ns(T0 - 1_000).toString(), status: "processing", eraOwner: "kofi.testnet", activationVersion: 1, request: REQ, flags: [], createdAt: "", updatedAt: "" })
    expect(recoverInterrupted(d)).toBe(1)
    expect(d.store.get(tx)!.status).toBe("refund_due")
    expect((await submit(d, tx)).http).toBe(409) // still one payment, one job
    expect(d.calls()).toBe(0)
  })
})

describe("refunds", () => {
  const setup = async () => {
    const w = new World()
    const d = deps(w, { fail: true })
    const a = w.pay(40, T0 - 10_000)
    const b = w.pay(41, T0 - 9_000)
    await submit(d, a)
    await submit(d, b)
    return { w, d, a, b }
  }
  const refund = (w: World, n: number, atMs: number, opts: Partial<Payment> = {}) =>
    w.pay(n, atMs, { signer: RUNTIME, receiver: "alice.testnet", ...opts })
  test("a real refund after the payment settles the job", async () => {
    const { w, d, a } = await setup()
    const r = await recordRefund(d, a, refund(w, 50, T0))
    expect(r.http).toBe(200)
    expect(d.store.get(a)!.status).toBe("refunded")
  })
  test("one refund tx can't settle two jobs", async () => {
    const { w, d, a, b } = await setup()
    const tx = refund(w, 51, T0)
    expect((await recordRefund(d, a, tx)).http).toBe(200)
    expect((await recordRefund(d, b, tx)).http).toBe(409)
    expect(d.store.get(b)!.status).toBe("refund_due")
  })
  test("an older, unrelated transfer to the payer can't be passed off as the refund", async () => {
    const { w, d, a } = await setup()
    expect((await recordRefund(d, a, refund(w, 52, T0 - 60_000))).http).toBe(402)
  })
  test("wrong sender, wrong receiver or too little: refused", async () => {
    const { w, d, a } = await setup()
    expect((await recordRefund(d, a, refund(w, 53, T0, { signer: "kofi.testnet" }))).http).toBe(402)
    expect((await recordRefund(d, a, refund(w, 54, T0, { receiver: "mallory.testnet" }))).http).toBe(402)
    expect((await recordRefund(d, a, refund(w, 55, T0, { depositYocto: PRICE - 1n }))).http).toBe(402)
    expect(d.store.get(a)!.status).toBe("refund_due")
  })
  test("a served job can't be marked refunded", async () => {
    const w = new World()
    const d = deps(w)
    const a = w.pay(42, T0 - 1_000)
    await submit(d, a)
    expect((await recordRefund(d, a, refund(w, 56, T0))).http).toBe(409)
  })
})
