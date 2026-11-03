// Builds every Deed shown in the app from NEAR testnet: contract state via RPC views and
// history from every transaction that touched the name (FastNEAR tx API). No server, no sample data.
import { CONFIG, isDemoAccount } from "./config"
import { accountTxHashes, toNear, transactions, view, viewAccount, type TxSummary } from "./near"
import type { Deed, DeedStatus, HistoryEvent, Holder } from "./types"
import { templateFor } from "./templates"

interface TokenView {
  token_id: string
  owner_id: string
  metadata?: { extra?: string }
}
export interface Activation {
  owner: string
  runtime_id: string
  config_hash: string
  price_yocto: string
  version: number
  nonce: string
  activated_at_ns: string
}
export interface Listing {
  token_id: string
  seller: string
  price_yocto: string
  nonce: string
  listed_at_ns: string
  state: { kind: "Active" | "Settling" | "Cancelling"; buyer?: string }
}
export interface Sale {
  id: string
  token_id: string
  seller: string
  buyer: string
  price_yocto: string
  sold_at_ns: string
  final_after_ns: string
  state: "Pending" | "Claiming" | "Paid" | "Reverted"
  royalty_account: string
  royalty_yocto: string
}

export interface LiveDeed extends Deed {
  activation: Activation | null
  listingRaw: Listing | null
  latestSale: Sale | null
  balanceNear: number
  payoutAccount: string | null
  /** Highest activation version seen in history (activations are deleted on listing). */
  maxVersion: number
}

const iso = (ns: string | number) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString()
const short = (a: string) => (a === CONFIG.deed ? "the Deed escrow" : a)
const hueOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

function historyFrom(tokenId: string, txs: TxSummary[]): HistoryEvent[] {
  const ev: HistoryEvent[] = []
  for (const tx of txs) {
    const at = iso(tx.timestampNs)
    const base = { at, tx: tx.hash }
    let n = 0
    const push = (e: Omit<HistoryEvent, "id" | "at" | "tx">) => ev.push({ ...base, id: `${tx.hash}-${n++}`, ...e })

    // Payments into the name.
    for (const a of tx.actions) {
      if (a.kind === "Transfer" && tx.receiver === tokenId && tx.success && a.deposit) {
        push({
          kind: "earned",
          title: `Received a payment from ${tx.signer}`,
          amountNear: toNear(a.deposit),
          actor: tx.signer,
          source: isDemoAccount(tx.signer) ? "demo" : "external",
        })
      }
      if (a.kind === "CreateAccount" && tx.success && tx.events.length === 0) {
        push({ kind: "minted", title: "Account created", actor: tx.signer })
      }
    }

    // Failed calls into the wallet = someone trying to act without permission.
    if (!tx.success && tx.receiver === tokenId) {
      const m = tx.actions.find((a) => a.method)?.method
      push({
        kind: "attack_blocked",
        title: `${tx.signer} tried to act for the account: blocked`,
        detail: `${m ?? "call"} → ${tx.failure ?? "refused"}`,
        actor: tx.signer,
      })
    }
    if (!tx.success && tx.receiver === CONFIG.deed) {
      const m = tx.actions.find((a) => a.method)?.method
      const args = tx.actions.find((a) => a.method)?.args as { token_id?: string } | undefined
      if (!args?.token_id || args.token_id === tokenId) {
        push({ kind: "attack_blocked", title: `${tx.signer} called ${m}: refused`, detail: tx.failure, actor: tx.signer })
      }
    }
    if (!tx.success && tx.receiver === CONFIG.registry && tx.actions.some((a) => a.method === "transfer_sub_account")) {
      push({ kind: "attack_blocked", title: `${tx.signer} tried to move the name: refused`, detail: tx.failure, actor: tx.signer })
    }

    for (const e of tx.events) {
      const d = (Array.isArray(e.data) ? e.data[0] : e.data) as Record<string, any>
      if (!d) continue
      switch (`${e.standard}:${e.event}`) {
        case "nep171:nft_mint":
          if ((d.token_ids ?? []).includes(tokenId)) push({ kind: "minted", title: `Name rented by ${d.owner_id}`, actor: d.owner_id })
          break
        case "nep171:nft_transfer":
          if (!(d.token_ids ?? []).includes(tokenId)) break
          if (d.new_owner_id === CONFIG.deed) break // covered by deed:listed
          if (d.old_owner_id === CONFIG.deed) break // covered by deed:sold / cancelled
          push({ kind: "sold", title: `Ownership moved from ${d.old_owner_id} to ${d.new_owner_id}`, actor: d.new_owner_id })
          break
        case "hos_tla_tenant_wallet:swept_near":
          if (e.executor !== tokenId) break
          push({
            kind: "swept",
            title: `Earnings paid out to ${short(d.payout_account)}`,
            detail: "Done by the account's own wallet code during an ownership change",
            amountNear: toNear(d.amount),
            actor: d.payout_account,
          })
          break
        case "hos_tla_extension:force_transfer_completed":
          if (d.wallet !== tokenId) break
          push({
            kind: "permissions_cleared",
            title: "Previous owner's permissions wiped",
            detail: "Every agent grant and extra key removed by the wallet on rotation",
          })
          break
        case "wallet:extension_added":
          if (e.executor !== tokenId) break
          push({ kind: "activated", title: `${d.by?.extension ?? "Owner"} gave ${d.account_id} permission to act`, actor: d.by?.extension })
          break
        case "hos_tla_tenant_wallet:spend_granted":
          if (e.executor !== tokenId) break
          push({ kind: "activated", title: `Owner gave ${d.extension} a capped spending allowance` })
          break
        case "hos_tla_tenant_wallet:spend_charged":
          if (e.executor !== tokenId) break
          push({ kind: "refund", title: `${d.extension} spent within its allowance`, amountNear: toNear(d.amount ?? "0"), actor: d.extension })
          break
        case "deed:activated":
          if (d.token_id !== tokenId) break
          push({
            kind: "activated",
            title: `${d.activation.owner} switched the service on`,
            detail: `version ${d.activation.version} · price ${toNear(d.activation.price_yocto)} NEAR per job`,
            actor: d.activation.owner,
          })
          break
        case "deed:listed":
          if (d.listing?.token_id !== tokenId) break
          push({ kind: "listed", title: `${d.listing.seller} listed it for ${toNear(d.listing.price_yocto)} NEAR`, actor: d.listing.seller })
          break
        case "deed:sold":
          if (d.sale?.token_id !== tokenId) break
          push({
            kind: "sold",
            title: `Sold to ${d.sale.buyer} for ${toNear(d.sale.price_yocto)} NEAR`,
            amountNear: toNear(d.sale.price_yocto),
            actor: d.sale.buyer,
          })
          break
        case "deed:proceeds_paid":
          if (d.sale?.token_id !== tokenId) break
          push({
            kind: "proceeds_paid",
            title: `${d.sale.seller} was paid for the sale`,
            detail: `after the 5-minute safety window`,
            amountNear: toNear(BigInt(d.sale.price_yocto) - BigInt(d.sale.royalty_yocto)),
            actor: d.sale.seller,
          })
          if (BigInt(d.sale.royalty_yocto) > 0n)
            push({ kind: "royalty_paid", title: `Royalty to ${d.sale.royalty_account}`, amountNear: toNear(d.sale.royalty_yocto) })
          break
        case "deed:sale_failed_refunded":
          if (d.token_id !== tokenId) break
          push({ kind: "refund", title: `Transfer failed: ${d.buyer} refunded in full`, amountNear: toNear(d.refund_yocto), actor: d.buyer })
          break
        case "deed:sale_reverted_refunded":
          if (d.sale?.token_id !== tokenId) break
          push({ kind: "refund", title: `Sale reversed (v1 contract): ${d.sale.buyer} refunded`, amountNear: toNear(d.sale.price_yocto) })
          break
        case "deed:returned_to_buyer_listing":
          if (d.listing?.token_id !== tokenId) break
          push({ kind: "listed", title: `Name was back in the escrow after the sale: recorded as ${d.listing.seller}'s to take back` })
          break
        case "deed:cancelled":
          if (d.token_id !== tokenId) break
          push({ kind: "listed", title: `${d.seller} took it off the market` })
          break
      }
    }
  }
  return ev.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

function holdersFrom(tokenId: string, txs: TxSummary[], currentOwner: string, history: HistoryEvent[]): Holder[] {
  const moves: { at: string; from: string; to: string }[] = []
  let first: string | null = null
  for (const tx of [...txs].sort((a, b) => (BigInt(a.timestampNs) < BigInt(b.timestampNs) ? -1 : 1))) {
    for (const e of tx.events) {
      const d = (Array.isArray(e.data) ? e.data[0] : e.data) as Record<string, any>
      if (e.standard === "nep171" && e.event === "nft_mint" && (d?.token_ids ?? []).includes(tokenId)) first = d.owner_id
      if (e.standard === "nep171" && e.event === "nft_transfer" && (d?.token_ids ?? []).includes(tokenId)) {
        first ??= d.old_owner_id
        moves.push({ at: iso(tx.timestampNs), from: d.old_owner_id, to: d.new_owner_id })
      }
    }
  }
  const periods: Holder[] = []
  let owner = first ?? currentOwner
  let since = txs.length ? iso(txs.reduce((m, t) => (BigInt(t.timestampNs) < BigInt(m) ? t.timestampNs : m), txs[0].timestampNs)) : new Date().toISOString()
  for (const m of moves) {
    if (m.to === CONFIG.deed) continue // listing: the seller still "holds" it until sold
    if (m.from === CONFIG.deed && m.to === owner) continue // cancelled or returned
    periods.push({ account: owner, from: since, to: m.at, earnedNear: 0 })
    owner = m.to
    since = m.at
  }
  periods.push({ account: owner === CONFIG.deed ? currentOwner : owner, from: since, earnedNear: 0 })
  for (const h of periods) {
    h.earnedNear = history
      .filter((e) => e.kind === "earned" && e.at >= h.from && (!h.to || e.at < h.to))
      .reduce((s, e) => s + (e.amountNear ?? 0), 0)
  }
  return periods
}

function dailySeries(history: HistoryEvent[], days = 14): number[] {
  const out = Array(days).fill(0)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  for (const e of history) {
    if (e.kind !== "earned") continue
    const d = Math.floor((today.getTime() - new Date(e.at).setUTCHours(0, 0, 0, 0)) / 86_400_000)
    if (d >= 0 && d < days) out[days - 1 - d] += e.amountNear ?? 0
  }
  return out
}

export async function loadDeed(tokenId: string): Promise<LiveDeed | null> {
  const token = await view<TokenView | null>(CONFIG.registry, "nft_token", { token_id: tokenId })
  if (!token) return null
  const [activation, listing, latestSale, account, payout, nameTxs, deedTxs] = await Promise.all([
    view<Activation | null>(CONFIG.deed, "get_activation", { token_id: tokenId }),
    view<Listing | null>(CONFIG.deed, "get_listing", { token_id: tokenId }),
    view<Sale | null>(CONFIG.deed, "get_latest_sale", { token_id: tokenId }),
    viewAccount(tokenId),
    view<string>(tokenId, "hos_payout_account").catch(() => null),
    accountTxHashes(tokenId).catch(() => [] as string[]),
    accountTxHashes(CONFIG.deed).catch(() => [] as string[]),
  ])
  const hashes = Array.from(new Set([...nameTxs, ...deedTxs]))
  const txs = await transactions(hashes)
  // Keep only deed-contract txs about this name (activations etc. don't touch the name account).
  const relevant = txs.filter(
    (t) =>
      t.receiver === tokenId ||
      nameTxs.includes(t.hash) ||
      t.events.some((e) => JSON.stringify(e.data).includes(`"${tokenId}"`)) ||
      t.actions.some((a) => (a.args as { token_id?: string } | undefined)?.token_id === tokenId),
  )
  const history = historyFrom(tokenId, relevant)
  const owner = token.owner_id
  const status: DeedStatus =
    owner === CONFIG.deed ? "listed" : activation && activation.owner === owner ? "serving" : "awaiting_activation"
  const tpl = templateFor(activation?.config_hash ?? null)
  const earned = history.filter((e) => e.kind === "earned").reduce((s, e) => s + (e.amountNear ?? 0), 0)
  let expires: string | undefined
  try {
    expires = JSON.parse(token.metadata?.extra ?? "{}").expires_at
  } catch {
    /* no lease info */
  }
  const holders = holdersFrom(tokenId, relevant, listing?.seller ?? owner, history)
  return {
    id: tokenId,
    tagline: tpl.tagline,
    service: {
      title: tpl.title,
      priceNear: activation ? toNear(activation.price_yocto) : 0,
      model: tpl.model,
      configHash: activation?.config_hash ?? "not switched on",
    },
    owner: owner === CONFIG.deed && listing ? listing.seller : owner,
    status,
    listing: listing ? { priceNear: toNear(listing.price_yocto), nonce: listing.nonce, seller: listing.seller } : undefined,
    stats: {
      earnedNear: earned,
      jobs: history.filter((e) => e.kind === "earned").length,
      refunds: history.filter((e) => e.kind === "attack_blocked").length,
      uptimePct: 0,
    },
    earningsSeries: dailySeries(history),
    holders,
    history,
    leaseUntil: expires ? iso(expires) : "",
    hue: hueOf(tokenId),
    activation,
    listingRaw: listing,
    latestSale,
    balanceNear: account ? toNear(account.amount) : 0,
    payoutAccount: payout,
    maxVersion: relevant
      .flatMap((t) => t.events)
      .filter((e) => e.standard === "deed" && e.event === "activated")
      .reduce((m, e) => Math.max(m, ((e.data as { activation?: { version?: number } }[])[0]?.activation?.version ?? 0)), activation?.version ?? 0),
  }
}

export async function loadDeedIds(): Promise<string[]> {
  const tokens = await view<TokenView[]>(CONFIG.registry, "nft_tokens", { from_index: "0", limit: 50 })
  return tokens.map((t) => t.token_id)
}
