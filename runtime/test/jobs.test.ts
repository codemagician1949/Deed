// The paid-job rules of THREAT_MODEL.md §D (v3: payments held on chain by the Deed contract), including the
// track's "sale in the middle of a payout". The chain is an in-memory model of the v3 contract (pay_job,
// settle_job with its owner re-check, refund_job), so every ordering can be forced deterministically.
import { describe, expect, test } from "bun:test"
import { ed25519 } from "@noble/curves/ed25519.js"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { recoverInterrupted, requestHash, retryOnChain, submitJob, type Activation, type Answer, type Chain, type Deps, type EscrowJob, type EscrowState, type Job } from "../src/jobs"
import { base58Encode, signNep413 } from "../src/nep413"
import { ownerMessage, OWNER_RECIPIENT, verifyOwner } from "../src/owner"
import { publicJob } from "../src/public"
import { fileStore } from "../src/store"

const NAME = "preflight.deedbot.deedhq.testnet"
const RUNTIME = "deedhq.testnet"
const ESCROW = "deed.deedhq.testnet"
const PRICE = "50000000000000000000000"
const CONFIG = "ab".repeat(32)
const T0 = Date.UTC(2026, 10, 5, 12)
const REQ = { receiver_id: "usdt.testnet", actions: [{ type: "FunctionCall", params: { methodName: "ft_transfer", args: { receiver_id: "x.testnet", amount: "1" }, gas: "30000000000000", deposit: "1" } }] }

/** In-memory model of the v3 Deed contract plus the registry owner. */
class World implements Chain {
  ownerOf = "kofi.testnet"
  act: Activation | null = act("kofi.testnet", 1)
  listedBy: string | null = null
  jobs = new Map<string, EscrowJob>()
  nextId = 1
  down = false
  failWrites = false
  calls = { settle: 0, refund: 0 }
  ownerReads = 0
  /** Runs after the Nth owner read: lets a test change the chain between the runtime's reads. */
  afterOwnerRead: ((n: number) => void) | null = null
  private guard() {
    if (this.down) throw new Error("rpc unavailable")
  }
  async owner() {
    this.guard()
    const o = this.ownerOf
    this.ownerReads++
    this.afterOwnerRead?.(this.ownerReads)
    return o
  }
  async activation() {
    this.guard()
    return this.act
  }
  async listingSeller() {
    this.guard()
    return this.listedBy
  }
  async job(id: string) {
    this.guard()
    const j = this.jobs.get(id)
    return j ? structuredClone(j) : null
  }
  /** pay_job: needs a current activation; the job records the runtime/version/owner it was paid under. */
  pay(payer = "alice.testnet", request: object = REQ, opts: Partial<EscrowJob> = {}) {
    if (!this.act) throw new Error("not switched on")
    const id = String(this.nextId++)
    this.jobs.set(id, {
      id,
      token_id: NAME,
      payer,
      amount_yocto: PRICE,
      runtime_id: this.act.runtime_id,
      activation_version: this.act.version,
      activation_owner: this.act.owner,
      request_hash: requestHash(request as never),
      paid_at_ns: String(BigInt(T0) * 1_000_000n),
      state: "Pending",
      ...opts,
    })
    return id
  }
  /** settle_job: the contract re-checks activation version and owner (or listing seller); else refunds. */
  async settle(id: string) {
    this.calls.settle++
    if (this.failWrites) throw new Error("tx failed")
    const j = this.jobs.get(id)!
    if (j.state !== "Pending") throw new Error("job is not pending")
    const current = this.act?.version === j.activation_version
    const ownerOk = this.ownerOf === j.activation_owner || (this.ownerOf === ESCROW && this.listedBy === j.activation_owner)
    j.state = current && ownerOk ? { Settled: { answer_hash: "x" } } : { Refunded: { reason: "the name changed hands before the answer was delivered" } }
    return { tx: `settle-${id}`, state: j.state as EscrowState }
  }
  async refund(id: string) {
    this.calls.refund++
    if (this.failWrites) throw new Error("tx failed")
    const j = this.jobs.get(id)!
    if (j.state !== "Pending") throw new Error("job is not pending")
    j.state = { Refunded: { reason: "refunded by the runtime" } }
    return { tx: `refund-${id}`, state: j.state as EscrowState }
  }
  /** A sale: the escrow drops the activation, the buyer owns the name. */
  sell(to: string) {
    this.ownerOf = to
    this.act = null
    this.listedBy = null
  }
}
function act(owner: string, version: number, runtime = RUNTIME, config = CONFIG): Activation {
  return { owner, runtime_id: runtime, config_hash: config, price_yocto: PRICE, version, activated_at_ns: "0" }
}
function memStore() {
  const m = new Map<string, Job>()
  return { get: (id: string) => m.get(id), put: (j: Job) => void m.set(j.id, structuredClone(j)), list: () => [...m.values()] }
}
const answer = (): Answer => ({ explanation: "Sends 1 unit of USDT to x.testnet.\n\nVerdict: CHECK FIRST", model: "z-ai/glm-5.3-flash", chatId: "chat-1", requestBody: "{}", responseBody: "{\"a\":1}", signature: null, check: null })
let lastContext: unknown = null
function deps(world: World, opts: { onExplain?: () => void | Promise<void>; fail?: boolean } = {}) {
  let calls = 0
  const d: Deps & { calls: () => number } = {
    chain: world,
    inference: {
      async explain(_tx, _flags, ctx) {
        lastContext = ctx
        calls++
        await opts.onExplain?.()
        if (opts.fail) throw new Error("model timeout")
        return answer()
      },
    },
    store: memStore(),
    runtimeId: RUNTIME,
    escrow: ESCROW,
    configHash: CONFIG,
    now: () => T0,
    calls: () => calls,
  }
  return d
}
const submit = (d: Deps, id: string, request: object = REQ) => submitJob(d, { job_id: id, request: request as never })
const state = (w: World, id: string) => w.jobs.get(id)!.state

describe("accept, serve, settle on chain", () => {
  test("a paid job is answered, then settled into the name's wallet", async () => {
    const w = new World()
    const d = deps(w)
    const r = await submit(d, w.pay())
    expect(r.http).toBe(200)
    expect(r.job?.status).toBe("served")
    expect(r.job?.eraOwner).toBe("kofi.testnet")
    expect(r.job?.settlement?.outcome).toBe("settled")
    expect(state(w, "1")).toEqual({ Settled: { answer_hash: "x" } })
    expect(r.job?.flags.map((f) => f.code)).toContain("moves_assets")
    // The signed request names the Deed, the on-chain job, this runtime and the config.
    expect(lastContext).toEqual({ deed: NAME, job_id: "1", runtime_id: RUNTIME, config_hash: CONFIG })
  })
  test("the request must be the one whose hash was paid for: refused, nothing recorded, money stays held", async () => {
    const w = new World()
    const d = deps(w)
    const id = w.pay()
    const r = await submit(d, id, { ...REQ, receiver_id: "other.testnet" })
    expect(r.http).toBe(400)
    expect(d.store.get(id)).toBeUndefined()
    expect(state(w, id)).toBe("Pending")
    expect(d.calls()).toBe(0)
  })
  test("unknown job, job paid to another runtime, job no longer pending: refused, nothing recorded", async () => {
    const w = new World()
    const d = deps(w)
    expect((await submit(d, "99")).http).toBe(404)
    const other = w.pay("alice.testnet", REQ, { runtime_id: "rogue.testnet" })
    expect((await submit(d, other)).http).toBe(403)
    const done = w.pay("alice.testnet", REQ, { state: { Refunded: { reason: "x" } } })
    expect((await submit(d, done)).http).toBe(409)
    expect(d.store.list()).toHaveLength(0)
    expect(d.calls()).toBe(0)
  })
  test("malformed input is rejected with what to send", async () => {
    const d = deps(new World())
    const r = await submitJob(d, { job_id: "abc", request: REQ as never })
    expect(r.http).toBe(400)
    expect(r.error).toContain("job_id")
  })
})

describe("D1: sale in the middle of a paid job", () => {
  test("sold while the AI is answering: delivered once, and the contract refunds instead of paying the buyer's name", async () => {
    const w = new World()
    const d = deps(w, { onExplain: () => w.sell("maya.testnet") })
    const id = w.pay()
    const r = await submit(d, id)
    expect(r.job?.status).toBe("served")
    expect(r.job?.eraOwner).toBe("kofi.testnet")
    expect(r.job?.ownerAtDelivery).toBe("maya.testnet")
    expect(r.job?.settlement?.outcome).toBe("refunded")
    expect(d.calls()).toBe(1)
  })
  test("paid before the sale, sent after it: not answered, refunded on chain", async () => {
    const w = new World()
    const id = w.pay()
    w.sell("maya.testnet")
    w.act = act("maya.testnet", 2) // even after the buyer switches on
    const d = deps(w)
    const r = await submit(d, id)
    expect(r.http).toBe(409)
    expect(r.job?.status).toBe("refunded")
    expect(state(w, id)).toEqual({ Refunded: { reason: "refunded by the runtime" } })
    expect(d.calls()).toBe(0)
  })
  test("the owner changed the service (new version) after payment: refunded, not served under different terms", async () => {
    const w = new World()
    const id = w.pay()
    w.act = act("kofi.testnet", 2)
    const d = deps(w)
    expect((await submit(d, id)).job?.status).toBe("refunded")
  })
})

describe("serving while listed", () => {
  test("listed for sale: the seller's activation keeps serving and the job settles", async () => {
    const w = new World()
    w.ownerOf = ESCROW
    w.listedBy = "kofi.testnet"
    const d = deps(w)
    const r = await submit(d, w.pay())
    expect(r.job?.status).toBe("served")
    expect(r.job?.settlement?.outcome).toBe("settled")
  })
  test("listed by someone other than the activation owner: refunded, never served", async () => {
    const w = new World()
    w.ownerOf = ESCROW
    w.listedBy = "mallory.testnet"
    const d = deps(w)
    const r = await submit(d, w.pay())
    expect(r.job?.status).toBe("refunded")
    expect(d.calls()).toBe(0)
  })
})

describe("D2: stale or foreign activations", () => {
  test("an activation naming another runtime or another config is not served by this one", async () => {
    for (const a of [act("kofi.testnet", 1, "other-runtime.testnet"), act("kofi.testnet", 1, RUNTIME, "cd".repeat(32))]) {
      const w = new World()
      w.act = a
      const id = w.pay("alice.testnet", REQ, { runtime_id: RUNTIME })
      const d = deps(w)
      expect((await submit(d, id)).job?.status).toBe("refunded")
      expect(d.calls()).toBe(0)
    }
  })
  test("the name moved outside the escrow: the old owner's activation earns nothing", async () => {
    const w = new World()
    const id = w.pay()
    w.ownerOf = "maya.testnet" // direct transfer; activation still names kofi
    const d = deps(w)
    expect((await submit(d, id)).job?.status).toBe("refunded")
  })
})

describe("D4: one job, one answer", () => {
  test("re-submitting a job is refused and nothing runs twice", async () => {
    const w = new World()
    const d = deps(w)
    const id = w.pay()
    await submit(d, id)
    const again = await submit(d, id)
    expect(again.http).toBe(409)
    expect(d.calls()).toBe(1)
    expect(w.calls.settle).toBe(1)
  })
  test("two simultaneous submissions of one job: exactly one is answered", async () => {
    const w = new World()
    const d = deps(w)
    const id = w.pay()
    const [a, b] = await Promise.all([submit(d, id), submit(d, id)])
    expect([a.http, b.http].sort()).toEqual([200, 409])
    expect(d.calls()).toBe(1)
  })
  test("a handled job stays handled after the runtime restarts (ledger on disk)", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "deed-")), "jobs.json")
    const w = new World()
    const d1 = { ...deps(w), store: fileStore(file) }
    const id = w.pay()
    await submit(d1, id)
    const d2 = { ...deps(w), store: fileStore(file) }
    expect((await submit(d2, id)).http).toBe(409)
  })
})

describe("D5/D7: fail closed, consistent reads", () => {
  test("RPC unavailable: refuse, record nothing, run nothing", async () => {
    const w = new World()
    const id = w.pay()
    w.down = true
    const d = deps(w)
    const r = await submit(d, id)
    expect(r.http).toBe(503)
    expect(d.store.list()).toHaveLength(0)
    expect(d.calls()).toBe(0)
  })
  test("the name is sold between the runtime's reads: refuse, record nothing; a retry is judged afresh", async () => {
    const w = new World()
    const id = w.pay()
    w.afterOwnerRead = (n) => {
      if (n === 1) w.sell("maya.testnet")
    }
    const d = deps(w)
    const r = await submit(d, id)
    expect(r.http).toBe(503)
    expect(d.store.get(id)).toBeUndefined()
    w.afterOwnerRead = null
    expect((await submit(d, id)).job?.status).toBe("refunded")
    expect(d.calls()).toBe(0)
  })
})

describe("refunds are on chain, never an operator promise", () => {
  test("model fails: refunded on chain at once", async () => {
    const w = new World()
    const d = deps(w, { fail: true })
    const id = w.pay()
    const r = await submit(d, id)
    expect(r.http).toBe(502)
    expect(r.job?.status).toBe("refunded")
    expect(r.job?.refundTx).toBe(`refund-${id}`)
    expect(state(w, id)).toEqual({ Refunded: { reason: "refunded by the runtime" } })
  })
  test("refund tx fails: refund_due, retried later; if someone refunded on chain meanwhile, that is recorded", async () => {
    const w = new World()
    const d = deps(w, { fail: true })
    const a = w.pay()
    const b = w.pay()
    w.failWrites = true
    await submit(d, a)
    await submit(d, b)
    expect(d.store.get(a)!.status).toBe("refund_due")
    w.failWrites = false
    w.jobs.get(b)!.state = { Refunded: { reason: "not answered in time" } } // anyone refunded b after the timeout
    expect(await retryOnChain(d)).toBe(2)
    expect(d.store.get(a)!.status).toBe("refunded")
    expect(d.store.get(b)!.status).toBe("refunded")
    expect(w.calls.refund).toBe(3) // 2 failed + 1 retry for a; b was never refunded twice
  })
  test("settle tx fails: the answer is delivered, the settlement is retried until it lands", async () => {
    const w = new World()
    const d = deps(w)
    const id = w.pay()
    w.failWrites = true
    const r = await submit(d, id)
    expect(r.job?.status).toBe("served")
    expect(r.job?.settlement?.outcome).toBe("pending")
    w.failWrites = false
    await retryOnChain(d)
    expect(d.store.get(id)!.settlement?.outcome).toBe("settled")
  })
  test("a runtime that dies mid-answer refunds the job on chain when it restarts", async () => {
    const w = new World()
    const d = deps(w)
    const id = w.pay()
    d.store.put({ id, escrowJobId: id, name: NAME, payer: "alice.testnet", amountYocto: PRICE, paidAtNs: "0", status: "processing", eraOwner: "kofi.testnet", activationVersion: 1, request: REQ, flags: [], createdAt: "", updatedAt: "" })
    expect(await recoverInterrupted(d)).toBe(1)
    expect(d.store.get(id)!.status).toBe("refunded")
    expect(state(w, id)).toEqual({ Refunded: { reason: "refunded by the runtime" } })
  })
})

describe("public record and the holder-only view", () => {
  test("the public view keeps the verifiable record but not the customer's transaction or the explanation", async () => {
    const w = new World()
    const d = deps(w)
    const r = await submit(d, w.pay())
    const p = publicJob(r.job!)
    const text = JSON.stringify(p)
    expect(text).not.toContain("x.testnet")
    expect(text).not.toContain("Sends 1 unit")
    expect(p.answer?.responseSha256).toHaveLength(64)
    expect(p.settlement?.outcome).toBe("settled")
    expect(p.verdict?.final).toBe("CHECK FIRST")
  })

  const sk = ed25519.utils.randomSecretKey()
  const pk = "ed25519:" + base58Encode(ed25519.getPublicKey(sk))
  const signIn = (name: string, account: string, issuedAt = new Date(T0).toISOString()) => {
    const nonce = crypto.getRandomValues(new Uint8Array(32))
    return { name, account, public_key: pk, nonce: Buffer.from(nonce).toString("base64"), issued_at: issuedAt, signature: signNep413(ownerMessage(name, issuedAt), nonce, OWNER_RECIPIENT, sk) }
  }
  const keyOf = (holder: string) => async (account: string, key: string) => account === holder && key === pk

  test("the current holder, signing with their own full-access key, gets in", async () => {
    const d = deps(new World())
    expect(await verifyOwner(d, signIn(NAME, "kofi.testnet"), keyOf("kofi.testnet"))).toEqual({ ok: true })
  })
  test("while listed, the seller still gets in", async () => {
    const w = new World()
    w.ownerOf = ESCROW
    w.listedBy = "kofi.testnet"
    expect((await verifyOwner(deps(w), signIn(NAME, "kofi.testnet"), keyOf("kofi.testnet"))).ok).toBe(true)
  })
  test("after a sale the old holder is refused, even with a valid signature", async () => {
    const w = new World()
    w.sell("maya.testnet")
    const r = await verifyOwner(deps(w), signIn(NAME, "kofi.testnet"), keyOf("kofi.testnet"))
    expect(r).toMatchObject({ ok: false, http: 403 })
  })
  test("someone else's key, a stale sign-in, or a tampered message: refused", async () => {
    const d = deps(new World())
    expect(await verifyOwner(d, signIn(NAME, "kofi.testnet"), keyOf("mallory.testnet"))).toMatchObject({ http: 401 })
    expect(await verifyOwner(d, signIn(NAME, "kofi.testnet", new Date(T0 - 11 * 60_000).toISOString()), keyOf("kofi.testnet"))).toMatchObject({ http: 401 })
    const s = signIn(NAME, "kofi.testnet")
    expect(await verifyOwner(d, { ...s, name: "other.deedbot.deedhq.testnet" }, keyOf("kofi.testnet"))).toMatchObject({ http: 401 })
  })
})
