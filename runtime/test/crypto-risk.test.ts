import { describe, expect, test } from "bun:test"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import { addressOfPublicKey, checkSignature, eip191Hash, recoverAddress, sha256Hex } from "../src/tee"
import { riskFlags } from "../src/risk"

// Well-known vector (ethers.js docs): this private key controls 0x14791697260E4c9A71f18484C9f997B308e59325.
const PK = hexToBytes("0123456789012345678901234567890123456789012345678901234567890123")
const ADDR = "0x14791697260e4c9a71f18484c9f997b308e59325"

/** Sign like an Ethereum wallet: EIP-191 hash, 65-byte r||s||v with v = 27/28. */
function ethSign(message: string): string {
  const sig = secp256k1.sign(eip191Hash(message), PK, { prehash: false, format: "recovered" })
  const rec = sig[0]
  return "0x" + bytesToHex(sig.slice(1)) + (27 + rec).toString(16)
}

describe("TEE signature check", () => {
  test("address derivation matches the known vector", () => {
    expect(addressOfPublicKey(secp256k1.getPublicKey(PK, false))).toBe(ADDR)
  })
  test("recovers the signer of an EIP-191 signature", () => {
    expect(recoverAddress("hello", ethSign("hello"))).toBe(ADDR)
  })
  test("accepts a signature over model:sha256(req):sha256(resp) for the exact bytes", () => {
    const req = '{"model":"m","messages":[]}'
    const resp = '{"id":"chat-1","choices":[]}'
    const text = `m:${sha256Hex(req)}:${sha256Hex(resp)}`
    const c = checkSignature({ model: "m", requestBody: req, responseBody: resp, text, signature: ethSign(text), signingAddress: ADDR })
    expect(c).toEqual({ hashesMatch: true, recovered: ADDR, signerMatches: true })
  })
  test("rejects a response that was changed after signing, and a different signer", () => {
    const req = "{}"
    const text = `m:${sha256Hex(req)}:${sha256Hex("original")}`
    const tampered = checkSignature({ model: "m", requestBody: req, responseBody: "edited", text, signature: ethSign(text), signingAddress: ADDR })
    expect(tampered.hashesMatch).toBe(false)
    const other = checkSignature({ model: "m", requestBody: req, responseBody: "original", text, signature: ethSign(text), signingAddress: "0x" + "11".repeat(20) })
    expect(other.signerMatches).toBe(false)
  })
})

describe("risk flags", () => {
  const codes = (tx: Parameters<typeof riskFlags>[0]) => riskFlags(tx).map((f) => f.code)
  test("full-access key and account deletion are high risk", () => {
    expect(codes({ receiver_id: "me.testnet", actions: [{ type: "AddKey", params: { accessKey: { permission: "FullAccess" } } }] })).toContain("full_access_key")
    expect(codes({ receiver_id: "me.testnet", actions: [{ type: "DeleteAccount", params: { beneficiaryId: "x.testnet" } }] })).toContain("delete_account")
  })
  test("unlimited approval is flagged", () => {
    const tx = { receiver_id: "token.testnet", actions: [{ type: "FunctionCall", params: { methodName: "ft_approve", args: { amount: "340282366920938463463374607431768211455" } } }] }
    expect(codes(tx)).toContain("unlimited_approval")
    expect(codes(tx)).not.toContain("value") // the 1 yocto security deposit is not "sending NEAR"
  })
  test("large transfers and odd receivers are flagged; empty txs are malformed", () => {
    expect(codes({ receiver_id: "bob.testnet", actions: [{ type: "Transfer", params: { deposit: (25n * 10n ** 24n).toString() } }] })).toContain("large_value")
    expect(codes({ receiver_id: "evil-site.com", actions: [{ type: "Transfer", params: { deposit: "1" } }] })).toContain("domain_like_receiver")
    expect(codes({ receiver_id: "", actions: [] } as never)).toEqual(["malformed"])
  })
})

describe("final verdict (flags set a floor under the model)", () => {
  const { finalVerdict } = require("../src/verdict") as typeof import("../src/verdict")
  test("a high flag turns the model's CHECK FIRST into DO NOT SIGN, marked raised", () => {
    const v = finalVerdict("Adds a key.\n\nVerdict: CHECK FIRST", [{ severity: "high" }])
    expect(v).toEqual({ model: "CHECK FIRST", floor: "DO NOT SIGN", final: "DO NOT SIGN", raised: true })
  })
  test("the model may be stricter than the flags; that stands", () => {
    expect(finalVerdict("Verdict: DO NOT SIGN", [{ severity: "info" }]).final).toBe("DO NOT SIGN")
    expect(finalVerdict("Verdict: DO NOT SIGN", [{ severity: "info" }]).raised).toBe(false)
  })
  test("no verdict line: at least CHECK FIRST", () => {
    expect(finalVerdict("no verdict here", []).final).toBe("CHECK FIRST")
  })
})
