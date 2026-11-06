# Invariants: what is guaranteed, by whose code, proven where

Contract `deed` v3.2 (deployed on testnet as `deed.deedhq.testnet`, code hash `4TM4z2E1g4ssbjoHSX7qXv4TymBn2ppageBYEMT4wAqg`, built reproducibly from commit `1f28063` as its NEP-330 metadata states; `verify/rebuild-deed.sh` rebuilds it and compares). v3.1 added the `get_version_floor` view and v3.2 the lease check in `buy` (C9); the scripted live sale ran on v3 (`EaWvKKAavDRFFQrZhxscHVMwgLciSAqK533Jnumv3vnV`). Stored state is unchanged across these.

Legend for **Proven on**:
- **Real** = local NEAR sandbox running House of Stake's **mainnet bytecode** (hash-checked) + `deed` ([contract/deed/tests/real_fleet.rs](../contract/deed/tests/real_fleet.rs))
- **Testnet** = live run on NEAR testnet ([verify/testnet-sale.sh](../verify/testnet-sale.sh) → [report](../verify/report-testnet.json)), re-checked read-only by [verify/check-testnet.py](../verify/check-testnet.py): "tx" = a transaction whose outcome (and, for refusals, exact error) is checked on chain; "view" = a view call that panicked; "state" = a balance/state read
- **Mock** = `deed` against a test-only registry that lets us force failures the real contracts won't ([contract/deed/tests/escrow.rs](../contract/deed/tests/escrow.rs))
- **Unit** = runtime logic against an in-memory model of the v3 contract ([runtime/test](../runtime/test))

**Whose code:** `HoS` = House of Stake's audited contracts (we rely on them), `deed` = our contract (not audited), `runtime` = our off-chain service.

## Ownership and lockout (after a sale)

| # | Invariant | Whose code | Proven on | Limitation |
|---|---|---|---|---|
| G1/A1 | The seller's agent can't spend after the sale | HoS wallet `apply_rotation` | Real, Testnet (tx) | Relies on HoS wallet code staying as deployed |
| A2 | A co-owner extension the seller planted is removed; the seller can't act through the wallet either | HoS wallet | Real, Testnet (2 tx) | same |
| A3 | The seller can't re-grant themselves | HoS wallet `hos_grant_spend` owner-only | Real, Testnet (tx) | same |
| G2/A4 | The seller can't authorize as the name (NEP-641) | HoS wallet `w_resolve_auth` | Real, Testnet (view, re-read live) | Consumers must actually call `w_resolve_auth` |
| A5 | A spend grantee can never act as owner | HoS wallet | Real, Testnet (view) | same |
| A6 | The seller can't move the name again | HoS registry `OnlyOwner` | Real, Testnet (tx), Mock | — |
| A7 | No key can sign as the name | HoS registrar (keyless accounts) | Real, Testnet (state) | — |
| G4/D2 | Only the current owner can switch the service on; versions only increase, per name, across owners | deed `activate` → `nft_token` → `on_activate_owner`; `max_versions` high-water mark | Real, Testnet (2 tx: old owner refused; buyer reusing version 1 refused "greater than 6"), Mock | The owner read and the write are two receipts; a stale activation earns nothing because settlement re-checks the owner (D10) |

## Money (sale escrow)

| # | Invariant | Whose code | Proven on | Limitation |
|---|---|---|---|---|
| B1/G3 | Earnings in the name go to the seller when they list | HoS wallet sweep to outgoing payout | Real, Testnet (state + the listing's `swept_near` event) | Sweeps NEAR only |
| B3 | Money paid in while listed reaches the seller at the sale; if re-pointing payout fails, nothing moves | deed `buy` → `set_payout_account` → callback → transfer | Real, Testnet (state), Mock (forced payout failure) | — |
| B4 | A name holding allow-listed FTs can't be listed | HoS registry balance gate | Mock | Not run on real bytecode |
| G5/C2 | Buyer pays exactly the listed price | deed `buy` | Testnet (tx), Mock | — |
| G5 | Seller paid price minus royalty **in the sale transaction**; royalty to `royalty_account` | deed `on_buy_resolved` | Real, Testnet (state), Mock | A failed proceeds transfer isn't retried |
| C4 | Price/listing can't change under the buyer | deed `buy` (`expected_price`, `listing_nonce`) | Mock | — |
| C1 | Failed transfer → full refund, listing reopens | deed `on_buy_resolved` | Real (registry paused mid-sale), Mock | — |
| C5/C7 | A name back in the escrow after a sale returns to the buyer; nobody is refunded | deed `recover_name` | Real (C7), Mock (C5) | — |
| C8 | The escrow can't claw back a name it doesn't hold | deed `recover_name` | Real | — |
| C9 | A buyer gets at least 30 days of lease, or a full refund | deed `buy` → `nft_token` → `on_buy_lease_checked` | Mock (short lease refused, then sold), Real (sale passes with a real lease) | Names with no reported expiry are allowed |
| — | Royalty ≤ 10%, to the fixed `royalty_account` | deed `new` | Real, Mock | `royalty_account` is the team (`deedhq.testnet`) |

## Paid jobs (job escrow, contract v3)

| # | Invariant | Whose code | Proven on | Limitation |
|---|---|---|---|---|
| J1 | A job payment is held by the contract, then paid into the name's own wallet when the named runtime settles | deed `pay_job`, `settle_job` | Real, Testnet (tx + state), Mock | — |
| J3 | While listed, the seller's service keeps answering and its settlements reach the name | deed (activation kept at listing), runtime `servingOwner` | Testnet (tx + state), Unit | — |
| D1/J2 | A job paid before the sale is refunded on chain, never paid into the sold name | deed `on_settle_owner` / activation dropped at sale | Real, Testnet (tx + state), Mock, Unit | — |
| D10 | A stale activation (name moved outside the escrow) earns nothing | deed `on_settle_owner` owner re-check | Mock, Unit | — |
| D3/D8 | Only the runtime the job was paid to can settle it | deed `settle_job` | Testnet (tx: stranger refused), Mock | — |
| D8 | Refunds never depend on the operator: the runtime refunds at once, anyone after 15 minutes | deed `refund_job` | Mock | Timeout is 15 min on testnet |
| D4 | One job, one answer | deed state machine; runtime ledger + in-flight guard | Mock, Unit | — |
| D6 | A payment can only be used for the exact request it was bound to | deed `request_hash`; runtime check | Unit | — |
| D5/D7 | RPC trouble or a change between reads → refuse, record nothing | runtime | Unit | Two reads narrow the race; settlement re-checks on chain |
| D9 | A crash mid-answer leaves the job refunded, not stuck | runtime `recoverInterrupted`, `retryOnChain` | Unit | — |
| — | The runtime's key can only settle/refund jobs | NEAR function-call access key (`deploy/runtime-key.sh`) | Testnet (key on `deedhq.testnet`, methods `settle_job, refund_job`) | — |
| — | Answer bytes signed by an enclave key listed in NEAR AI's attestation report; the signed request names Deed, job, runtime, config | runtime `nearai.ts`, `tee.ts` | Unit; Testnet (answered jobs: hashes + signer + attested ✓); `check-testnet.py` §6 re-verifies the TDX quote (public DCAP verifier) and NVIDIA evidence (NVIDIA's service) with a fresh nonce | Relies on those verifiers and Intel/NVIDIA roots of trust; authentic ≠ correct |
| — | The verdict shown is never milder than the deterministic flags | runtime `verdict.ts`, web job card | Unit | — |
| — | Customers' transactions aren't public; the holder sees them after a signed sign-in checked on chain | runtime `public.ts`, `owner.ts` | Unit | A signed sign-in is accepted for 10 minutes |
