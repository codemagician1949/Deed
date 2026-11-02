# Research notes — verified facts (2026-11-02)

Everything here was checked against source code or a live endpoint on 2026-11-02. Re-verify anything marked **VERIFY** before relying on it.

## 1. Top Level Accounts (TLA) — House of Stake
- Repo: https://github.com/houseofstake/tla-contracts (tags `valhalla-2026-08`, `-2`, `-3`). README: "Deployed on NEAR mainnet. Audited by Valhalla Security, and every finding in their report has been fixed." Each release tag records commit + code hash of every deployed contract.
- Product: https://nearaccounts.com — docs https://docs.nearaccounts.com (pages: concepts, get-started, marketplace, open-tla-names, pricing-fees, recovery*, architecture, status).
- The official `nfts` track prompt (docs/TRACK-nfts.md) points at TLA and the sharded NFT items draft, and says: "There's no SDK yet — you build on the contracts directly, which are live and audited on mainnet."

### Contracts
| Contract | Role |
|---|---|
| `hos-wallet` | Wallet every leased name runs; published once as a global contract (NEP-591) |
| `registrar` | Creates leased names under a TLA, initialises the wallet |
| `tla-registry` | Lease ledger + NEP-171 collection (NEP-177 metadata, NEP-181 enumeration, NEP-297 events): rental, renewal, pricing, reclaim, business TLAs, transfers |
| `hos-extension` | Executes lease updates, transfers, sweeps for the registry (accepts `force_transfer` only from the registry) |
| `mpc-recovery` | Recovery via watcher quorum + 72 h timelock |
Authority flows `tla-registry → hos-extension → hos-wallet`. A rented account has **zero access keys**; it "cannot add/delete keys, delete itself, deploy a contract, or do validator actions". The owner sends a tx from an account they control and calls the rented account's wallet; the wallet checks caller, extension membership, lease state and freeze state, then runs the supported action with the rented account as predecessor. "Nothing signs on behalf of the rented account." House of Stake pays gas for supported actions.

### `hos-wallet` (contracts/hos-wallet/src/lib.rs) — methods we use
- `hos_grant_spend(extension, receivers: Vec<AccountId>, budget_yocto: U128, tokens: Vec<TokenAllowance>, items: Vec<ItemAllowance>, expires_at: U64)` — **1 yocto**, owner only, renter active; extension must already be in `wallet.extensions`, ≠ owner, ≠ authority; receivers non-empty; expiry in future. Re-granting raises ceilings without clearing `spent`; revoking resets the meter.
- `hos_revoke_spend(extension)` (1 yocto, owner), `hos_spend_grant(extension)`, `hos_agent_status(extension) → {extension_enabled, grant, state, frozen, lease_until_ns, reserve_yocto, impl_version}`.
- `w_resolve_auth(path, authorization)` — **NEP-641**. Always delegates: the blob names an `owner`; it must not be the lease authority, must not be a spend grantee, must be in `wallet.extensions`; returns `{payload, pending:[{account_id: owner, authorization, expect: payload}]}`. "The lease authority is never an eligible owner, so House of Stake cannot prove ownership of a renter's account." `path` is unread.
- `hos_lease()`, `nft_item_info()` (sharded-item spec `sharded-item-1.0.0`), `hos_payout_account()`, `hos_set_payout_account(payout_account, expected_owner)`, `hos_freeze/unfreeze`, `hos_sweep_near`, `hos_sweep_ft(ft, amount)`, `hos_transfer_ownership(to, cause, asked_by)` (authority only).
- Constants: `IMPL_VERSION = 7`, `RENTER_BUFFER = 0.005 NEAR`, `REVERT_WINDOW_NS = 5 min`.

### ★ What happens on an ownership change (`apply_rotation`, lib.rs ~L752–815) — the load-bearing fact
On every rotation (Sale, Transfer, Deposit, ReRent, Reclaim, Recovery):
1. `self.spend_grants.clear()` — **every agent spend grant is deleted on-chain**.
2. `self.wallet.extensions.retain(|held| *held == authority)` — **every extension (agent key/account) is removed**; only the lease authority stays; then the new owner is inserted.
3. `rotation_seq += 1`.
4. For Sale/Transfer/Reclaim/Recovery/Revert: payout account re-pointed to the new owner. "The payout account is read before it is repointed, so the balance goes to the holder giving the name up."
5. For Sale/Transfer/Deposit/ReRent/Reclaim: `sweep_to(outgoing payout)` — the account's NEAR balance is swept to the **seller's** payout account in the same step (Revert/Recovery don't sweep).
6. A 5-minute **Revert** window lets the authority undo the immediately preceding rotation (pinned to the previous owner; no sweep). **Our UX must treat a sale as final only after the revert window closes.**
⇒ "The seller's old agent grant stops working after the sale" is enforced **by the audited wallet contract itself**, not by our runtime. Our harness proves it with direct on-chain calls.

### `tla-registry` transfers (contracts/tla-registry/src/marketplace.rs)
- `transfer_sub_account(tla_id, name, new_owner)` (payable). If the sender is a registered **venue**, dispatches immediately. Otherwise it first queries `ft_balance_of(sub_account)` on every token in `ft_allowlist`; any non-zero balance → `TransferBlockedByBalance` / `SubAccountHoldsTokens`. So **a name holding allow-listed FTs (e.g. USDC) can only be transferred via a venue** — otherwise sweep FTs first (`hos_sweep_ft`).
- Views: `get_tla`, `get_sub_account`, `get_rent_price`, `is_name_available`, `list_tlas`, `list_sub_accounts(_by_owner|_by_tla)`, `list_recent_activity`, `get_fee_config`, `get_stats`, `get_venues`, `get_ft_allowlist`, `get_sweepable_tokens`, `deployment_readiness`.
- **VERIFY day 1**: the mainnet `tla-registry` account id (docs say "read them from the active environment configuration"; not published). Ways: `nft_item_info` on a rented name returns the collection id; or the nearaccounts.com bundle/config.

### Live data (api.nearaccounts.com, public)
- `GET /health` → ok. `GET /stats` → `{"tlaCount":502,"subAccountCount":79, ...}` on 2026-11-02 → the system is **very early: 79 rented names in total**.
- `GET /tlas?limit=&offset=` — TLAs incl. agent-themed ones: `agi` (21 names rented), `bot`, `bots`, `assistant`, `assist`, `agency`, `aide`, `ask`, `autonomy`, `bazaar`, `beacon`… Snapshot: docs/tlas-snapshot-2026-11-02.json.
- `GET /listings?limit=&offset=` — resale listings carry **`"kind":"human"`** (e.g. `yuensid.agi` listed for 100 NEAR) → the marketplace already distinguishes human vs (presumably) agent accounts. The app has an `/agents` page and `agents/:account` route.
- Other routes seen in the frontend: `/activity`, `/sync`, `/book/*` (buy/withdraw/deposit/onramp), `/tx/transfer`, `/tx/claim-name`, `/wallet/*`.
- Pricing: by full-name length tier (≤5, 6, 7–8, ≥9 chars incl. dot) × namespace multiplier (Legendary 5×, Premium 3×, Standard 1.5×, Community none); +0.01 NEAR creation deposit on first rental; 2-week grace after expiry; then reclaimable (NEAR/supported FTs go to the saved payout address).
- Marketplace resale "settles through NEAR Intents, not a TLA marketplace contract"; **Intents settlement is mainnet-only**. Purchases currently NEAR-only. Fast-auth "coming soon". Meteor wallet integration "coming soon".
- **VERIFY day 1**: is TLA deployed on **testnet** (the app has a `VITE_NEAR_NETWORK` testnet/mainnet switch)? If not, the cheapest path is mainnet with real, cheap names (Community/Standard, long names → tier 4).

## 2. NEP-641 Offchain Authorizations — Final (merged 2026-08-12)
- File: docs/nep-0641.md. `w_resolve_auth(path, authorization) -> { payload, pending }`; invalid → panic; recursive caller-side resolution through `pending`; signable envelope `OffchainMessage {chain_id, signer_id, path, timestamp, payload}`; standard full-access-key authorization on top of NEP-413.
- Use cases: dApp sign-in without access keys; off-chain action approval. A verifier can run the contract WASM locally against fetched state (fast-near).
- NEP-654 (open): non-normative clarifications from a second implementation.

## 3. Sharded NFT Items draft (House of Stake, 2026-08/09)
- File: docs/sharded-nft-items-draft.md. Items that are accounts; one view `nft_item_info`; consumer pairs it with the collection's `nft_token` and refuses unless they agree. Named items rely on the namespace rule (only `example.near` can create `alice.example.near`). NEP-616 deterministic ids cover derived items.

## 4. Other NEAR facts in play
- NEAR AI Cloud: `https://cloud-api.near.ai/v1` (OpenAI-compatible). Verifiable (TEE-signed) models e.g. `z-ai/glm-5.3`, `z-ai/glm-5.3-flash` ($0.08/$0.50 per M tokens), `moonshotai/kimi-k3`. Signature: `GET /v1/signature/<chat_id>?signing_algo=ecdsa`; text `<model>:<sha256 req>:<sha256 resp>`; send `x-no-aliasing: true`. Reasoning models: `reasoning_effort: "low"` or the 4k output cap is eaten by reasoning.
- x402 on NEAR: PingPay Agent Pay facilitator — https://pingpay.gitbook.io/docs/pingpay-api/agent-pay-facilitator (**VERIFY** network support, testnet availability, settlement asset).
- NEAR Intents Agent API: https://docs.agentsonintents.com/integration/agent-api/overview (agent accounts acting within owner-signed rules).
- nearcore 2.13 (Jul 2026, mainnet): gas keys (NEP-611), ML-DSA-65 keys. 2.14 (Oct 26 2026; testnet protocol 88, mainnet voting 86→88): `ml_dsa_verify`, sha3 host fns, universal `0u` accounts. Not needed for Deed — don't add PQ framing.

## 5. Prior art to name and differentiate (judges will ask)
- **ERC-6551** token-bound accounts (NFT points at a separate smart wallet), **ERC-7857 "iNFT"** (0G: agent NFT with encrypted metadata re-encrypted on transfer via TEE/oracle), **Virtuals Protocol** (speculative tokens per agent, not the operating business), Flippa/Acquire (web2 business sales, trust-based).
- Deed's difference: on NEAR the NFT **is** the account (name + wallet + earnings), and the audited wallet **itself** wipes agent permissions and settles the balance to the seller on transfer. Deed adds the service entitlement, evidence ledger and an adversarial verifier on top.
