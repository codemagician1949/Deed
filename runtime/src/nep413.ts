// NEP-413 signed messages: how a Deed's holder proves, to this server, that they control the account
// the registry lists as owner (the holder-only console, owner.ts). Since v3 a customer needs no
// signature: the payer is whoever called pay_job, and the request hash is bound on chain.
//
// hash = sha256( u32_le(2^31 + 413) || borsh({ message: string, nonce: [u8; 32], recipient: string, callback_url: Option<string> }) )
// signature = ed25519(hash) by one of the signer's full-access keys.
import { ed25519 } from "@noble/curves/ed25519.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { utf8ToBytes } from "@noble/hashes/utils.js"

export const NEP413_TAG = 2 ** 31 + 413

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
export function base58Decode(s: string): Uint8Array {
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
  return new Uint8Array(bytes)
}
export function base58Encode(b: Uint8Array): string {
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

const u32 = (n: number) => {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n, true)
  return b
}
const borshString = (s: string) => {
  const b = utf8ToBytes(s)
  return new Uint8Array([...u32(b.length), ...b])
}

export function nep413Hash(message: string, nonce: Uint8Array, recipient: string, callbackUrl?: string | null): Uint8Array {
  if (nonce.length !== 32) throw new Error("nonce must be 32 bytes")
  const payload = new Uint8Array([
    ...borshString(message),
    ...nonce,
    ...borshString(recipient),
    ...(callbackUrl ? [1, ...borshString(callbackUrl)] : [0]),
  ])
  return sha256(new Uint8Array([...u32(NEP413_TAG), ...payload]))
}

const decodeSig = (sig: string): Uint8Array => {
  if (sig.startsWith("ed25519:")) return base58Decode(sig.slice(8))
  return Uint8Array.from(Buffer.from(sig, "base64"))
}

export function verifyNep413(input: {
  message: string
  nonce: Uint8Array
  recipient: string
  publicKey: string // "ed25519:<base58>"
  signature: string // base64 or "ed25519:<base58>"
}): boolean {
  if (!input.publicKey.startsWith("ed25519:")) return false
  try {
    const pk = base58Decode(input.publicKey.slice(8))
    const sig = decodeSig(input.signature)
    if (pk.length !== 32 || sig.length !== 64) return false
    return ed25519.verify(sig, nep413Hash(input.message, input.nonce, input.recipient), pk)
  } catch {
    return false
  }
}

export function signNep413(message: string, nonce: Uint8Array, recipient: string, secretKey32: Uint8Array): string {
  return Buffer.from(ed25519.sign(nep413Hash(message, nonce, recipient), secretKey32)).toString("base64")
}
