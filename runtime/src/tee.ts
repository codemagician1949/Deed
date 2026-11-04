// Verifies a NEAR AI Cloud response signature.
// The enclave signs `${model}:${sha256(request body)}:${sha256(response body)}` with secp256k1 using
// EIP-191 personal_sign; the signer address must match the one in the model's attestation report.
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { keccak_256 } from "@noble/hashes/sha3.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js"

export const sha256Hex = (s: string) => bytesToHex(sha256(utf8ToBytes(s)))

export function eip191Hash(message: string): Uint8Array {
  const m = utf8ToBytes(message)
  return keccak_256(new Uint8Array([...utf8ToBytes(`\x19Ethereum Signed Message:\n${m.length}`), ...m]))
}

export function addressOfPublicKey(pub: Uint8Array): string {
  const uncompressed = pub.length === 65 ? pub : secp256k1.Point.fromBytes(pub).toBytes(false)
  return "0x" + bytesToHex(keccak_256(uncompressed.slice(1)).slice(-20))
}

/** Recovers the Ethereum-style address that produced a 65-byte r||s||v signature over an EIP-191 message. */
export function recoverAddress(message: string, signatureHex: string): string {
  const sig = hexToBytes(signatureHex.replace(/^0x/, ""))
  if (sig.length !== 65) throw new Error(`signature must be 65 bytes, got ${sig.length}`)
  let v = sig[64]
  if (v >= 27) v -= 27
  if (v > 1) throw new Error(`bad recovery byte ${sig[64]}`)
  // noble's "recovered" format puts the recovery byte first.
  const nobleSig = new Uint8Array([v, ...sig.slice(0, 64)])
  const pub = secp256k1.recoverPublicKey(nobleSig, eip191Hash(message), { prehash: false })
  return addressOfPublicKey(pub)
}

export interface SignatureCheck {
  /** The signed text names our model and the hashes of the exact bytes we sent and received. */
  hashesMatch: boolean
  /** Address recovered from the signature. */
  recovered: string | null
  /** Recovered address equals the address NEAR AI reports for the enclave. */
  signerMatches: boolean
  /**
   * The signer is listed in the attestation report NEAR AI serves for the model. The report carries Intel TDX
   * and NVIDIA evidence, but this runtime does NOT verify those quotes itself: it trusts NEAR AI's report.
   * null = not checked.
   */
  attested?: boolean | null
}

export function checkSignature(input: {
  model: string
  requestBody: string
  responseBody: string
  text: string
  signature: string
  signingAddress: string
}): SignatureCheck {
  const want = `${sha256Hex(input.requestBody)}:${sha256Hex(input.responseBody)}`
  const hashesMatch = input.text === `${input.model}:${want}` || input.text.endsWith(want)
  let recovered: string | null = null
  try {
    recovered = recoverAddress(input.text, input.signature)
  } catch {
    recovered = null
  }
  return {
    hashesMatch,
    recovered,
    signerMatches: !!recovered && recovered.toLowerCase() === input.signingAddress.toLowerCase(),
  }
}
