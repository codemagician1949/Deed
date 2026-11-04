# Deed: threat model for the transfer

> Written before any code, as the `nfts` track prompt asks. Status: **v3, 2026-11-04** (v1 approved 2026-11-02; v2 adds C7 and D6 and corrects C5 after external review; v3 adds D7–D9, serving while listed and the obligations table) (decisions below: proceeds lock, operator-funded refunds, 24 h activation timeout).
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
| **House of Stake** (`registry.hos`, `ext.hos`) | Lease authority. Can reclaim expired names and run MPC recovery (watcher quorum + 72 h timelock). Trusted, and stated as trusted. **Correction (v2, 2026-11-03):** v1 said it "can revert the last rotation within 5 min". On the deployed code (registry `bf0b65d`, extension `0925e0f`) nothing can undo a completed `transfer_sub_account`: the extension accepts `force_transfer` only from the registry, and the registry uses `RotationCause::Revert` in one place only, handing a token back when an `nft_transfer_call` receiver refuses it, inside the same transfer. The wallet's 5-min `REVERT_WINDOW_NS` bounds that path. |
| **Customers** | Pay per job. |

## The guarantee we claim (and nothing more)
After a sale (and the 5-minute settlement window, kept as insurance against future registry changes):
- **G1:** A's spend grants and every extension A added are gone (hos-wallet `apply_rotation` L786 `spend_grants.clear()`, L795 `extensions.retain(authority)`).
- **G2:** A can no longer authorize anything as the name: NEP-641 `w_resolve_auth` panics `NOT_AN_OWNER` (L459–480).
- **G3:** NEAR earned while A held the name went to A's payout account, exactly once, in the rotation step (`sweep_to(outgoing)`).
- **G4:** The runtime serves no new job for A's activation; it serves again only after B activates.
- **G5:** B paid exactly the price, and A received it; if the transfer fails, B is refunded.

**Not claimed:** that A forgets anything. The prompt/config is public (hash on chain), so there is nothing secret to keep. The value is the name, the incoming payment stream and the verifiable track record.

## Attacks: every way the seller (or anyone) could keep value

### A. Keep control of the account
| # | Attack | What stops it | Proven by |
|---|---|---|---|
| A1 | A's agent/runtime keeps using its spend grant after the sale | `apply_rotation` clears all grants **and** removes the extension | real_fleet.rs `sale_on_real_hos_bytecode_locks_the_seller_out` (check A1); testnet tx rejected |
| A2 | A added a second "co-owner" extension before selling, to keep a back door | Same `retain(authority)`: every extension except the authority is removed, then only B is inserted | real_fleet.rs `sale_on_real_hos_bytecode_locks_the_seller_out` (check A2); testnet tx rejected (2) |
| A3 | A re-grants itself after the sale | `hos_grant_spend` is owner-only (L389, `UNAUTHORIZED`) | real_fleet.rs `sale_on_real_hos_bytecode_locks_the_seller_out` (check A3); testnet tx rejected |
| A4 | A signs in or approves actions as the name (NEP-641) | `w_resolve_auth` requires the owner ∈ extensions → `NOT_AN_OWNER` | real_fleet.rs `sale_on_real_hos_bytecode_locks_the_seller_out` (check A4); testnet view panics |
| A5 | A's spend grantee tries to pose as owner | `w_resolve_auth` → `GRANTEE_NOT_OWNER`; grantees are never owners | real_fleet.rs `sale_on_real_hos_bytecode_locks_the_seller_out` (check A5); testnet view panics |
| A6 | A transfers the name a second time (double-sell) | `transfer_sub_account`/`nft_transfer` → `OnlyOwner`; A isn't the registry owner after listing | real_fleet.rs `sale_on_real_hos_bytecode_locks_the_seller_out` (check A6); testnet tx rejected; mock |
| A7 | A uses a signed tx/key on the account | The name has **zero access keys**; nothing can sign as it (`capabilities.rs: a_signed_request_is_refused_whoever_signs_it`) | real_fleet.rs `sale_on_real_hos_bytecode_locks_the_seller_out` (check A7) (`view_access_key_list` empty); testnet state |

### B. Keep or divert the money
| # | Attack | What stops it | Proven by |
|---|---|---|---|
| B1 | Earnings stay in the account and B gets them | Sale/Transfer rotation sweeps NEAR to the **outgoing** payout account before re-pointing it | real_fleet.rs `sale_on_real_hos_bytecode_locks_the_seller_out` (check B1); testnet balance read |
| B2 | A points payout somewhere odd before selling | That's A's own money (their era). Payout is re-pointed to the new owner on rotation, so A can't redirect B's era | no dedicated test (House of Stake wallet behaviour; the B1/B3 balance checks cover the seller's side only) |
| B3 | **Payments while listed** go to the escrow (listing re-points payout to E) | On receiving the name E calls `registry.hos.set_payout_account(tla, name, seller)` (owner-only, 1 yocto; the registry relays to the wallet's authority-only `hos_set_payout_account`). The runtime takes no jobs while the owner is E, and the web page shows "listed – not serving" | real_fleet.rs `sale_on_real_hos_bytecode_locks_the_seller_out` (check B3); testnet balance read |
| B4 | A parks USDC/wNEAR in the name to block or tax the sale | The registry blocks non-venue transfers with any allow-listed FT balance (`SubAccountHoldsTokens`). E's `list` rejects names with FT balance; A must `hos_sweep_ft` first. Deed earns in NEAR only | escrow.rs `ft_balance_blocks_listing` (mock only; not run on the real bytecode) |
| B5 | A drains earnings via the runtime's grant | Grant is capped: allow-listed receivers, budget, expiry; storage reserve protected (`capabilities.rs: spending_cannot_drain_the_storage_reserve`) | House of Stake's own tests, not Deed's |
| B6 | Front-running: A spends the balance just before listing | Allowed. It's A's money until the sale, and the title page shows the balance at listing time. Buyers price the stream and the record, not the balance | documented |

### C. Break the sale itself
| # | Attack | What stops it | Proven by |
|---|---|---|---|
| C1 | B pays, transfer to B fails | `buy` holds B's deposit; transfer + callback; on failure, refund B in full and keep the listing | escrow.rs `forced_transfer_failure_refunds_buyer`; real_fleet.rs `failed_transfer_refunds_buyer_on_real_bytecode` (registry paused mid-sale) |
| C2 | B underpays / pays the wrong price | `buy` requires `attached_deposit == price` (exact) | escrow.rs `wrong_price_and_stale_listing_rejected` |
| C3 | A cancels while B's buy is in flight | `buy` locks the listing (state `Settling`) before the cross-contract call; `cancel` fails while settling | enforced in code (`cancel` requires state `Active`); no dedicated test (needs a cancel inside the same in-flight buy) |
| C4 | A delists, then lists again at a different price to bait B | B passes `expected_price` and `listing_nonce`; mismatch → reject | escrow.rs `wrong_price_and_stale_listing_rejected` |
| C5 | The name ends up back in the escrow after a sale (a future registry revert) | The seller's payment unlocks after 5 min. At claim the seller is **always paid** (the transfer completed); if the escrow holds the name unlisted, it is recorded as the **buyer's** listing, and the buyer takes it back with `cancel`. Nobody ends up with both the money and the name. (v1 refunded the buyer here; see C7 for why that was wrong.) | escrow.rs `name_reverted_to_escrow_after_sale_seller_still_paid_buyer_recovers_name` (mock revert); testnet: early claim refused with "revert window still open" |
| C6 | Reentrancy / double-claim of proceeds | State change before the promise; proceeds zeroed before transfer; callback restores on failure | escrow.rs `full_sale…` (second claim fails "already settled") |
| C7 | **Free rental:** the buyer uses the Deed for the window, sends the name back to the escrow with a plain transfer, and hopes the claim treats it as a revert and refunds them | Fixed in v2 (found in review of v1, which would have refunded): the seller is always paid at claim; the returned name is recorded as the buyer's listing | **real House of Stake bytecode**: real_fleet.rs `buyer_returning_the_name_gets_no_refund_on_real_bytecode`; mock: escrow.rs `buyer_cannot_return_the_name_for_a_refund` |

### D. The service (sale in the middle of a payout)
**Rule (written before code):** *A job belongs to the owner on whose watch its payment landed.*
- **Accept:** the runtime accepts job `j` only if (1) payment `j` is final in the name account, and (2) a **fresh** owner read (no cache) equals the signer of the current activation.
- **Serve:** inference is off-chain and doesn't need the wallet, so an accepted job is **always delivered**, even if the name rotates mid-job. Its payment landed before the rotation, so it was swept to the seller; the seller was paid and the customer is served.
- **Refund:** if inference fails, the runtime refunds from its own operator account (not from the name), and the refund is recorded on the title page against the era the job belongs to.
- **While listed (v3):** the escrow holds the name, but the seller still owns the business: payments made while listed reach the seller at the sale (B3). So the runtime treats the seller of an *active* listing as the owner, and the seller's activation keeps serving until the sale or a cancel.
- **After rotation:** new payments are held unserved (status `awaiting_activation`) until B activates; B's activation serves them, and that money is already in B's era. If B doesn't activate within 24 h, the customer can request a refund from the runtime.

| # | Attack | What stops it | Proven by |
|---|---|---|---|
| D1 | Sale lands between a job's payment and its delivery | Rule above; scripted race | runtime/test/jobs.test.ts "D1: sale in the middle of a paid job" (5 tests) |
| D2 | A replays an old activation (NEP-641 blob) after the sale | Activation stores `{owner, version, nonce}`; E records it only if the signer is the current owner. The runtime checks `activation.owner == current owner` per job | escrow.rs `activation_requires_current_owner`; real_fleet.rs `sale_on_real_hos_bytecode_locks_the_seller_out` (check D2); testnet tx rejected; runtime tests "D2" |
| D3 | A runs its own runtime copy and keeps answering as the name | It can answer, but it can't receive payments into its own account under the name, can't sign as the name (A4), and its answers won't be on the title page (only R's TEE-signed results bound to the current activation are listed). Customers verify via the title page | no automated test; what clients must check is in [docs/CLIENTS.md](docs/CLIENTS.md) |
| D4 | Same payment used for two jobs | Job id = payment tx hash; ledger persisted; in-flight guard; second use refused | runtime tests "D4" + live testnet replay → 409 |
| D5 | RPC stale/down so the runtime serves under the old owner | Fail closed: no fresh owner read → no job, nothing recorded | runtime tests "D5" |
| D7 | **Ownership changes between the runtime's reads** (owner, activation and last rotation are separate RPC calls and may come from different blocks) | Before recording any decision, the runtime reads all three again; if anything moved, it records nothing and answers 503 (the payer resubmits the same payment) | runtime tests "inconsistent reads" (sale between reads; runtime switch between reads) |
| D8 | **Refund forgery or reuse**: the operator marks two jobs refunded with one transfer, or passes off an older transfer to the payer as a refund | A refund is recorded only for a successful transfer from the operator account to the payer, of at least the amount paid, made after the payment, and not already used for another job | runtime tests "refunds" (5 tests) |
| D9 | **Crash mid-answer**: the job is claimed (`processing`) and the runtime dies; replay protection would refuse a resubmission forever | On startup every `processing` job becomes `refund_due`. A payment checked but never written stays unused, so the payer can submit it again | runtime test "crash recovery" |
| D6 | **Payment theft:** someone sees a public payment tx and submits it first with their own question (found in external review of v1) | The payer signs each job with NEP-413 over `{Deed, payment tx, sha256(request)}`; the runtime verifies the signature and that the key is a full-access key of the paying account, before anything else | runtime tests "payer authentication (NEP-413)"; signature format cross-checked against `near message sign-nep413`; hosted runtime: impersonation → 401 |

### E. Lies about the track record
| # | Attack | What stops it | Proven by |
|---|---|---|---|
| E1 | A inflates earnings with self-payments | Every payment on the title page links to its tx, and payments from the team's own accounts are labelled "our demo". Self-payments from an unknown account can't be told apart from a real customer; the page says that a payer outside the team alone doesn't prove independent demand | partial: the web app labels payments from the team's `*.deedhq.testnet` accounts "our demo" and links every number to its tx; the recompute script is roadmap |
| E2 | Fake "served" results | Each served job carries the NEAR AI TEE signature (`<model>:<sha256 req>:<sha256 resp>`), verifiable by anyone | runtime/test/crypto-risk.test.ts "TEE signature check" (4 tests); each served job stores the request/response bytes and the signature |

## Residual risks (stated plainly)
- House of Stake is a trusted authority: it can reclaim expired names and run recovery, and it could upgrade its contracts. Deed doesn't remove that trust.
- **On our testnet replica the team holds the authority roles** (`deedhq.testnet` is admin/council of the registry and extension). The seller-lockout guarantees come from the wallet code, which these roles can't change; but the replica's admin *could* move names through the registry's admin paths. On mainnet those roles belong to House of Stake. The live attack runs are therefore evidence of the wallet's behaviour, not of the replica operator's honesty.
- **What a buyer gets, exactly:** the name, its wallet and incoming payments, its public record, and the right to choose which runtime serves it (the activation names a `runtime_id` and a config fingerprint). They do **not** get compute, an API key or a hosted runtime: today one operator (`deedhq.testnet`) runs Preflight. A buyer can run their own copy (`runtime/Dockerfile`, own `RUNTIME_ID` and NEAR AI key) and activate it; the old operator is then no longer the authorised runtime. An honest runtime refuses on its own; a dishonest one could keep answering, so clients must check the activation (see [docs/CLIENTS.md](docs/CLIENTS.md)). Refunds are owed by the runtime that accepted the job (an off-chain obligation of that operator), not by the Deed.
- The resale royalty (2.5%) goes to `deedhq.testnet`, i.e. the team, fixed at contract init.
- The seller keeps knowledge (prompt, customer list). By design there's nothing secret in the config.
- Off-chain runtime availability: if R is down, jobs wait. They aren't lost, and payments stay in the name.
- Lease expiry: a name not renewed is reclaimable. The title page shows `lease_until`.
- Mainnet-only TLA: tests run the real WASM in a sandbox, and the live demo runs on our testnet replica of the same bytecode (team decision: testnet only).

## Who owes what across a sale

Payments go to the name account; inference and refunds are the business of the runtime that accepted the job. The table says who owes each obligation, by when the payment landed.

| Payment landed… | Money ends up with | Job is served by | If it can't be served, refund owed by |
|---|---|---|---|
| Before listing, job accepted before listing | Seller (swept at listing) | The runtime that accepted it (always delivered, D1) | That runtime's operator |
| Before listing, submitted after listing | Seller (swept at listing) | Nobody: it predates the latest rotation | The runtime that the seller's activation named, which refuses it as `refund_due` |
| While listed (active listing) | Seller (re-pointed payout, B3) | The seller's activated runtime | That runtime's operator |
| While listed, submitted after the sale | Seller (B3) | Nobody: it predates the sale | The runtime that rejects it (`refund_due`) |
| After the sale, before the buyer activates | Buyer (it's in the buyer's era) | Held (`awaiting_activation`), then the buyer's activated runtime | The runtime holding it, after 24 h |
| After the buyer activates | Buyer | The buyer's activated runtime | That runtime's operator |

Refunds are an off-chain promise of a runtime operator, not something the contract escrows: Deed proves a refund happened (D8), not that one will. A customer who wants protection against a non-paying operator should only pay Deeds whose runtime operator they trust, or wait for on-chain job escrow (roadmap).

## Decisions (approved 2026-11-02)
1. Seller proceeds are locked for 5 min after a sale (C5). On today's House of Stake code nothing can undo a completed transfer, so this window protects against nothing yet; it is a margin in case a future registry version adds an undo.
2. Refunds (D) are paid by the runtime operator, not the name.
3. Jobs paid under a new owner wait up to 24 h for activation, then become refundable.
4. ~~A name with an unclaimed sale can't be relisted, so "owner is the escrow at claim time" can only mean a revert.~~ Wrong: the buyer can send it back with a plain transfer (C7). Since v2 the seller is always paid at claim.
