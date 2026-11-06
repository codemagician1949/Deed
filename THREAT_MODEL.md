# Deed: threat model for the transfer

> Written before any code, as the `nfts` track prompt asks. Status: **v4, 2026-11-05**, matching the deployed `deed` contract v3.
> History: v1 approved 2026-11-02. v2 (2026-11-03) added C7 and D6 and corrected C5 after external review. v3 (2026-11-04) added D7–D9 and the obligations table. v4 (2026-11-05) follows contract v3: job payments held on chain (D section rewritten), the seller paid in the sale transaction (the 5-minute window is gone), activations survive a listing, a per-name version high-water mark, transfers only after a successful payout re-point, and the runtime URL recorded in the activation.
> Every security sentence in the README or video must map to a row here **and** to a passing check. Source references are to `houseofstake/tla-contracts` @ `d85860a` (see `docs/SPIKE.md`).

## What is being sold
A Deed is a Top Level Account name (e.g. `preflight.bot`) held in `registry.hos`. It is three things at once:
1. a **NEP-171 token** (`registry.hos`, token id = the name),
2. a **real NEAR account** with no access keys, run by the audited `hos-wallet`,
3. a **paid service identity**: customers pay the `deed` contract for a job; the contract pays the name's own wallet once the runtime the *current* owner named delivers the answer.

## Actors
| Actor | Can do |
|---|---|
| **Seller (A)** | Current owner until the sale. Controls their own wallet, may run their own copy of the runtime, may hold old signatures, grants, configs. |
| **Buyer (B)** | Pays the price; becomes the owner. |
| **Deed runtime (R)** | Off-chain service named in the activation. Holds one function-call key that can only call `settle_job` and `refund_job` on `deed`. Never holds customers' money. |
| **`deed` contract (E)** | Our activation registry, sale escrow and job escrow. Owns the name while it's listed. |
| **House of Stake** (`registry.hos`, `ext.hos`) | Lease authority. Can reclaim expired names and run MPC recovery (watcher quorum + 72 h timelock). Trusted, and stated as trusted. On the deployed code (registry `bf0b65d`, extension `0925e0f`) nothing can undo a completed `transfer_sub_account`: the extension accepts `force_transfer` only from the registry, and `RotationCause::Revert` is used only to hand a token back when an `nft_transfer_call` receiver refuses it, inside the same transfer. (v1 wrongly said it "can revert the last rotation within 5 min".) |
| **Customers** | Pay per job through `deed.pay_job`. |

## The guarantee we claim (and nothing more)
After a sale:
- **G1:** A's spend grants and every extension A added are gone (hos-wallet `apply_rotation` L786 `spend_grants.clear()`, L795 `extensions.retain(authority)`).
- **G2:** A can no longer authorize anything as the name: NEP-641 `w_resolve_auth` panics `NOT_AN_OWNER` (L459–480).
- **G3:** NEAR the name earned while A held it went to A's payout account in the rotation steps (`sweep_to(outgoing)`): at listing, and again at the sale for money paid in while listed.
- **G4:** A's activation is gone: the contract dropped it at the sale, so jobs paid under it can't be settled to the name, and A can't activate again. The service answers again only after B activates.
- **G5:** B paid exactly the price; A received it minus the royalty **in the sale transaction**; if the transfer fails, B is refunded in full.

**Not claimed:** that A forgets anything. The prompt/config is public (hash on chain), so there is nothing secret to keep. The value is the name, the incoming payment stream and the verifiable track record.

## Attacks: every way the seller (or anyone) could keep value

### A. Keep control of the account
| # | Attack | What stops it | Proven by |
|---|---|---|---|
| A1 | A's agent/runtime keeps using its spend grant after the sale | `apply_rotation` clears all grants **and** removes the extension | real_fleet.rs `sale_on_real_hos_bytecode_locks_the_seller_out` (check A1); testnet tx rejected "not enabled" |
| A2 | A added a second "co-owner" extension before selling, to keep a back door | Same `retain(authority)`: every extension except the authority is removed, then only B is inserted | real_fleet.rs (check A2); testnet txs rejected "not enabled" (co-owner, and A itself) |
| A3 | A re-grants itself after the sale | `hos_grant_spend` is owner-only (L389, `UNAUTHORIZED`) | real_fleet.rs (check A3); testnet tx rejected |
| A4 | A signs in or approves actions as the name (NEP-641) | `w_resolve_auth` requires the owner ∈ extensions → `NOT_AN_OWNER` | real_fleet.rs (check A4); testnet view panics; re-read live by `verify/check-testnet.py` |
| A5 | A's spend grantee tries to pose as owner (any time, not only after a sale) | `w_resolve_auth` → `GRANTEE_NOT_OWNER`; grantees are never owners | real_fleet.rs (check A5); testnet view panics |
| A6 | A transfers the name a second time (double-sell) | `transfer_sub_account`/`nft_transfer` → `OnlyOwner`; A isn't the registry owner after listing | real_fleet.rs (check A6); testnet tx rejected; mock |
| A7 | A uses a signed tx/key on the account | The name has **zero access keys**; nothing can sign as it (`capabilities.rs: a_signed_request_is_refused_whoever_signs_it`) | real_fleet.rs (check A7, `view_access_key_list` empty); testnet state read |

### B. Keep or divert the money
| # | Attack | What stops it | Proven by |
|---|---|---|---|
| B1 | Earnings stay in the account and B gets them | Sale/Transfer rotation sweeps NEAR to the **outgoing** payout account before re-pointing it | real_fleet.rs (check B1); testnet balance read; the listing tx's `swept_near` event re-checked by `verify/check-testnet.py` (G3) |
| B2 | A points payout somewhere odd before selling | That's A's own money (their era). Payout is re-pointed to the new owner on rotation, so A can't redirect B's era | no dedicated test (House of Stake wallet behaviour) |
| B3 | **Payments while listed** would sweep to the escrow (listing makes E the owner and payout) | `buy` (and `cancel`, `recover_name`) first call `registry.set_payout_account(…, seller)`, and **only if that succeeds** start the transfer (v3: a callback checks the result; a plain `.then` would run the transfer after a failure and strand the sweep in E). If the re-point fails, B is refunded and the listing reopens | real_fleet.rs (check B3); escrow.rs `failed_payout_repoint_stops_the_sale_and_refunds_the_buyer` (mock forces the failure); testnet balance read |
| B4 | A parks USDC/wNEAR in the name to block or tax the sale | The **registry** refuses non-venue transfers of a name holding any allow-listed FT (`SubAccountHoldsTokens`), so `nft_transfer_call` into E fails and nothing is listed. E itself has no FT check. Deed earns in NEAR only | escrow.rs `ft_balance_blocks_listing` (mock registry only; not run on the real bytecode) |
| B5 | A drains earnings via the runtime's grant | Grant is capped: allow-listed receivers, budget, expiry; storage reserve protected (`capabilities.rs: spending_cannot_drain_the_storage_reserve`) | House of Stake's own tests, not Deed's |
| B6 | Front-running: A spends the balance just before listing | Allowed. It's A's money until the sale, and the title page shows the balance at listing time. Buyers price the stream and the record, not the balance | documented |

### C. Break the sale itself
| # | Attack | What stops it | Proven by |
|---|---|---|---|
| C1 | B pays, transfer to B fails | `buy` holds B's deposit; on failure the callback refunds B in full and reopens the listing | escrow.rs `forced_transfer_failure_refunds_buyer`; real_fleet.rs `failed_transfer_refunds_buyer_on_real_bytecode` (registry paused mid-sale) |
| C2 | B underpays / pays the wrong price | `buy` requires `attached_deposit == price` (exact) | escrow.rs `wrong_price_and_stale_listing_rejected` |
| C3 | A cancels while B's buy is in flight | `buy` locks the listing (state `Settling`) before the cross-contract calls; `cancel` requires state `Active` | enforced in code; no dedicated test (needs a cancel inside the same in-flight buy) |
| C4 | A delists, then lists again at a different price to bait B | B passes `expected_price` and `listing_nonce`; mismatch → reject | escrow.rs `wrong_price_and_stale_listing_rejected` |
| C5 | The name ends up back in the escrow after a sale (a future registry revert) | v3: the seller was already paid in the sale transaction (nothing can undo a completed transfer on today's code). If E holds a sold name unlisted, anyone can call `recover_name`, which returns it to that sale's buyer; nobody is refunded, so nobody ends up with both the money and the name | escrow.rs `name_reverted_to_escrow_after_sale_seller_still_paid_buyer_recovers_name` (mock revert) |
| C6 | Proceeds paid twice | v3 pays proceeds once, inside `on_buy_resolved`, which runs once per `buy`; the sale is recorded `Paid`. Since v3.3 there is no separate claim method at all (`claim_proceeds` was removed once every stored sale was settled; `final_after_ns` equals `sold_at_ns`) | escrow.rs `full_sale_seller_locked_out_and_paid_at_once` (sale `Paid`, `final_after_ns == sold_at_ns`). A failed royalty/proceeds transfer isn't retried (the amount stays in E) |
| C7 | **Free rental:** B uses the Deed, sends the name back to E with a plain transfer, hopes for a refund | There is nothing to refund: A was paid in the sale tx. `recover_name` hands the name back to B | **real House of Stake bytecode**: real_fleet.rs `buyer_returning_the_name_gets_no_refund_on_real_bytecode`; mock: escrow.rs `buyer_cannot_return_the_name_for_a_refund` |
| C8 | B resells to a third party right after buying, then someone tries to claw the name back through E | E only acts on names it holds; `recover_name` fails "doesn't hold this name"; A was paid at the sale | real_fleet.rs `onward_transfer_right_after_the_sale_on_real_bytecode` |
| C9 | A sells a name whose lease is about to end, so B pays for something House of Stake will soon reclaim | v3.2: `buy` reads the token first and, if its lease (`expires_at` in the NEP-177 metadata) ends within 30 days, refunds B in full and reopens the listing; nothing else moves | escrow.rs `buyer_refunded_when_the_lease_is_about_to_end` (mock registry reports a short lease); the real-bytecode sale tests pass the same check with a real lease |

### D. The service (sale in the middle of a payout), contract v3
**Rule (written before code, kept):** *a job belongs to the owner on whose watch it was paid.* Since v3 the contract enforces it:
- **Pay:** a customer calls `deed.pay_job(name, sha256(request))` with at least the activated price. E holds the money and records the job: payer, amount, the runtime, activation version and owner it was paid under, the request hash.
- **Serve:** R answers only if the job is pending, was paid to R, matches the exact request, and a fresh read shows that activation is still current and its owner still owns the name (or listed it). While a Deed is listed the seller's activation stays current, so the service keeps answering for them.
- **Settle:** R calls `settle_job`. E re-reads the registry owner: if the activation is unchanged and its owner still owns or listed the name, the payment goes **into the name's own wallet** (which the protocol sweeps to the owner of that era on the next rotation); otherwise E refunds the payer.
- **Refund:** R calls `refund_job` when it can't answer (model failure, wrong era). If R never acts, **anyone** can call `refund_job` once 15 minutes have passed. The money never passes through the operator.

| # | Attack | What stops it | Proven by |
|---|---|---|---|
| D1 | Sale lands between a job's payment and its delivery | The sale drops A's activation; `settle_job` then refunds the payer instead of paying the sold name. A job paid before the sale and sent to R after it is refunded without being answered | escrow.rs `sale_in_the_middle_of_a_paid_job_refunds_the_payer`; real_fleet.rs (check J2); runtime tests "D1"; testnet: J2 (settle after the sale → customer refunded) |
| D2 | A replays an old activation after the sale, or anyone reuses an old version | E records an activation only if the caller is the current owner (fresh `nft_token` read), and the version must exceed a per-name high-water mark that survives dropped activations | escrow.rs `activation_requires_current_owner`, `full_sale…` (buyer can't reuse v1); real_fleet.rs (check D2); testnet txs rejected ("only the current owner", "version must be greater than 6") |
| D3 | A runs its own runtime copy and keeps answering as the name | It can answer, but it can't collect: only the runtime named in the current activation can settle a job, and E pays the name, not the runtime. The activation records `runtime_url`, so clients refuse any other server (docs/CLIENTS.md) | escrow.rs `runtime_url_is_recorded_with_the_activation`; testnet: D8 (a stranger can't settle); the web Try page blocks paying through a runtime the activation doesn't name |
| D4 | Same payment used for two answers | Job id is E's; E settles or refunds a job once; R keeps a ledger and an in-flight guard | escrow.rs (`settle` twice fails "not pending"); runtime tests "D4" |
| D5 | RPC stale/down so R serves under the old owner | Fail closed: no fresh read → no answer, nothing recorded; and E re-checks the owner at settlement anyway | runtime tests "D5/D7" |
| D6 | **Payment theft:** someone uses another person's payment to ask their own question | The job is bound on chain to sha256 of one exact request; R refuses any other request for it | runtime test "the request must be the one whose hash was paid for" |
| D7 | Ownership changes between R's reads | R reads owner and activation twice; if anything moved it records nothing (503); E re-checks at settlement | runtime tests "D5/D7" |
| D8 | The operator keeps the money, never answers, or "refunds" with someone else's transfer | The money is never the operator's: E holds it. Only the named runtime can settle; R can refund at once; **anyone** can refund after 15 minutes. Refunds are on-chain transfers by E to the payer | escrow.rs `job_refunds_never_depend_on_the_operator`, `job_payment_is_held_then_settled_into_the_names_wallet`; testnet: D8 (stranger can't settle) |
| D9 | Crash mid-answer | On restart R refunds every job it had claimed but not answered; a failed settle/refund tx is retried; E's timeout covers the rest | runtime tests "crash", "settle tx fails", "refund tx fails" |
| D10 | The name is moved outside the escrow while its activation stays | E's settlement checks the registry owner: a stale activation earns nothing, the payer is refunded | escrow.rs `name_moved_outside_the_escrow_refunds_pending_jobs`; runtime test "the name moved outside the escrow" |

### E. Lies about the track record
| # | Attack | What stops it | Proven by |
|---|---|---|---|
| E1 | A inflates earnings with self-payments | Every payment and settlement links to its tx; payments from the team's own accounts are labelled "our demo". Self-payments from an unknown account can't be told apart from a real customer; the page says so | partial: the web app labels the team's `*.deedhq.testnet` accounts "our demo"; a recompute script is roadmap |
| E2 | Fake "served" results | Each served job carries NEAR AI's enclave signature over `<model>:<sha256 request>:<sha256 response>`; the signed request names the Deed, the on-chain job id, the runtime and the config, so an answer can't be passed off as another job's. Settlement records sha256 of the answer on chain | runtime/test/crypto-risk.test.ts "TEE signature check"; runtime test "the signed request names the Deed, the on-chain job, this runtime and the config" |

## Residual risks (stated plainly)
- House of Stake is a trusted authority: it can reclaim expired names and run recovery, and it could upgrade its contracts. Deed doesn't remove that trust.
- **On our testnet replica the team holds the authority roles** (`deedhq.testnet` is admin/council of the registry and extension). The seller-lockout guarantees come from the wallet code, which these roles can't change; but the replica's admin *could* move names through the registry's admin paths. On mainnet those roles belong to House of Stake. The live runs are evidence of the wallet's behaviour, not of the replica operator's honesty.
- **What a buyer gets, exactly:** the name, its wallet and future earnings, its public record, and the right to choose which runtime serves it. Not compute, an API key or a hosted runtime: today one operator (`deedhq.testnet`) runs Preflight. A buyer can run their own copy and name it (and its URL) in their activation.
- **Answers are authentic, not proven correct.** The runtime checks each answer's signer against NEAR AI's attestation report. Separately, `verify/check-testnet.py` (run daily in CI) fetches that report with a fresh nonce and verifies it independently: the Intel TDX quote through a public DCAP verifier (Phala's), whose report data must be the signing address plus our nonce, and the GPU evidence through NVIDIA's own attestation service. We rely on those two verifiers and on Intel's and NVIDIA's roots of trust. The runtime's own logic runs on an ordinary server, not in a TEE.
- A runtime can still answer badly and settle (it is paid for delivering, not for being right); customers judge it by its record.
- The resale royalty (2.5%) goes to `deedhq.testnet`, i.e. the team, fixed at contract init.
- The seller keeps knowledge (prompt, customer list). By design there's nothing secret in the config.
- Lease expiry: a name not renewed is reclaimable. The contract refuses (and refunds) a purchase with under 30 days of lease left (C9), and the title page and buy dialog show the lease end; after that, renewing is the buyer's job.
- Deed's own contract and runtime are **not audited**.

## Who owes what across a sale (contract v3)
| Job paid… | Answered? | Money ends up with |
|---|---|---|
| Before listing, settled before listing | Yes | The name's wallet, swept to the seller at listing |
| While listed, settled while listed | Yes | The name's wallet, swept to the seller at the sale (B3) |
| Before the sale, settled or sent after the sale | Only if already in progress | Refunded to the customer by the contract |
| After the sale, before the buyer activates | Impossible: `pay_job` requires an activation | — |
| After the buyer activates | By the buyer's runtime | The name's wallet, in the buyer's era |
| Any time, never settled | No | Refunded: by the runtime at once, or by anyone after 15 minutes |

## Decisions
1. ~~Seller proceeds are locked for 5 min after a sale.~~ Removed in contract v3: on deployed House of Stake code nothing can undo a completed transfer, so the window protected against nothing; the seller is paid in the sale transaction, and `recover_name` handles a name that ends up back in the escrow.
2. ~~Refunds are paid by the runtime operator.~~ Replaced in v3: job payments are held by the contract and refunded by it.
3. ~~Jobs paid under a new owner wait 24 h for activation.~~ Gone in v3: nothing can be paid for until the new owner activates.
4. A sale is final once the transfer completes: the seller is always paid; a returned name goes back to the buyer, never as a refund (C7).
