// Every on-chain action the app can take, as exact contract calls. Gas and deposits match
// what the contracts require (see contract/deed/src/lib.rs and README "Contract reference").
import { CONFIG } from "./config"
import { nearToYocto } from "./near"
import { PREFLIGHT_CONFIG_HASH } from "./templates"
import type { CallParams } from "./wallet"
import type { LiveDeed } from "./live"

type Call = (p: CallParams) => Promise<string>

/** Buyer pays exactly the listed price; the escrow hands over the name or refunds. */
export const buy = (call: Call, d: LiveDeed) => {
  if (!d.listingRaw) throw new Error("This Deed is not for sale.")
  return call({
    receiverId: CONFIG.deed,
    method: "buy",
    args: { token_id: d.id, expected_price: d.listingRaw.price_yocto, listing_nonce: d.listingRaw.nonce },
    depositYocto: d.listingRaw.price_yocto,
    tgas: 300,
  })
}

/** Owner lists: the registry moves the name into the escrow (one transaction). */
export const list = (call: Call, d: LiveDeed, priceNear: string) =>
  call({
    receiverId: CONFIG.registry,
    method: "nft_transfer_call",
    args: { receiver_id: CONFIG.deed, token_id: d.id, msg: JSON.stringify({ price_yocto: nearToYocto(priceNear) }) },
    depositYocto: "1",
    tgas: 300,
  })

/** Seller takes the name back. */
export const cancel = (call: Call, d: LiveDeed) =>
  call({ receiverId: CONFIG.deed, method: "cancel", args: { token_id: d.id }, depositYocto: "1", tgas: 300 })

/** Anyone releases the seller's payment once the 5-minute safety window has passed. */
export const claim = (call: Call, d: LiveDeed) => {
  if (!d.latestSale) throw new Error("No sale to settle.")
  return call({ receiverId: CONFIG.deed, method: "claim_proceeds", args: { sale_id: d.latestSale.id }, tgas: 100 })
}

/** Owner switches the service on (or updates it) with the next version number. */
export const activate = (call: Call, d: LiveDeed, priceNear: string, runtimeId = CONFIG.root) =>
  call({
    receiverId: CONFIG.deed,
    method: "activate",
    args: {
      token_id: d.id,
      runtime_id: runtimeId,
      // Always the current Preflight config: runtimes serve only the fingerprint they run.
      config_hash: PREFLIGHT_CONFIG_HASH,
      price_yocto: nearToYocto(priceNear),
      version: Math.max(d.activation?.version ?? 0, d.maxVersion) + 1,
    },
    tgas: 100,
  })

/** Rents a name on the registry (the caller becomes its owner). Deposit = registry quote + 0.1 NEAR margin; extra is refunded by the registry. */
export const rent = (call: Call, label: string, totalYocto: string) =>
  call({
    receiverId: CONFIG.registry,
    method: "rent_sub_account",
    args: { tla_id: CONFIG.tla, name: label },
    depositYocto: (BigInt(totalYocto) + 10n ** 23n).toString(),
    tgas: 300,
  })

/** Switches Preflight on for a name the caller just rented (first version). */
export const activateNew = (call: Call, tokenId: string, priceNear: string, runtimeId = CONFIG.root) =>
  call({
    receiverId: CONFIG.deed,
    method: "activate",
    args: { token_id: tokenId, runtime_id: runtimeId, config_hash: PREFLIGHT_CONFIG_HASH, price_yocto: nearToYocto(priceNear), version: 1 },
    tgas: 100,
  })
