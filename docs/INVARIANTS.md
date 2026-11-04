# Invariants: what is guaranteed, by whose code, proven where

Legend for **Proven on**:
- **Real** = local NEAR sandbox running House of Stake's **mainnet bytecode** (hash-checked) + `deed` ([contract/deed/tests/real_fleet.rs](../contract/deed/tests/real_fleet.rs))
- **Testnet** = live run on NEAR testnet ([verify/testnet-sale.sh](../verify/testnet-sale.sh) → [report](../verify/report-testnet.json)); "tx" rows are transactions whose receipts failed, "view" rows are view calls that panicked, "state" rows are balance/state reads
- **Mock** = `deed` against a test-only registry stand-in that lets us force failures the real contracts won't ([contract/deed/tests/escrow.rs](../contract/deed/tests/escrow.rs))
- **Unit** = runtime logic with in-memory chain/model fakes ([runtime/test](../runtime/test))

**Whose code:** `HoS` = House of Stake's audited contracts (not ours; we rely on them), `deed` = our contract, `runtime` = our off-chain service.

## Ownership and lockout (after a sale)

| # | Invariant | Whose code | Proven on | Limitation |
|---|---|---|---|---|
| G1/A1 | The seller's agent can't spend after the sale | HoS wallet `apply_rotation` clears grants + extensions | Real, Testnet (tx) | Relies on HoS wallet code staying as deployed |
| A2 | A co-owner key the seller planted is removed | HoS wallet | Real, Testnet (tx) | same |
| A3 | The seller can't re-grant themselves | HoS wallet `hos_grant_spend` owner-only | Real, Testnet (tx) | same |
| G2/A4 | The seller can't authorize as the name (NEP-641) | HoS wallet `w_resolve_auth` | Real, Testnet (view) | View-level check; consumers must actually call `w_resolve_auth` |
| A5 | A spend grantee can never act as owner | HoS wallet | Real, Testnet (view) | same |
| A6 | The seller can't move the name again | HoS registry `OnlyOwner` | Real, Testnet (tx), Mock | — |
| A7 | No key can sign as the name | HoS registrar (keyless accounts) | Real, Testnet (state) | — |
| G4/D2 | Only the current owner can switch the service on; versions only increase | deed `activate` → `nft_token` view → `on_activate_owner` callback | Real, Testnet (tx), Mock | **Asynchronous:** the owner read and the write are two receipts, so ownership can change in between. A stale activation is harmless because the runtime serves only if `activation.owner == current owner` on every job (D2 row below). |

## Money (escrow)

| # | Invariant | Whose code | Proven on | Limitation |
|---|---|---|---|---|
| B1 | Earnings in the name go to the seller when they list | HoS wallet sweep to outgoing payout | Real, Testnet (state) | Sweeps NEAR only; FT balances block the listing (B4) |
| B3 | Money paid in while listed reaches the seller at the sale | deed `buy` re-points payout to seller before transfer | Real, Testnet (state) | If `set_payout_account` fails, the transfer still runs and that money sweeps to the escrow (no recovery path yet) |
| B4 | A name holding allow-listed FTs can't be listed | HoS registry balance gate | Mock | Not run on real bytecode (needs an allow-listed FT on the replica) |
| G5/C2 | Buyer pays exactly the listed price | deed `buy` | Testnet (tx), Mock | — |
| C4 | Price/listing can't change under the buyer | deed `buy` (`expected_price`, `listing_nonce`) | Mock | — |
| C1 | Failed transfer → full refund, listing reopens | deed `on_buy_resolved` | **Real** (registry paused mid-sale), Mock | — |
| C5 | Seller paid after 5 min; if the name is back in escrow, it's the buyer's to take back | deed `claim_proceeds` / `on_claim_owner` | Testnet (early claim refused; payout after window), Mock (revert) | On deployed HoS code a completed transfer can't be undone; the window is insurance |
| C7 | Buyer can't return the name for a refund | deed `on_claim_owner` | **Real**, Mock | — |
| C8 | Buyer resells before the seller's payment is released → seller still paid, third party keeps the name | deed `on_claim_owner` | **Real** | — |
| C6 | Proceeds can't be claimed twice | deed state before promise | Mock | Royalty transfer failure isn't retried (funds would stay in the escrow) |
| — | Royalty ≤ 10%, paid to the fixed `royalty_account` | deed `new`, `on_claim_owner` | Real, Mock | `royalty_account` is the team (`deedhq.testnet`) |

## Paid jobs (runtime)

| # | Invariant | Whose code | Proven on | Limitation |
|---|---|---|---|---|
| D6 | Only the payer can use a payment, for the request they signed (NEP-413) | runtime `submitJob` + `nep413.ts` | Unit; Testnet (hosted runtime: impersonation → 401); format cross-checked with `near message sign-nep413` | — |
| D4 | One payment = one job, including simultaneous submissions and across restarts | runtime ledger on disk (Railway volume) + in-flight guard | Unit (incl. restart with a fresh store on the same file); Testnet (hosted: replay → 409 after redeploys) | **Single runtime instance.** Two instances with separate ledgers could each accept the same payment once; run one instance per ledger (Railway runs one) |
| D2 | Served only if current owner = activation owner, activation names this runtime and this config | runtime `isEntitled` | Unit; Testnet (jobs accepted under the current activation only: v3, then v4 after the config change) | — |
| D1 | Sold mid-job: delivered once, both owners recorded; paid before a sale → refund | runtime `submitJob` / `serve` | Unit | Not reproduced live (needs a sale timed inside an inference call) |
| D5 | RPC trouble → refuse, record nothing | runtime | Unit | — |
| D7 | Ownership/activation changing between reads → refuse, record nothing | runtime `stillSame` re-read | Unit | Two reads narrow the race, they don't remove it: a change after the second read is handled like a sale mid-job (D1) |
| D8 | One refund tx settles one job; only a transfer from the operator to the payer, after the payment, counts | runtime `recordRefund` | Unit | — |
| D9 | A crash mid-answer leaves the job refundable, never stuck | runtime `recoverInterrupted` at startup | Unit | — |
| — | The verdict shown is never milder than the deterministic flags (a high flag → DO NOT SIGN) | runtime `verdict.ts`, web job card | Unit | The model's signed text can still say something milder; the raise is shown next to it |
| — | Listed Deed keeps serving the seller | runtime `servingOwner` (active listing's seller) | Unit | — |
| — | Answer bytes signed by the attested enclave | runtime `nearai.ts`, `tee.ts` | Testnet (4 answered jobs; hashes + signer ✓, attested ✓ on the last 3) | Signed inference + **provider-reported** attestation. We don't independently verify the Intel TDX/NVIDIA quote chain, and the runtime's own logic (owner checks, ledger) runs outside any TEE. |
| — | Refunds are real and verified | runtime `refunds.ts` + `/v1/jobs/:id/refund` checks the tx on chain | Testnet (4 refunds) | An off-chain obligation of the operator who ran the job |
