// Minimal NEAR transaction signer for the runtime's two on-chain duties: `settle_job` and `refund_job`
// on the Deed contract. The key it uses should be a FUNCTION-CALL access key limited to exactly those
// two methods on that contract (deploy/runtime-key.sh), so a leaked runtime key can't move funds.
//
// Borsh layout (nearcore `Transaction` v0 and `SignedTransaction`):
//   signer_id: string, public_key: {u8 0, [u8;32]}, nonce: u64, receiver_id: string, block_hash: [u8;32],
//   actions: Vec<Action>  with  Action::FunctionCall = 2 { method_name: string, args: Vec<u8>, gas: u64, deposit: u128 }
//   signed = transaction ‖ signature {u8 0, [u8;64]};  the signed message is sha256(transaction).
import { ed25519 } from "@noble/curves/ed25519.js"
import { sha256 } from "@noble/hashes/sha2.js"

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

export function b58decode(s: string): Uint8Array {
  let n = 0n
  for (const c of s) {
    const i = B58.indexOf(c)
    if (i < 0) throw new Error("bad base58")
    n = n * 58n + BigInt(i)
  }
  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn))
    n >>= 8n
  }
  for (const c of s) {
    if (c !== "1") break
    bytes.unshift(0)
  }
  return Uint8Array.from(bytes)
}

export function b58encode(b: Uint8Array): string {
  let n = 0n
  for (const x of b) n = (n << 8n) | BigInt(x)
  let s = ""
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s
    n /= 58n
  }
  for (const x of b) {
    if (x !== 0) break
    s = "1" + s
  }
  return s
}

class W {
  private parts: number[] = []
  u8(v: number) {
    this.parts.push(v & 0xff)
  }
  u32(v: number) {
    for (let i = 0; i < 4; i++) this.parts.push((v >>> (8 * i)) & 0xff)
  }
  uN(v: bigint, bytes: number) {
    for (let i = 0; i < bytes; i++) this.parts.push(Number((v >> BigInt(8 * i)) & 0xffn))
  }
  bytes(b: Uint8Array) {
    for (const x of b) this.parts.push(x)
  }
  str(s: string) {
    const b = new TextEncoder().encode(s)
    this.u32(b.length)
    this.bytes(b)
  }
  out() {
    return Uint8Array.from(this.parts)
  }
}

export interface FunctionCall {
  methodName: string
  args: object
  gas: bigint
  deposit: bigint
}

export function serializeTx(p: { signerId: string; publicKey: Uint8Array; nonce: bigint; receiverId: string; blockHash: Uint8Array; actions: FunctionCall[] }): Uint8Array {
  const w = new W()
  w.str(p.signerId)
  w.u8(0)
  w.bytes(p.publicKey)
  w.uN(p.nonce, 8)
  w.str(p.receiverId)
  w.bytes(p.blockHash)
  w.u32(p.actions.length)
  for (const a of p.actions) {
    w.u8(2) // FunctionCall
    w.str(a.methodName)
    const args = new TextEncoder().encode(JSON.stringify(a.args))
    w.u32(args.length)
    w.bytes(args)
    w.uN(a.gas, 8)
    w.uN(a.deposit, 16)
  }
  return w.out()
}

export interface Signer {
  accountId: string
  publicKey: string // "ed25519:<base58>"
  /** Signs and sends one function call; resolves with the tx hash and the decoded return value. */
  call(receiverId: string, methodName: string, args: object, gasTgas?: number): Promise<{ hash: string; value: unknown }>
}

/** `secretKey` = "ed25519:<base58 of 64 bytes (seed ‖ public)>" as near-cli stores it. */
export function makeSigner(rpcUrl: string, accountId: string, secretKey: string): Signer {
  const raw = b58decode(secretKey.replace(/^ed25519:/, ""))
  if (raw.length !== 64 && raw.length !== 32) throw new Error("RUNTIME_KEY must be an ed25519 secret key")
  const seed = raw.slice(0, 32)
  const pub = ed25519.getPublicKey(seed)
  const publicKey = "ed25519:" + b58encode(pub)
  const rpc = async (method: string, params: unknown) => {
    const r = (await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((x) => x.json())) as {
      result?: any
      error?: any
    }
    if (r.error) throw Object.assign(new Error(JSON.stringify(r.error.data ?? r.error.cause ?? r.error).slice(0, 300)), { rpc: r.error })
    return r.result
  }
  let queue: Promise<unknown> = Promise.resolve() // one tx at a time keeps nonces simple
  return {
    accountId,
    publicKey,
    call(receiverId, methodName, args, gasTgas = 100) {
      const run = async () => {
        const ak = await rpc("query", { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey })
        const tx = serializeTx({
          signerId: accountId,
          publicKey: pub,
          nonce: BigInt(ak.nonce) + 1n,
          receiverId,
          blockHash: b58decode(ak.block_hash),
          actions: [{ methodName, args, gas: BigInt(gasTgas) * 10n ** 12n, deposit: 0n }],
        })
        const sig = ed25519.sign(sha256(tx), seed)
        const signed = new Uint8Array(tx.length + 65)
        signed.set(tx)
        signed[tx.length] = 0
        signed.set(sig, tx.length + 1)
        const res = await rpc("send_tx", { signed_tx_base64: Buffer.from(signed).toString("base64"), wait_until: "FINAL" })
        const hash: string = res.transaction?.hash ?? b58encode(sha256(tx))
        const st = res.status ?? {}
        if (st.Failure) throw Object.assign(new Error(JSON.stringify(st.Failure).slice(0, 300)), { hash })
        const value = st.SuccessValue ? JSON.parse(Buffer.from(st.SuccessValue, "base64").toString() || "null") : null
        return { hash, value }
      }
      const p = queue.then(run, run)
      queue = p.catch(() => undefined)
      return p
    },
  }
}
