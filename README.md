# Deed

**Deed turns a NEAR name into an AI service you can own, prove and sell.** The name (for example `preflight.deedbot.deedhq.testnet`) is at the same time an NEP-171 NFT, a real NEAR account with its own wallet, and the identity of a paid service. When a Deed is sold, the wallet's own audited code wipes every permission the seller or the seller's AI agents had, and settles the seller's earnings to them in the same step. Deed adds the activation registry, the sale escrow, the public track record and a verifier that attacks every sale from the seller's side.

- **Track:** `nfts` (NFTs That Do Something), NEAR HACKATHON 2026
- **Network:** NEAR **testnet** (contracts deployed and live, see [Live deployment](#live-deployment-near-testnet))
- **License:** MIT ([LICENSE](LICENSE))

---

## Contents
1. [The problem](#the-problem)
2. [What is real today](#what-is-real-today)
3. [Try it: do X → see Y](#try-it-do-x--see-y)
4. [How it works](#how-it-works)
5. [The exact security claim](#the-exact-security-claim)
6. [Threat model and proof](#threat-model-and-proof)
7. [Live deployment (NEAR testnet)](#live-deployment-near-testnet)
8. [Live sale on testnet: results](#live-sale-on-testnet-results)
9. [Contract reference](#contract-reference)
10. [Web app](#web-app)
11. [Repository layout](#repository-layout)
12. [NEAR features used (with file paths)](#near-features-used-with-file-paths)
13. [Testing strategy](#testing-strategy)
14. [Bugs our tests caught](#bugs-our-tests-caught)
15. [Prior art and what is different](#prior-art-and-what-is-different)
16. [Roadmap (not built yet)](#roadmap-not-built-yet)
17. [Libraries, AI-written code and baseline](#libraries-ai-written-code-and-baseline)
18. [Team and other submissions](#team-and-other-submissions)

---

## The problem

Selling an online business today (a bot, an API, an AI agent) means trusting the seller to hand over every password, API key and payout setting, and trusting that they kept no copy. On other chains, "agent NFTs" point at a separate wallet (ERC-6551) or rely on an oracle to re-encrypt secrets on transfer (ERC-7857), so control still depends on someone behaving.

The organizers' `nfts` prompt ([docs/TRACK-nfts.md](docs/TRACK-nfts.md)) asks for exactly this: an NFT that carries its own wallet, where "whoever holds the NFT controls that sub-account", with a written explanation of "what stops the old owner from keeping access", a gated holder page, a per-NFT history, and tests "for the transfer path, including a sale in the middle of a payout", plus a threat model written first.

On NEAR, Top Level Accounts (House of Stake) already make the NFT **be** the account: a rented name is a NEP-171 token and a keyless account run by the audited `hos-wallet`. Deed puts a paying service inside that account and makes the sale safe and provable.

---

## What is real today

| Part | Status | Where |
|---|---|---|
| Threat model, written before code (25 attacks) | **Done** | [THREAT_MODEL.md](THREAT_MODEL.md) |
| `deed` contract: owner-checked activation, sale escrow, refund on failure, 5-min proceeds lock, capped royalty, NEP-297 events | **Done, deployed on testnet** | [contract/deed/src/lib.rs](contract/deed/src/lib.rs) |
| Sale tested against the **exact House of Stake bytecode that runs on mainnet** (hash-checked), 19 checks | **Passing** | [contract/deed/tests/real_fleet.rs](contract/deed/tests/real_fleet.rs) |
| Escrow edge cases (forced transfer failure, House of Stake revert, wrong price, stale listing, FT-blocked listing, double claim), 9 tests | **Passing** | [contract/deed/tests/escrow.rs](contract/deed/tests/escrow.rs) |
| House of Stake TLA replica on testnet from mainnet bytecode (all code hashes equal mainnet) | **Live** | [deploy/testnet.json](deploy/testnet.json) |
| A real Deed on testnet, sold live, with the seller's attacks run on-chain | **Done** (see [results](#live-sale-on-testnet-results)) | [verify/testnet-sale.sh](verify/testnet-sale.sh), [verify/report-testnet.json](verify/report-testnet.json) |
| Web app on **live testnet data**: browse, per-Deed title page with full on-chain history (owners, payments, sweeps, wiped permissions, blocked misuse attempts, each with a tx link), safety-proof page with the live report | **Done** | [web/src/lib/live.ts](web/src/lib/live.ts), [web/src/pages/deed.tsx](web/src/pages/deed.tsx) |
| NEAR wallet (NEAR Connect, testnet): buy, list, cancel, release the seller's payment, switch the service on; owner console that opens only for the current registry owner | **Built** (same contract calls as the live verifier; a signed in-browser run needs a person with a testnet wallet) | [web/src/lib/wallet.tsx](web/src/lib/wallet.tsx), [web/src/lib/actions.ts](web/src/lib/actions.ts) |
| The "Preflight" AI service (NEAR AI verifiable inference, paid per job) | **Not yet** (see [Roadmap](#roadmap-not-built-yet)) | n/a |

Nothing in this README claims more than the tests show. Every security sentence maps to a threat-model row and a check.

---

## Try it: do X → see Y

### 0. Prerequisites
- Rust **1.97** with `wasm32-unknown-unknown` (`rustup target add wasm32-unknown-unknown`)
- `cargo-near` **0.22** (`cargo install cargo-near`)
- `bun` **1.4+** (web app), `curl`, `jq`, `python3`
- Optional, for testnet: `near-cli-rs` **0.30** (`cargo install near-cli-rs`)

```bash
git clone https://github.com/codemagician1949/Deed && cd Deed
```

### 1. Run every contract test (no account, no network spend)
```bash
contract/test.sh
```
It downloads House of Stake's mainnet bytecode once (read-only RPC; [deploy/fetch-mainnet-wasm.sh](deploy/fetch-mainnet-wasm.sh)), builds `deed`, and runs three suites in a local NEAR sandbox. **You will see:**
```
test result: ok. 3 passed   (unit)
test result: ok. 9 passed   (escrow edge cases, mock registry)
test result: ok. 1 passed   (full sale on mainnet bytecode)
```
To see each of the 19 checks of the real-bytecode sale:
```bash
cd contract && cargo test -p deed --test real_fleet -- --nocapture
```
**You will see** lines such as:
```
PASS A1   Kofi's agent cannot spend after the sale
PASS A2   Kofi's hidden co-owner cannot act after the sale
PASS A3   Kofi cannot re-grant himself spending
PASS A4   Kofi cannot sign in as the name (NOT_AN_OWNER)
PASS A6   Kofi cannot sell the name again
PASS A7   the name has no access keys anyone could sign with
PASS D2   Kofi cannot switch the service back on
PASS B3   money paid in while listed went to Kofi at the sale
PASS G5   Kofi receives the price minus royalty
All checks ran against mainnet bytecode: ["tla_registry", "hos_extension", "registrar", "hos_wallet", "wallet_impl_deployer", "mpc_recovery"]
```
The test refuses to run if any `.wasm` hash differs from mainnet.

### 2. Look at the live testnet deployment (read-only, no wallet)
```bash
RPC=https://rpc.testnet.fastnear.com
view() { curl -s $RPC -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$(printf '%s' "$3" | base64)\"}}" | python3 -c 'import sys,json;print(bytes(json.load(sys.stdin)["result"]["result"]).decode())'; }

view registry.deedhq.testnet nft_token '{"token_id":"preflight.deedbot.deedhq.testnet"}'   # who owns the Deed (NEP-171)
view preflight.deedbot.deedhq.testnet nft_item_info '{}'                                   # the account IS the NFT (sharded-item spec)
view deed.deedhq.testnet get_activation '{"token_id":"preflight.deedbot.deedhq.testnet"}'  # who switched the service on
view deed.deedhq.testnet get_latest_sale '{"token_id":"preflight.deedbot.deedhq.testnet"}' # the sale record
view preflight.deedbot.deedhq.testnet w_extensions '{}'                                    # who can act for the account
```
**You will see** the buyer of the latest live sale (see `buyer` in `get_latest_sale`) as the NFT owner, as the only entry in `w_extensions` besides the lease authority `ext.deedhq.testnet`, and as the signer of the newest activation. The seller appears in none of them.

### 3. Run the web app
```bash
cd web && bun install && bun run dev
```
Open http://localhost:5173. Every page reads **NEAR testnet** directly (RPC for contract state, the FastNEAR transaction API for history; no backend). **You will see:**
- `/`: what a Deed is, live totals, and **"Watch a sale"**: an 8-step animation of a sale (name moves, seller's keys break, earnings settle, 5-min safety window, buyer switches it on).
- `/market`: every Deed in the registry (`nft_tokens`), with filters and search.
- `/deed/preflight.deedbot.deedhq.testnet`: the title page. Status, owner, price, and a **History** built from every transaction that touched the name: both live sales, each earnings sweep, each permission wipe, the royalty, and every blocked misuse attempt with the wallet's own error text; each line links to the transaction. Tabs for owners (with what was paid in during each holding), earnings, and on-chain facts (balance, payout account, lease, code hashes). **Buy** sends the real `buy` transaction from your wallet; after a sale, a countdown shows when the seller's payment can be released.
- `/proof`: **the live testnet run** (each step with its transaction link), then every attack as a card.
- `/console`: locked until you connect. With a NEAR testnet wallet that owns a Deed you can switch the service on, change its price, list it or cancel a listing. Without a wallet, *Or look around as an owner* opens a read-only preview of an owner's real view (it can't sign).

Production build: `bun run build` (type-check + Vite build, output in `web/dist`).

### 4. Re-run the live sale on testnet (needs testnet NEAR)
```bash
ROOT=<your-account>.testnet deploy/testnet.sh        # deploy your own replica (~65 testnet NEAR, mostly the 433 KB global wallet code)
ROOT=<your-account>.testnet deploy/seed-testnet.sh   # demo seller + buyer, rent a name, activate
ROOT=<your-account>.testnet verify/testnet-sale.sh   # sale + attack matrix → verify/report-testnet.json
```
Every script is safe to re-run and skips finished steps. The verifier only counts an attack as blocked if it fails **for the expected reason** (an error-message match), not for any failure.

---

## How it works

```
                  ┌─────────────── one NEAR account ───────────────┐
 preflight.deedbot.deedhq.testnet
                  │  NEP-171 token in registry  (who owns it)       │
                  │  hos-wallet, zero access keys (who can act)     │
                  │  NEAR balance = the service's earnings          │
                  └─────────────────────────────────────────────────┘
                                   ▲             ▲
           activation (deed contract)            sale escrow (deed contract)
```

1. **Rent.** A name is rented from the registry. The registrar creates the account, runs the global `hos-wallet` code on it, and installs **no access keys**. Only extensions listed in the wallet (the owner, the lease authority, and any agents the owner adds) can act, by calling the wallet.
2. **Activate.** The owner calls `deed.activate(token_id, runtime_id, config_hash, price, version)`. The contract reads `nft_token` from the registry **in the same transaction** and records the activation only if the caller is the current owner. `config_hash` is a public fingerprint of the service settings (nothing secret).
3. **Run and earn.** The owner can add an AI agent as a wallet extension and give it a capped `hos_grant_spend` (allow-listed receivers, budget, expiry). Customers pay NEAR into the name.
4. **List.** The seller calls `registry.nft_transfer_call(receiver_id = deed contract, msg = {"price_yocto": "…"})`. The name rotates into the escrow; on that rotation the wallet **clears all spend grants, removes every extension, and sweeps the NEAR balance to the seller's payout account**. The escrow records the listing and deletes the seller's activation. (TLA has no NFT approvals, so the escrow must own the name while it's listed.)
5. **Buy.** The buyer calls `deed.buy(token_id, expected_price, listing_nonce)` with exactly the price. The escrow first points the name's payout at the seller (so anything paid in while it was listed is swept to the seller), then calls `registry.transfer_sub_account(…, buyer)`. If the transfer fails, the buyer is refunded in full in the callback and the listing reopens.
6. **Settle.** House of Stake can revert the last rotation for 5 minutes. The seller's proceeds unlock only after that: anyone calls `claim_proceeds(sale_id)`; the contract re-reads the owner. If the buyer owns it, the seller is paid (price minus royalty, royalty to the template creator). If the escrow owns it again (a revert happened), the buyer is refunded and the listing is restored for the seller.
7. **Switch on.** The buyer activates with a higher version. The service answers again, earning into the same name.

Sequence of the sale (real calls):
```
seller ──nft_transfer_call──▶ registry ──force_transfer──▶ ext ──hos_transfer_ownership──▶ wallet
                                                                (clear grants, remove extensions, sweep → seller)
        registry ──nft_on_transfer──▶ deed   (record listing; returns false = keep)
buyer  ──buy(price)──▶ deed ──set_payout_account(seller)──▶ registry ──▶ ext ──▶ wallet
                            ──transfer_sub_account(buyer)──▶ registry ──▶ ext ──▶ wallet (rotation #2, sweep → seller)
                            ──on_buy_resolved──▶ deed   (Sale{Pending, final_after = now + 5 min}) or refund
anyone ──claim_proceeds──▶ deed ──nft_token──▶ registry ──on_claim_owner──▶ pay seller + royalty | refund buyer
```

---

## The exact security claim

After a sale is final (the 5-minute revert window has closed):

| | Claim | Enforced by |
|---|---|---|
| G1 | The seller's spend grants and every extension the seller added are gone. | `hos-wallet` `apply_rotation`: `spend_grants.clear()` and `extensions.retain(authority)` (audited House of Stake code) |
| G2 | The seller can no longer authorize anything as the name (NEP-641). | `hos-wallet` `w_resolve_auth` panics "named account is not an owner of this account" |
| G3 | NEAR earned while the seller held it went to the seller, once, during the rotation. | `hos-wallet` sweep to the outgoing payout account; `deed.buy` re-points payout to the seller before the sale rotation |
| G4 | The service will not run under the seller's activation. | `deed.activate` requires the current registry owner; listing deletes the old activation |
| G5 | The buyer paid exactly the price; the seller received it minus royalty; on failure the buyer is refunded. | `deed.buy` / `on_buy_resolved` / `claim_proceeds` |

**Not claimed:** that the seller forgets what they knew. The design keeps nothing secret worth knowing: the service config is public (fingerprint on chain), and no third-party API keys live in the Deed. What is sold is the name, the incoming payment stream and the verifiable track record.

**Residual risks (stated plainly):** House of Stake is a trusted lease authority (it can revert within 5 minutes, reclaim expired names, run recovery; on our testnet replica the recovery watchers are random keys nobody holds). An off-chain runtime can be down (payments wait in the account). An unrenewed lease can be reclaimed (the title page shows `lease_until`).

---

## Threat model and proof

Full model with actors and decisions: [THREAT_MODEL.md](THREAT_MODEL.md). "Sandbox" = local NEAR sandbox running the **mainnet** House of Stake bytecode; "testnet" = live run on NEAR testnet.

| Row | Attack (seller or anyone) | What stops it | Proven in |
|---|---|---|---|
| A1 | Seller's AI agent spends with its old grant | wallet clears grants and removes the extension on rotation | sandbox + testnet |
| A2 | Seller planted a second "co-owner" extension as a back door | same rotation removes every extension except the authority | sandbox + testnet |
| A3 | Seller re-grants itself | `hos_grant_spend` is owner-only | sandbox + testnet |
| A4 | Seller signs in / authorizes as the name (NEP-641) | `w_resolve_auth` requires the owner to be an extension | sandbox + testnet |
| A5 | A spend grantee poses as owner | `w_resolve_auth`: "a spend grantee cannot authorise as an owner" | sandbox + testnet |
| A6 | Seller sells the name twice | registry `transfer_sub_account` is owner-only | sandbox + testnet + mock |
| A7 | Seller uses a key on the account | the account has zero access keys | sandbox + testnet |
| B1 | Earnings stay in the account for the buyer | rotation sweeps to the outgoing payout (seller) | sandbox + testnet |
| B3 | Payments made while listed go to the escrow | `buy`/`cancel` re-point payout to the seller before the rotation | sandbox + testnet |
| B4 | Seller parks FTs to block the sale | registry refuses non-venue transfers of names holding allow-listed FTs; Deed earns in NEAR | mock |
| C1 | Buyer pays, transfer fails | refund in `on_buy_resolved`, listing reopens | mock (forced failure) |
| C2 | Underpayment | exact-price check | mock |
| C4 | Price changed mid-purchase | `expected_price` + `listing_nonce` pinning | mock |
| C5 | Sale reverted after the seller is paid | proceeds locked for the 5-min window; revert → buyer refunded, listing restored | testnet (lock + payout after window) + mock (revert path) |
| C6 | Double claim of proceeds | state change before transfer | mock |
| D2 | Seller re-activates the service / replays an old activation | live owner check + strictly increasing version | sandbox + testnet + mock |

"Mock" tests use [contract/mock-registry](contract/mock-registry/src/lib.rs), a test-only stand-in that mirrors the registry rules Deed depends on (documented in its header), so we can force failures and a House of Stake revert, which the real contracts don't let a test trigger.

---

## Live deployment (NEAR testnet)

Top Level Accounts has **no House of Stake deployment on testnet**. To stay on testnet we deployed a **replica from the exact mainnet bytecode** under team-owned accounts. It is **not** House of Stake's deployment. Code hashes (base58 sha256) are identical to mainnet:

| Testnet account | Role | Code hash | Mainnet counterpart |
|---|---|---|---|
| `registry.deedhq.testnet` | TLA registry, NEP-171 collection | `DVMYAu7exGKWQdngmtvUDC4rvBfZzSK1kt1AkzaewsPY` | `registry.hos` (same hash) |
| `ext.deedhq.testnet` | lease authority (`hos-extension`) | `3rkMpK42jVjrqi9kukVCbUyeX1bqqAa4AJ6gvSdtL6Zz` | `ext.hos` (same) |
| `impl.deedhq.testnet` | global `hos-wallet` code (NEP-591) | `6d1FsQEpwVpgxALg4kCffXX45qujTL41bQSpWEHFoQ4o` | `impl.hos` (same) |
| `deedbot.deedhq.testnet` | registrar for our TLA | `DavYBFdXPsa9qa6QEyiaUxodV6pax2y8Sp3XoriCNj3t` | mainnet registrar (same) |
| `rec.deedhq.testnet` | `mpc-recovery` (watchers: random keys) | `HgacdGnQfkZ68W43VuqL9uZbY5JUXL2Gt9hrTWYU3eXw` | `rec.hos` (same) |
| `deed.deedhq.testnet` | **Deed contract** | see [deploy/testnet.json](deploy/testnet.json) | n/a |

Names under the replica look like `<label>.deedbot.deedhq.testnet` (a testnet account can't own a short top-level name like `.bot`). Mainnet source commits (from each contract's `contract_source_metadata`): registry and recovery `bf0b65d`, extension, registrar, wallet and deployer `0925e0f` of [houseofstake/tla-contracts](https://github.com/houseofstake/tla-contracts). Reproduce: [deploy/fetch-mainnet-wasm.sh](deploy/fetch-mainnet-wasm.sh) then [deploy/testnet.sh](deploy/testnet.sh).

---

## Live sale on testnet: results

Run of [verify/testnet-sale.sh](verify/testnet-sale.sh) on **2026-11-03 03:01 UTC**, name `preflight.deedbot.deedhq.testnet` (seller `maya.deedhq.testnet`, buyer `kofi.deedhq.testnet`, price 1 NEAR). Result: **ALL PASS**, 9/9 attack attempts blocked on-chain with the expected error. Raw report: [verify/report-testnet.json](verify/report-testnet.json). Earlier runs are kept unedited in [verify/runs/](verify/runs/) (run 2 had one failing row, an outdated B3 check written for the pre-fix payout design; the contract behaved correctly).

| Row | Step | Result (on-chain error for attacks) | Verdict | Transaction |
|---|---|---|---|---|
| setup | The seller adds their AI agent as an extension | ok | PASS | [`CR2yYG8N…`](https://testnet.nearblocks.io/txns/CR2yYG8NELe4Zw5rEUe8Gt3rV2rFZ3B1o5B5VvdYtFC) |
| setup | The seller adds a second co-owner (a hidden back door) | ok | PASS | [`2bPkGQER…`](https://testnet.nearblocks.io/txns/2bPkGQEREMwtAJgbXXHFieaTWMk3qeTxF9XmzWJx8zAL) |
| setup | The seller grants their agent a capped spend (0.1 NEAR, to the seller only) | ok | PASS | [`2s6frdSD…`](https://testnet.nearblocks.io/txns/2s6frdSDCUoB3a3cLfMS2jvuZqkK9FbHF5eVDM1RXo1A) |
| earn | A customer pays 0.1 NEAR into the name | ok | PASS | [`Hai8ysgG…`](https://testnet.nearblocks.io/txns/Hai8ysgGZwx1Z1rqYYXVVjmy88Dg1GfM9Dx8EndfKaNe) |
| pre | The seller's agent spends within its grant | ok | PASS | [`1dEFEs4u…`](https://testnet.nearblocks.io/txns/1dEFEs4u8ChF4zT2yKaw5uUUPBMr6jTwjDUv7S9HXZu) |
| pre | The seller can sign in as the name (NEP-641) | ok | PASS | view call / balance check |
| A5 | The seller's agent tries to sign in as the name | **blocked**: `panicked: a spend grantee cannot authorise as an owner` | PASS | view call / balance check |
| list | The seller lists: the name moves into the escrow | ok | PASS | [`BT5WAwu6…`](https://testnet.nearblocks.io/txns/BT5WAwu65umMzL14mMhFwF2WWuNToJXghk9wUmCWRhH3) |
| B1 | The seller's earnings swept to the seller at listing (+0.0859 NEAR net of fees) | ok | PASS | view call / balance check |
| earn | A customer pays 0.1 NEAR into the name while it is listed | ok | PASS | [`EdBuBTeh…`](https://testnet.nearblocks.io/txns/EdBuBTehdz5XFPTfxSwREMNNBuUzfPTMk9ZCTpDWgvSV) |
| buy | The buyer pays exactly the price; the escrow hands them the name | ok | PASS | [`EnpYudm2…`](https://testnet.nearblocks.io/txns/EnpYudm2JJWHz5oeNrzj5yDfNChfcdJ3Pub6tbpfL7Uh) |
| G5 | Registry says the buyer (kofi.deedhq.testnet) owns the name | ok | PASS | view call / balance check |
| B3 | Money paid in while listed reached the seller at the sale (+0.1016 NEAR) | ok | PASS | view call / balance check |
| A1 | The seller's agent tries to spend | **blocked**: `panicked: extension 'maya-agent.deedhq.testnet' is not enabled` | PASS | view call / balance check |
| A2 | The seller's hidden co-owner tries to move money | **blocked**: `panicked: extension 'maya-partner.deedhq.testnet' is not enabled` | PASS | view call / balance check |
| A2 | The seller tries to move money themselves | **blocked**: `panicked: extension 'maya.deedhq.testnet' is not enabled` | PASS | view call / balance check |
| A3 | The seller tries to re-grant their agent | **blocked**: `panicked: only the owner may perform this operation` | PASS | view call / balance check |
| A4 | The seller tries to sign in as the name | **blocked**: `panicked: named account is not an owner of this account` | PASS | view call / balance check |
| A4 | The buyer can sign in as the name | ok | PASS | view call / balance check |
| A6 | The seller tries to sell the name again | **blocked**: `panicked: {"code":"only_owner"}` | PASS | view call / balance check |
| A7 | The name has 0 access keys: nobody can sign as it | ok | PASS | view call / balance check |
| D2 | The seller tries to switch the service back on | **blocked**: `panicked: only the current owner of the name can activate it` | PASS | view call / balance check |
| G1 | hos_agent_status: agent disabled, grant gone | ok | PASS | view call / balance check |
| D2 | The buyer activates the service under their name | ok | PASS | [`7WHhr3Fm…`](https://testnet.nearblocks.io/txns/7WHhr3Fmao4V5nompXivtBcJkdHHjA1ucFb4mT9xx32o) |
| C5 | The seller tries to take the money inside the 5-minute window | **blocked**: `panicked: revert window still open; try again after final_after_ns` | PASS | view call / balance check |
| C5 | After the window, anyone triggers payment | ok | PASS | [`BuMALMxS…`](https://testnet.nearblocks.io/txns/BuMALMxSwuxXdormWXUSJye8nMBvUF7fvUH2kazbLupp) |
| G5 | The seller received exactly price minus 2.5% royalty (0.975 NEAR) | ok | PASS | view call / balance check |

---

## Contract reference

`deed` ([contract/deed/src/lib.rs](contract/deed/src/lib.rs)), near-sdk 5.30.

| Method | Who | What |
|---|---|---|
| `new(registry, royalty_account, royalty_bps ≤ 1000, revert_window_ns?)` | deployer | init; revert window defaults to 5 min (hos-wallet `REVERT_WINDOW_NS`) |
| `activate(token_id, runtime_id, config_hash, price_yocto, version)` | current owner | reads `nft_token` cross-contract; records only if caller == owner and version > previous |
| `nft_on_transfer(sender_id, previous_owner_id, token_id, msg)` | registry only | records a listing `{price_yocto}`; returns `true` (give back) for bad msg, already listed, or unsettled previous sale. State only: the registry gives it 25 Tgas |
| `buy(token_id, expected_price, listing_nonce)` | anyone but the seller | payable, exact price, ≥ 230 Tgas; re-points payout to seller, transfers the name, refunds on failure |
| `claim_proceeds(sale_id)` | anyone | after the revert window: pays the seller and royalty, or refunds the buyer if reverted |
| `cancel(token_id)` | seller | 1 yocto, ≥ 230 Tgas; returns the name |
| views | anyone | `get_activation`, `get_listing`, `get_listings`, `get_sale`, `get_latest_sale`, `get_royalty`, `get_registry`, `get_revert_window_ns` |

**Events (NEP-297, `standard: "deed"`, `version: "1.0.0"`):** `activated`, `listed`, `list_rejected`, `sold`, `sale_failed_refunded`, `proceeds_paid`, `sale_reverted_refunded`, `claim_retry`, `cancelled`, `cancel_failed`.

---

## Web app

React 19 + Vite + TypeScript + Tailwind v4 + [shadcn/ui](https://ui.shadcn.com) (Base UI) + [motion](https://motion.dev). Dark and light themes, respects `prefers-reduced-motion`, plain-language copy with chain terms kept for the details.

| Route | Purpose | Data today |
|---|---|---|
| `/` | what a Deed is; live totals; animated sale explainer | **live** |
| `/market` | every Deed in the registry, filter/search | **live** |
| `/deed/:id` | title page: status, stats, on-chain history, owners, earnings, on-chain facts; real buy and release-payment | **live** + wallet |
| `/how` | four steps + FAQ | static |
| `/proof` | live testnet run report with tx links + every attack | **live report** ([web/public/report-testnet.json](web/public/report-testnet.json)) |
| `/console` | owner console, opens only for the current registry owner: switch on/update price, list, cancel | **live** + wallet (read-only preview without one) |

How history is built ([web/src/lib/live.ts](web/src/lib/live.ts)): fetch every transaction that touched the name and the Deed contract, decode the NEP-297 events (`nep171:nft_transfer`, `hos_tla_tenant_wallet:swept_near`, `spend_granted`, `spend_charged`, `wallet:extension_added`, `hos_tla_extension:force_transfer_completed`, every `deed:*` event), plain transfers into the name (payments; from our own `*.deedhq.testnet` accounts they're labelled *our demo*, from anyone else *real customer*), and failed calls into the wallet or registry (misuse attempts). Requests are shared and cached briefly because the public APIs are rate-limited.

---

## Repository layout

```
THREAT_MODEL.md              threat model, written before code
contract/
  deed/src/lib.rs            the Deed contract (activation, escrow, royalty, events)
  deed/tests/escrow.rs       9 sandbox tests vs the mock registry (forced failures, revert, pricing)
  deed/tests/real_fleet.rs   full sale vs House of Stake MAINNET bytecode, 19 checks, 300 Tgas cap
  mock-registry/             test-only registry stand-in
  test.sh                    build + run everything
deploy/
  fetch-mainnet-wasm.sh      download House of Stake mainnet bytecode (read-only)
  testnet.sh                 deploy replica + deed to testnet (hash-checked, idempotent)
  seed-testnet.sh            demo seller/buyer, rent, activate
  testnet.json               deployed account ids + hashes
verify/
  testnet-sale.sh            live sale + attack matrix on testnet
  report-testnet.json        latest live report
  runs/                      earlier live reports, kept unedited
web/                         the web app
docs/                        research (verified facts with source refs), spike results, track prompt, rules
```

---

## NEAR features used (with file paths)

| Feature | How Deed uses it | Files |
|---|---|---|
| **Top Level Accounts** (House of Stake): registry, registrar, `hos-wallet`, `hos-extension`, `mpc-recovery` | the Deed is a rented TLA name; replica deployed from mainnet bytecode | [deploy/testnet.sh](deploy/testnet.sh), [contract/deed/tests/real_fleet.rs](contract/deed/tests/real_fleet.rs) |
| **NEP-171** NFT (+ NEP-177 metadata, NEP-181 enumeration) | ownership of the name; `nft_transfer_call` → `nft_on_transfer` to list; `nft_token` for live owner checks | [contract/deed/src/lib.rs](contract/deed/src/lib.rs) |
| **Sharded NFT items draft** (`nft_item_info`, items that are accounts) | the account reports its own collection, owner and rotation sequence | README step 2, [docs/sharded-nft-items-draft.md](docs/sharded-nft-items-draft.md) |
| **Keyless accounts + wallet extensions** (`w_execute_extension`) | owner and agents act only through the wallet; zero access keys | [contract/deed/tests/real_fleet.rs](contract/deed/tests/real_fleet.rs), [verify/testnet-sale.sh](verify/testnet-sale.sh) |
| **Agent spend grants** (`hos_grant_spend`, `hos_agent_status`) | capped, allow-listed spending for the seller's agent; proven wiped on sale | same |
| **NEP-641** offchain authorizations (`w_resolve_auth`) | "sign in as the name"; proven to stop working for the seller | same, [docs/nep-0641.md](docs/nep-0641.md) |
| **NEP-591** global contracts | `hos-wallet` published once, used by every name | [deploy/testnet.sh](deploy/testnet.sh) |
| **NEP-297** events | every Deed state change is an indexable event | [contract/deed/src/lib.rs](contract/deed/src/lib.rs) |
| **NEP-330** source metadata | used to identify the exact mainnet commits we replicated | [README](#live-deployment-near-testnet) |
| Promise chains with callbacks and refunds | `buy` → payout → transfer → `on_buy_resolved` (refund on failure); `claim_proceeds` → `nft_token` → `on_claim_owner` | [contract/deed/src/lib.rs](contract/deed/src/lib.rs) |

---

## Testing strategy

Three layers, each closer to reality:

1. **Mock registry** ([escrow.rs](contract/deed/tests/escrow.rs)): fast, and lets us force what real contracts won't (transfer failure, House of Stake revert, FT-blocked listing).
2. **Mainnet bytecode in a sandbox** ([real_fleet.rs](contract/deed/tests/real_fleet.rs)): deploys the whole House of Stake fleet from the exact mainnet `.wasm` (hash-asserted), the same way [deploy/testnet.sh](deploy/testnet.sh) does, rents a name, adds an agent and a hidden co-owner, sells, then attacks from the seller's side. Uses the real **300 Tgas** transaction cap.
3. **Live testnet** ([verify/testnet-sale.sh](verify/testnet-sale.sh)): the same sale and attacks as real transactions; each attack must fail with its expected error; results go to [verify/report-testnet.json](verify/report-testnet.json) and the `/proof` page.

---

## Bugs our tests caught

- **Listing ran out of gas on testnet.** The first version re-pointed payout inside `nft_on_transfer`. The registry gives that hook a fixed 25 Tgas; the payout call needs about 45, so the receipt failed and the registry correctly returned the name to the seller. The sandbox didn't catch it because it allows more gas per transaction. Fix: the hook only records state; `buy`/`cancel` re-point payout before the transfer. The sandbox test now uses the 300 Tgas cap. (Commit: "fix: re-point payout in buy/cancel…")
- **Verifier false positives.** An early verifier counted any failure as "attack blocked". It now requires the expected error text, and stops if the sale itself didn't happen.

---

## Prior art and what is different

| Project | Model | Difference from Deed |
|---|---|---|
| ERC-6551 token-bound accounts | NFT points at a separate smart wallet | on NEAR the NFT **is** the account; no separate wallet to forget to move |
| ERC-7857 / 0G iNFT | agent NFT; secrets re-encrypted on transfer via TEE/oracle | Deed keeps nothing secret; control passes because the audited wallet wipes extensions on rotation |
| Virtuals Protocol | tokens per agent (speculation on the agent) | Deed sells the operating business itself (name, earnings stream, record) |
| Flippa / Acquire | web2 marketplaces for businesses, trust-based handover | handover enforced on-chain and attacked by a verifier on every sale |

---

## Roadmap (not built yet)

Listed so reviewers can tell built from planned:

1. **NEP-641 sign-in for the console**: today the console opens for the wallet account that the registry lists as owner; the next step is resolving a signed NEP-641 authorization through the name's `w_resolve_auth` (already proven to reject the old owner on testnet).
2. **"Preflight" service runtime** (Bun + TypeScript): pays-per-job explanation of a NEAR transaction before signing, answered by a NEAR AI Cloud verifiable (TEE-signed) model; per-job owner check with no cache; fail closed if RPC is unavailable.
3. **Indexer + evidence ledger** (every number links to a tx; demo vs external payments; a recompute script).
4. **Sale in the middle of a paid job** (threat-model rows D1, D4, D5): the rule is written in [THREAT_MODEL.md](THREAT_MODEL.md) §D; the runtime test lands with item 2.

---

## Libraries, AI-written code and baseline

- **Built during the hackathon window** (from 2026-11-02): everything in this repository. No pre-hackathon code of ours.
- **Third-party code we deploy unmodified:** House of Stake `tla-contracts` mainnet bytecode (registry, extension, registrar, wallet, wallet deployer, recovery), fetched from mainnet and hash-checked; it is not committed (`*.wasm` is git-ignored).
- **Rust:** `near-sdk` 5.30, `near-workspaces` 0.24, `tokio`, `serde_json`, `anyhow`, `sha2`, `bs58`.
- **Web:** React 19, Vite 8, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI), motion 14, react-router 7, lucide-react, sonner, `@hot-labs/near-connect` 0.12 (wallets), Geist and Instrument Serif fonts. Data: NEAR RPC (FastNEAR) and the FastNEAR transaction API.
- **Tools:** cargo-near 0.22, near-cli-rs 0.30, bun.
- **AI-assisted development (Q-005):** the code, tests, scripts and docs were written with an AI coding assistant (Claude Code) directed and reviewed by the team. The design was reviewed by several models (notes in [docs/PANEL.md](docs/PANEL.md)).

---

## Team and other submissions

- GitHub: [codemagician1949](https://github.com/codemagician1949)
- **Other projects by team members in this hackathon (Q-015):** _TODO before submission: the team confirms the list here._
- Deed shares no code, accounts or servers with any other project.
