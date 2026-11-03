# Deed: evidence

The detailed evidence behind the [README](../README.md). Every guarantee, whose code enforces it and where it's proven: [INVARIANTS.md](INVARIANTS.md). Threat model: [../THREAT_MODEL.md](../THREAT_MODEL.md). Free re-check of everything on this page against the chain: `python3 verify/check-testnet.py`.

## Live sale on testnet: results

Run of [verify/testnet-sale.sh](../verify/testnet-sale.sh) on **2026-11-03 03:01 UTC**, name `preflight.deedbot.deedhq.testnet` (seller `maya.deedhq.testnet`, buyer `kofi.deedhq.testnet`, price 1 NEAR). Result: **ALL PASS**: 9/9 attack attempts rejected with the expected error. Seven were **transactions** (each linked, with the attacking account and method; the chain rejected the receipt), two were **view calls** that panicked (NEP-641 sign-in), and the rest are **state reads** (owner, balances, keys). This is one scripted, team-run scenario: a bounded test, not proof that every transfer is secure. Raw report: [verify/report-testnet.json](../verify/report-testnet.json). Earlier runs are kept unedited in [verify/runs/](../verify/runs/) (run 2 had one failing row, an outdated B3 check written for the pre-fix payout design; the contract behaved correctly). Attack tx hashes are looked up on chain by [verify/backfill-tx.py](../verify/backfill-tx.py), because near-cli-rs prints no tx id for failed transactions.

| Row | Step | Kind | Result (on-chain error for attacks) | Verdict | Transaction |
|---|---|---|---|---|---|
| setup | The seller adds their AI agent as an extension | transaction | ok | PASS | [`CR2yYG8N…`](https://testnet.nearblocks.io/txns/CR2yYG8NELe4Zw5rEUe8Gt3rV2rFZ3B1o5B5VvdYtFC) |
| setup | The seller adds a second co-owner (a hidden back door) | transaction | ok | PASS | [`2bPkGQER…`](https://testnet.nearblocks.io/txns/2bPkGQEREMwtAJgbXXHFieaTWMk3qeTxF9XmzWJx8zAL) |
| setup | The seller grants their agent a capped spend (0.1 NEAR, to the seller only) | transaction | ok | PASS | [`2s6frdSD…`](https://testnet.nearblocks.io/txns/2s6frdSDCUoB3a3cLfMS2jvuZqkK9FbHF5eVDM1RXo1A) |
| earn | A customer pays 0.1 NEAR into the name | transaction | ok | PASS | [`Hai8ysgG…`](https://testnet.nearblocks.io/txns/Hai8ysgGZwx1Z1rqYYXVVjmy88Dg1GfM9Dx8EndfKaNe) |
| pre | The seller's agent spends within its grant | transaction | ok | PASS | [`1dEFEs4u…`](https://testnet.nearblocks.io/txns/1dEFEs4u8ChF4zT2yKaw5uUUPBMr6jTwjDUv7S9HXZu) |
| pre | The seller can sign in as the name (NEP-641) | view call | ok | PASS | — |
| A5 | The seller's agent tries to sign in as the name | view call | **blocked**: `panicked: a spend grantee cannot authorise as an owner` | PASS | — |
| list | The seller lists: the name moves into the escrow | transaction | ok | PASS | [`BT5WAwu6…`](https://testnet.nearblocks.io/txns/BT5WAwu65umMzL14mMhFwF2WWuNToJXghk9wUmCWRhH3) |
| B1 | The seller's earnings swept to the seller at listing (+0.0859 NEAR net of fees) | state read | ok | PASS | — |
| earn | A customer pays 0.1 NEAR into the name while it is listed | transaction | ok | PASS | [`EdBuBTeh…`](https://testnet.nearblocks.io/txns/EdBuBTehdz5XFPTfxSwREMNNBuUzfPTMk9ZCTpDWgvSV) |
| buy | The buyer pays exactly the price; the escrow hands them the name | transaction | ok | PASS | [`EnpYudm2…`](https://testnet.nearblocks.io/txns/EnpYudm2JJWHz5oeNrzj5yDfNChfcdJ3Pub6tbpfL7Uh) |
| G5 | Registry says the buyer (kofi.deedhq.testnet) owns the name | state read | ok | PASS | — |
| B3 | Money paid in while listed reached the seller at the sale (+0.1016 NEAR) | state read | ok | PASS | — |
| A1 | The seller's agent tries to spend (`maya-agent.deedhq.testnet` → `w_execute_extension`) | transaction | **blocked**: `panicked: extension 'maya-agent.deedhq.testnet' is not enabled` | PASS | [`HxNQgNef…`](https://testnet.nearblocks.io/txns/HxNQgNef9XyLeq6Wi4rmTz4tXwiFgid697tW7a6Z6u9F) |
| A2 | The seller's hidden co-owner tries to move money (`maya-partner.deedhq.testnet` → `w_execute_extension`) | transaction | **blocked**: `panicked: extension 'maya-partner.deedhq.testnet' is not enabled` | PASS | [`5rAnst8X…`](https://testnet.nearblocks.io/txns/5rAnst8XaY5w9ZLP2M7ym2gS141SVcAYfNK5XnPgkC9o) |
| A2 | The seller tries to move money themselves (`maya.deedhq.testnet` → `w_execute_extension`) | transaction | **blocked**: `panicked: extension 'maya.deedhq.testnet' is not enabled` | PASS | [`89D4CpB6…`](https://testnet.nearblocks.io/txns/89D4CpB6nXxGK7aQkm799oTfg4134fjqn2feUJjMmLTK) |
| A3 | The seller tries to re-grant their agent (`maya.deedhq.testnet` → `hos_grant_spend`) | transaction | **blocked**: `panicked: only the owner may perform this operation` | PASS | [`5swvNdij…`](https://testnet.nearblocks.io/txns/5swvNdijTS51fyYop4ZEAL1zvpEpgePkBpyN4EU5a3ze) |
| A4 | The seller tries to sign in as the name | view call | **blocked**: `panicked: named account is not an owner of this account` | PASS | — |
| A4 | The buyer can sign in as the name | view call | ok | PASS | — |
| A6 | The seller tries to sell the name again (`maya.deedhq.testnet` → `transfer_sub_account`) | transaction | **blocked**: `panicked: {"code":"only_owner"}` | PASS | [`7KmgmY3P…`](https://testnet.nearblocks.io/txns/7KmgmY3PfLgtxw61iS43TDHG1NMpBaj6yB2Up1FARxWG) |
| A7 | The name has 0 access keys: nobody can sign as it | state read | ok | PASS | — |
| D2 | The seller tries to switch the service back on (`maya.deedhq.testnet` → `activate`) | transaction | **blocked**: `panicked: only the current owner of the name can activate it` | PASS | [`3igFiWEA…`](https://testnet.nearblocks.io/txns/3igFiWEAS5quztSSq1uxud6ujiYFtgQinabT5wWRV2va) |
| G1 | hos_agent_status: agent disabled, grant gone | state read | ok | PASS | — |
| D2 | The buyer activates the service under their name | transaction | ok | PASS | [`7WHhr3Fm…`](https://testnet.nearblocks.io/txns/7WHhr3Fmao4V5nompXivtBcJkdHHjA1ucFb4mT9xx32o) |
| C5 | The seller tries to take the money inside the 5-minute window (`maya.deedhq.testnet` → `claim_proceeds`) | transaction | **blocked**: `panicked: revert window still open; try again after final_after_ns` | PASS | [`2RsMf89f…`](https://testnet.nearblocks.io/txns/2RsMf89ffbBBhaiWAajNzotdqdxNyyCNq3R8tPR5oJMe) |
| C5 | After the window, anyone triggers payment | transaction | ok | PASS | [`BuMALMxS…`](https://testnet.nearblocks.io/txns/BuMALMxSwuxXdormWXUSJye8nMBvUF7fvUH2kazbLupp) |
| G5 | The seller received exactly price minus 2.5% royalty (0.975 NEAR) | state read | ok | PASS | — |

### Live Preflight jobs (NEAR testnet)

Real payments of 0.05 NEAR from `maya.deedhq.testnet` to the Deed, answered by the runtime ([ledger snapshot](../verify/preflight-jobs-testnet.json); also on the Deed page's **Jobs answered** tab). "attested" = the recovered signer is listed in NEAR AI's attestation report for `z-ai/glm-5.3-flash` (Intel TDX quote + NVIDIA evidence).

| Payment | Transaction asked about (high-risk flags) | Accepted under | Result | Enclave signature |
|---|---|---|---|---|
| [`A1HG8Q8e…`](https://testnet.nearblocks.io/txns/A1HG8Q8en19mEquvX4ABVMUUhoYXDeAfgnFRppzNqjfp) | moves_assets, value | v2 under `kofi.deedhq.testnet` | refunded ([`BQnX4x4H…`](https://testnet.nearblocks.io/txns/BQnX4x4HAz6Qo9wNuc2K8Ru6V2E5a4JGxwaE4vgYuyqA)): no API key yet | — |
| [`G9CCLRZP…`](https://testnet.nearblocks.io/txns/G9CCLRZPtasZUVK1f2hdrhdMhK4A8b6uMCn2jzU7dQ5G) | full_access_key | v3 under `kofi.deedhq.testnet` | refunded ([`FQeA19mC…`](https://testnet.nearblocks.io/txns/FQeA19mCU87x9GLxXxyRturT8sGLJDTm64ZHnMdkiYrM)): no API key yet | — |
| [`ELo6ZUbG…`](https://testnet.nearblocks.io/txns/ELo6ZUbGs9QejdnCiyWqVtd6XJfMh557ziWXxM8ZRYtm) | unlimited_approval | v3 under `kofi.deedhq.testnet` | answered: **DO NOT SIGN** | hashes ✓ · signer ✓ |
| [`CNffZWAF…`](https://testnet.nearblocks.io/txns/CNffZWAFngGdasRtVULuWAa8pa9N1xJjVK8xKzYTvYu6) | full_access_key | v3 under `kofi.deedhq.testnet` | answered: **CHECK FIRST** | hashes ✓ · signer ✓ · attested ✓ |

---

## Testing strategy

Contract and sale: three layers, each closer to reality (the runtime adds a fourth, [runtime/test](../runtime/test/): 26 tests with in-memory chain and model fakes so every ordering of "payment / sale / activation / answer" can be forced):

1. **Mock registry** ([escrow.rs](../contract/deed/tests/escrow.rs)): fast, and lets us force what real contracts won't (transfer failure, a name reverted to the escrow, FT-blocked listing).
2. **Mainnet bytecode in a sandbox** ([real_fleet.rs](../contract/deed/tests/real_fleet.rs)): deploys the whole House of Stake fleet from the exact mainnet `.wasm` (hash-asserted), the same way [deploy/testnet.sh](../deploy/testnet.sh) does, rents a name, adds an agent and a hidden co-owner, sells, then attacks from the seller's side. Uses the real **300 Tgas** transaction cap.
3. **Live testnet** ([verify/testnet-sale.sh](../verify/testnet-sale.sh)): the same sale and attacks as real transactions; each attack must fail with its expected error; results go to [verify/report-testnet.json](../verify/report-testnet.json) and the `/proof` page.

---

## Bugs our tests caught

- **Payment theft (D6), found in external review.** The runtime trusted `{payment_tx, sender}` from the caller, so anyone who saw a public payment could submit it first with their own question. Each job is now signed by the payer (NEP-413) and checked against the payer's on-chain keys.
- **Free rental (C7), found while answering review.** v1's `claim_proceeds` treated "the escrow owns the name again" as a House of Stake revert and refunded the buyer, but a buyer could create that state by sending the name back. Reading House of Stake's code showed no admin undo exists for a completed transfer, so the seller is now always paid; the case is tested on the real bytecode.

- **Two processes, one ledger.** The refund tool recorded a refund while the runtime server held an older in-memory copy of the job ledger that it would have written back. The store now re-reads the file on every operation and writes atomically.
- **Listing ran out of gas on testnet.** The first version re-pointed payout inside `nft_on_transfer`. The registry gives that hook a fixed 25 Tgas; the payout call needs about 45, so the receipt failed and the registry correctly returned the name to the seller. The sandbox didn't catch it because it allows more gas per transaction. Fix: the hook only records state; `buy`/`cancel` re-point payout before the transfer. The sandbox test now uses the 300 Tgas cap. (Commit: "fix: re-point payout in buy/cancel…")
- **Verifier false positives.** An early verifier counted any failure as "attack blocked". It now requires the expected error text, and stops if the sale itself didn't happen.
