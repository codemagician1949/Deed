# Deed v3 — a NEAR name that is a working AI service you can own, prove and sell (track: `nfts`)

## New verified facts since v2 (read in the audited source, houseofstake/tla-contracts, contracts/hos-wallet/src/lib.rs `apply_rotation`, crates/hos-common RotationCause)
- On **every** ownership rotation (Sale, Transfer, Deposit, ReRent, Reclaim, Recovery) the audited `hos-wallet` itself runs `spend_grants.clear()` and `wallet.extensions.retain(|x| x == authority)` — **every agent spend grant and every extension (agent key/account) is deleted on-chain**, then the new owner is inserted and `rotation_seq` increments.
- On Sale/Transfer the payout account is **read before it is re-pointed**, and `sweep_to(outgoing)` sends the account's NEAR balance to the **seller** in the same step; payout then points to the buyer.
- `w_resolve_auth` (NEP-641) only resolves for an owner in `wallet.extensions`, never the lease authority, never a spend grantee → the seller can't authorize as the name after a sale.
- The lease authority can **revert** the last rotation within 5 minutes (pinned to the previous owner, no sweep) → a sale is "final" after that window.
- `tla-registry.transfer_sub_account` blocks transfers of names holding allow-listed FTs unless the sender is a registered venue.
- Live data (api.nearaccounts.com, 2026-11-02): only **79 names rented** system-wide; agent namespaces `.agi .bot .bots .assistant .agency .aide .ask` exist; resale listings already carry `"kind":"human"`.

## Precise claim (only what is enforced)
After a Deed sale: (1) the seller's agent permissions are gone — enforced by the audited wallet, proven by direct calls from the seller's own client; (2) the seller can't authorize as the name (NEP-641); (3) NEAR earnings settle to the seller automatically, payout re-points to the buyer; (4) the Deed service stops serving the seller and waits for the buyer's activation, then keeps earning into the same name. Not claimed: that the seller forgets what they knew — the service keeps nothing secret worth knowing (public config hash, no pasted third-party keys). Final after the 5-minute revert window.

## Scope (one template, one invariant, mostly enforced by audited code)
- Service: **"Preflight"** — agents/wallets pay a few cents in NEAR to the name account to get a plain-language explanation + risk flags for a NEAR transaction before signing, answered by a verifiable NEAR AI model (TEE-signed). Earn in NEAR so the protocol sweep settles earnings; USDC avoided because it blocks non-venue transfers.
- `deed` contract (Rust, small): activation registry (records `{name, runtime, config_hash, price, version}` only from the current owner) + **sale escrow**: seller moves the name into escrow (wallet clears grants + sweeps NEAR to seller), buyer `buy(name)` → escrow transfers name to buyer and pays seller in one promise chain, refund callback on failure.
- Runtime re-checks current owner per job (no cache) — defence in depth; the real lockout is on-chain.
- **Verifier (centerpiece)**: fresh-clone `bun run verify` executes a real sale and the attack matrix with direct RPC/contract calls (old grant spend, re-grant, NEP-641 as seller, stale activation replay, sale mid-paid-job, buyer pays/transfer fails, RPC down) → JSON report with tx hashes.
- Title page per Deed (holder lineage, earnings, sweeps, grants issued/revoked, TEE-signed jobs, attacks rejected) — evidence ledger with demo vs external payments labelled + recompute script. Gated owner console via NEP-641 ("sign in as preflight.bot"). THREAT_MODEL.md first.
- Day-1 falsification spike with decision gates (registry id, testnet availability, grant-cleared-on-transfer check on a real name, escrow ownership by a contract, x402 availability). Target 10–20 real external paid calls; a second Deed with a different ledger.
- Prior art named: ERC-6551, ERC-7857 (0G iNFT), Virtuals — on NEAR the NFT *is* the account and the audited wallet itself wipes agent permissions and settles the seller on transfer.

## Demo (90 s)
`preflight.bot` explains a risky tx for a paying agent (TEE-signed) → title page with real external earnings → buyer clicks Buy → split screen: on-chain events show grants cleared + NEAR swept to seller; the seller's client fires 5 attacks, each failing with its on-chain error; buyer activates; next paid answer lands in the same name under the new owner.
