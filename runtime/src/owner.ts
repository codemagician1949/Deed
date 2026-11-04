// The holder-only gate (the nfts track's "page only current holders can open"), enforced by this server,
// not just the web UI. The holder signs a NEP-413 message in their wallet; we check:
//   1. the signature is valid for the message (name + issue time) and recipient,
//   2. the public key is a full-access key of the claimed account, read on chain now,
//   3. that account owns the name right now (or listed it for sale), read on chain now,
//   4. the message was issued in the last 10 minutes (a captured signature stops working quickly).
import type { Deps } from "./jobs"
import { verifyNep413 } from "./nep413"
import { CONFIG } from "./config"

export const OWNER_RECIPIENT = "deed-console"
export const OWNER_MAX_AGE_MS = 10 * 60 * 1000

/** The exact text the holder signs (the web console and any client build the same string). */
export function ownerMessage(name: string, issuedAt: string): string {
  return `Deed holder sign-in\nDeed: ${name}\nIssued: ${issuedAt}`
}

async function isFullAccessKey(account: string, publicKey: string): Promise<boolean> {
  const r = (await fetch(CONFIG.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_access_key", finality: "final", account_id: account, public_key: publicKey } }),
    signal: AbortSignal.timeout(10_000),
  }).then((x) => x.json())) as { result?: { permission: unknown }; error?: { cause?: { name?: string } } }
  if (r.error) {
    if (/UNKNOWN_ACCESS_KEY|UNKNOWN_ACCOUNT/.test(r.error.cause?.name ?? "")) return false
    throw new Error(r.error.cause?.name ?? "RPC error")
  }
  return r.result?.permission === "FullAccess"
}

export async function verifyOwner(
  d: Deps,
  b: Record<string, string>,
  keyCheck: (account: string, pk: string) => Promise<boolean> = isFullAccessKey,
): Promise<{ ok: true } | { ok: false; http: number; error: string }> {
  const { name, account, public_key, signature, nonce, issued_at } = b ?? {}
  if (![name, account, public_key, signature, nonce, issued_at].every((x) => typeof x === "string" && x.length > 0)) {
    return { ok: false, http: 400, error: "Send {name, account, public_key, signature, nonce, issued_at} from a NEP-413 signature of the holder sign-in message." }
  }
  const t = Date.parse(issued_at)
  if (!Number.isFinite(t) || Math.abs(d.now() - t) > OWNER_MAX_AGE_MS) return { ok: false, http: 401, error: "This sign-in is older than 10 minutes. Sign again." }
  let n: Uint8Array
  try {
    n = Uint8Array.from(Buffer.from(nonce, "base64"))
  } catch {
    return { ok: false, http: 400, error: "nonce must be base64 of 32 bytes." }
  }
  if (n.length !== 32) return { ok: false, http: 400, error: "nonce must be base64 of 32 bytes." }
  if (!verifyNep413({ message: ownerMessage(name, issued_at), nonce: n, recipient: OWNER_RECIPIENT, publicKey: public_key, signature })) {
    return { ok: false, http: 401, error: "The signature doesn't match the holder sign-in message." }
  }
  try {
    if (!(await keyCheck(account, public_key))) return { ok: false, http: 401, error: `${public_key} is not a full-access key of ${account}.` }
    const owner = await d.chain.owner(name)
    const holder = owner === d.escrow ? await d.chain.listingSeller(name) : owner
    if (holder !== account) return { ok: false, http: 403, error: `${account} doesn't hold ${name} right now.` }
  } catch (e) {
    return { ok: false, http: 503, error: `Can't check the chain right now (${e instanceof Error ? e.message : e}). Try again.` }
  }
  return { ok: true }
}
