# Deed: threat model for the transfer

> Written before any code, as the `nfts` track prompt asks. Status: **draft v1, 2026-11-02, awaiting team OK.**
> Every security sentence in the README or video must map to a row here **and** to a passing check in `verify/`. Source references are to `houseofstake/tla-contracts` @ `d85860a` (see `docs/SPIKE.md`).

## What is being sold
A Deed is a Top Level Account name (e.g. `preflight.bot`) held in `registry.hos`. It is three things at once:
1. a **NEP-171 token** (`registry.hos`, token id = the name),
2. a **real NEAR account** with no access keys, run by the audited `hos-wallet`,
3. a **paid service identity**: customers pay NEAR into the name with a job id; the Deed runtime serves the job only if the *current* owner activated it.

## Actors
| Actor | Can do |
|---|---|
| **Seller (A)** | Current owner until the sale. Controls their own wallet, may run their own copy of the runtime, may hold old signatures, grants, configs. |
| **Buyer (B)** | Pays the price; becomes the owner. |
| **Deed runtime (R)** | Off-chain service. Optionally an extension on the name with a capped spend grant. Not trusted with custody. |
| **`deed` contract (E)** | Our activation registry and sale escrow. Owns the name while it's listed. |
| **House of Stake** (`registry.hos`, `ext.hos`) | Lease authority. Can **revert the last rotation within 5 min** (`REVERT_WINDOW_NS`, hos-wallet L51), reclaim expired names, and run MPC recovery. Trusted, and stated as trusted. |
| **Customers** | Pay per job. |

## The guarantee we claim (and nothing more)
After a sale is final (revert window closed):
- **G1:** A's spend grants and every extension A added are gone (hos-wallet `apply_rotation` L786 `spend_grants.clear()`, L795 `extensions.retain(authority)`).
- **G2:** A can no longer authorize anything as the name: NEP-641 `w_resolve_auth` panics `NOT_AN_OWNER` (L459–480).
- **G3:** NEAR earned while A held the name went to A's payout account, exactly once, in the rotation step (`sweep_to(outgoing)`).
- **G4:** The runtime serves no new job for A's activation; it serves again only after B activates.
- **G5:** B paid exactly the price, and A received it; if the transfer fails, B is refunded.

**Not claimed:** that A forgets anything. The prompt/config is public (hash on chain), so there is nothing secret to keep. The value is the name, the incoming payment stream and the verifiable track record.

## Attacks: every way the seller (or anyone) could keep value

### A. Keep control of the account
| # | Attack | What stops it | Verifier check |
|---|---|---|---|
| A1 | A's agent/runtime keeps using its spend grant after the sale | `apply_rotation` clears all grants **and** removes the extension | `seller_grant_spend_fails`: A-controlled grantee calls spend after rotation → on-chain failure |
| A2 | A added a second "co-owner" extension before selling, to keep a back door | Same `retain(authority)`: every extension except the authority is removed, then only B is inserted | `seller_coowner_removed`: `hos_agent_status(A2).extension_enabled == false`; A2 action fails |
| A3 | A re-grants itself after the sale | `hos_grant_spend` is owner-only (L389, `UNAUTHORIZED`) | `seller_regrant_fails` |
| A4 | A signs in or approves actions as the name (NEP-641) | `w_resolve_auth` requires the owner ∈ extensions → `NOT_AN_OWNER` | `seller_resolve_auth_panics` |
| A5 | A's spend grantee tries to pose as owner | `w_resolve_auth` → `GRANTEE_NOT_OWNER`; grantees are never owners | `grantee_resolve_auth_panics` |
| A6 | A transfers the name a second time (double-sell) | `transfer_sub_account`/`nft_transfer` → `OnlyOwner`; A isn't the registry owner after listing | `seller_retransfer_fails` |
| A7 | A uses a signed tx/key on the account | The name has **zero access keys**; nothing can sign as it (`capabilities.rs: a_signed_request_is_refused_whoever_signs_it`) | `name_has_no_keys`: `view_access_key_list` is empty |

### B. Keep or divert the money
| # | Attack | What stops it | Verifier check |
|---|---|---|---|
| B1 | Earnings stay in the account and B gets them | Sale/Transfer rotation sweeps NEAR to the **outgoing** payout account before re-pointing it | `sweep_goes_to_seller`: balance assertions on both sides |
| B2 | A points payout somewhere odd before selling | That's A's own money (their era). Payout is re-pointed to the new owner on rotation, so A can't redirect B's era | `payout_repointed_to_buyer` |
| B3 | **Payments while listed** go to the escrow (listing re-points payout to E) | On receiving the name E sets `hos_set_payout_account(seller, expected_owner=E)`. The runtime takes no jobs while the owner is E, and the web page shows "listed – not serving". **VERIFY** the call path | `listed_payment_reaches_seller` |
| B4 | A parks USDC/wNEAR in the name to block or tax the sale | The registry blocks non-venue transfers with any allow-listed FT balance (`SubAccountHoldsTokens`). E's `list` rejects names with FT balance; A must `hos_sweep_ft` first. Deed earns in NEAR only | `ft_balance_blocks_listing` |
| B5 | A drains earnings via the runtime's grant | Grant is capped: allow-listed receivers, budget, expiry; storage reserve protected (`capabilities.rs: spending_cannot_drain_the_storage_reserve`) | `grant_budget_enforced` |
| B6 | Front-running: A spends the balance just before listing | Allowed. It's A's money until the sale, and the title page shows the balance at listing time. Buyers price the stream and the record, not the balance | documented |

### C. Break the sale itself
| # | Attack | What stops it | Verifier check |
|---|---|---|---|
| C1 | B pays, transfer to B fails | `buy` holds B's deposit; transfer + callback; on failure, refund B in full and keep the listing | `forced_transfer_failure_refunds_buyer` (sandbox: make B a registered name → `TransferToRegisteredName`) |
| C2 | B underpays / pays the wrong price | `buy` requires `attached_deposit == price` (exact) | `wrong_price_rejected` |
| C3 | A cancels while B's buy is in flight | `buy` locks the listing (state `Settling`) before the cross-contract call; `cancel` fails while settling | `cancel_during_settle_fails` |
| C4 | A delists, then lists again at a different price to bait B | B passes `expected_price` and `listing_nonce`; mismatch → reject | `stale_listing_rejected` |
| C5 | **HoS reverts the rotation within 5 min** | E pays A **after** the window: `claim_proceeds` checks `nft_item_info.owner_id == B` and that 5 min have passed. The UI marks a sale "final" only then. If reverted to E, B can `reclaim` the payment | `proceeds_locked_until_final`; revert itself is authority-only, so documented |
| C6 | Reentrancy / double-claim of proceeds | State change before the promise; proceeds zeroed before transfer; callback restores on failure | `double_claim_fails` |

### D. The service (sale in the middle of a payout)
**Rule (written before code):** *A job belongs to the owner on whose watch its payment landed.*
- **Accept:** the runtime accepts job `j` only if (1) payment `j` is final in the name account, and (2) a **fresh** owner read (no cache) equals the signer of the current activation.
- **Serve:** inference is off-chain and doesn't need the wallet, so an accepted job is **always delivered**, even if the name rotates mid-job. Its payment landed before the rotation, so it was swept to the seller; the seller was paid and the customer is served.
- **Refund:** if inference fails, the runtime refunds from its own operator account (not from the name), and the refund is recorded on the title page against the era the job belongs to.
- **After rotation:** new payments are held unserved (status `awaiting_activation`) until B activates; B's activation serves them, and that money is already in B's era. If B doesn't activate within 24 h, the customer can request a refund from the runtime.

| # | Attack | What stops it | Verifier check |
|---|---|---|---|
| D1 | Sale lands between a job's payment and its delivery | Rule above; scripted race | `sale_mid_job_completes_once` |
| D2 | A replays an old activation (NEP-641 blob) after the sale | Activation stores `{owner, version, nonce}`; E records it only if the signer is the current owner. The runtime checks `activation.owner == current owner` per job | `stale_activation_refused` |
| D3 | A runs its own runtime copy and keeps answering as the name | It can answer, but it can't receive payments into its own account under the name, can't sign as the name (A4), and its answers won't be on the title page (only R's TEE-signed results bound to the current activation are listed). Customers verify via the title page | `rogue_runtime_not_listed` (ledger check) |
| D4 | Same payment used for two jobs | Job id = payment receipt id; served-set is persisted; second use refused | `payment_replay_refused` |
| D5 | RPC stale/down so the runtime serves under the old owner | Fail closed: no fresh owner read → no job | `rpc_down_fails_closed` |

### E. Lies about the track record
| # | Attack | What stops it | Verifier check |
|---|---|---|---|
| E1 | A inflates earnings with self-payments | Ledger labels every payment `demo` / `external` by payer; self-payments from the owner or the owner's known accounts are flagged; every number links to a tx; `recompute` reproduces it from chain | `ledger_recompute_matches` |
| E2 | Fake "served" results | Each served job carries the NEAR AI TEE signature (`<model>:<sha256 req>:<sha256 resp>`), verifiable by anyone | `tee_signatures_verify` |

## Residual risks (stated plainly)
- House of Stake is a trusted authority: it can revert within 5 min, reclaim expired names, and run recovery. Deed doesn't remove that trust; it waits out the revert window.
- The seller keeps knowledge (prompt, customer list). By design there's nothing secret in the config.
- Off-chain runtime availability: if R is down, jobs wait. They aren't lost, and payments stay in the name.
- Lease expiry: a name not renewed is reclaimable. The title page shows `lease_until`.
- Mainnet-only TLA: tests run the real WASM in a sandbox; the live demo is a small mainnet run.

## Open decisions for the team
1. The proceeds lock for C5 (pay the seller after 5 min) vs paying immediately. **Proposed: lock.**
2. Who funds refunds (D): the runtime operator (proposed) vs a small refund reserve grant on the name.
3. The 24 h activation timeout for jobs paid under the new owner.
