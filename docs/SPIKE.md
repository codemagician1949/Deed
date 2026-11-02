# Day-1 spike results (2026-11-02)

All read-only: mainnet RPC views, the public nearaccounts API, and the `houseofstake/tla-contracts` source at commit `d85860a`. Nothing was signed or spent.

## Gate 1: where TLA lives
| Question | Answer | How we know |
|---|---|---|
| Mainnet registry id | **`registry.hos`** | `nft_item_info` on `yuensid.agi` → `collection_id: "registry.hos"`; activity feed `account: "registry.hos"` |
| Lease authority (extension) | **`ext.hos`** | `hos_lease` on `yuensid.agi` → `authority: "ext.hos"` |
| Venue (sale settlement) | `intents.near` (only venue) | `registry.hos.get_venues` |
| FT allowlist | USDC (`17208628…33a1`), `wrap.near` | `get_ft_allowlist`, so holding either blocks a non-venue transfer |
| Paused? | **No** (`is_paused` → false). It was paused 2026-10-22 05:30 UTC by `tlaoperator.near`; no unpause event is indexed, but the view says it is live | `is_paused`, `/activity` |
| `deployment_readiness.ready` | `false` (only `metadata_set: false`); everything else true | view; cosmetic as far as we can tell |
| Testnet | **Not deployed** (`registry.hos.testnet` does not exist) | testnet RPC `view_account` |
| `preflight.bot` | **Available**, about 4.06 NEAR/yr (4.05 rent + 0.012 creation deposit) | `is_name_available`, `get_rent_price` |
| `wallet impl_version` | 7 | `hos_lease` |

**Consequence:** live demo on mainnet (real names, the human's OK needed). All automated tests run the **real audited WASM in a near-workspaces sandbox**, built from the tagged source. The repo ships a full sandbox "Fleet" harness (`integration/tests/common/mod.rs`) and grant tests (`integration/tests/capabilities.rs`: `a_granted_agent_moves_tokens_up_to_its_budget_and_no_further`, …). The build and run has not been done yet; the agent needs the human's permission to build and run that external code locally.

## Gate 3: what the wallet does on rotation (from source; sandbox proof pending)
`contracts/hos-wallet/src/lib.rs` at `d85860a`:
- `apply_rotation` L752–815: L786 `self.spend_grants.clear()`; L795 `self.wallet.extensions.retain(|held| *held == authority)`; then inserts the new owner; payout re-pointed when `cause.repoints_payout()`; sweep to the **outgoing payout account** when `cause.sweeps() && to != outgoing`.
- `w_resolve_auth` L459–480: panics `AUTHORITY_NOT_OWNER`, `GRANTEE_NOT_OWNER` (a spend grantee can never act as owner), or `NOT_AN_OWNER` (not in extensions).
- `hos_grant_spend` L389: owner only; extension ≠ owner, ≠ authority.
- `REVERT_WINDOW_NS` L51 = 5 min.

## Gate 4: transfer rules (`contracts/tla-registry/src/marketplace.rs`, `nft.rs`)
- `transfer_sub_account(tla_id, name, new_owner)`: **1 yocto**; the caller must be the current registry owner (`OnlyOwner`); `new_owner` ≠ the name itself; and, unless sent via a venue, `new_owner` **must not be another TLA name** (`TransferToRegisteredName`), registry not paused, name sellable (no reclaim/retraction, not a business sub).
- `nft_transfer` works too, but **approvals are not supported** (`ApprovalsNotSupported`), so an escrow can't be "approved". **The escrow has to own the name while it's listed.**
- A non-venue transfer first fan-out-checks `ft_balance_of` for every allow-listed FT; any balance → `SubAccountHoldsTokens`. So **earn in NEAR**, and sweep any FTs before listing.
- Rotation cause for a normal account is `Transfer` (sweeps + re-points payout).
- ⇒ A plain contract account (e.g. `deed.<team>.near`) can own a name and transfer it on: **escrow design passes**.

### Design consequence (new)
Listing = transfer to escrow ⇒ payout is re-pointed **to the escrow**. Anything paid into the name while it's listed would be swept to the escrow at sale. Fix: on receipt, the escrow calls `hos_set_payout_account(seller, expected_owner = escrow)` on the name's wallet (**VERIFY** that the caller path works for a contract owner), and the runtime refuses jobs while the owner is the escrow.

## Gate 5: payments
Not checked yet (PingPay x402 network support). Default: direct NEAR payment with a job memo plus a receipt check.

## Still to prove (needs the human's OK)
1. Build `tla-contracts` and run its sandbox tests locally (external code execution).
2. Our own sandbox test: grant → spend → transfer → old grantee's spend fails; `w_resolve_auth` with the seller panics `NOT_AN_OWNER`.
3. Mainnet: rent two names (about 4 NEAR/yr each for `*.bot` 9+ chars; cheaper TLAs exist).
