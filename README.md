# Deed

**Deed makes a NEAR name a sellable, paid AI service.** The name (for example `preflight.deedbot.deedhq.testnet`) is at the same time an NEP-171 NFT, a real NEAR account with its own wallet, and the identity of a paid service. Customers pay the name; when it's sold, House of Stake's wallet code (audited by Valhalla Security per their repo; Deed's own code is not audited) wipes every permission the seller or their AI agents had and pays the seller what the name earned, and Deed's escrow pays the price. **What transfers:** the name, its wallet and incoming payments, its public record, and the right to choose which runtime serves it. **What doesn't:** compute, API keys or a hosted runtime; see [What a buyer gets](#what-a-buyer-gets-and-doesnt). Deed adds the activation registry, the sale escrow, the Preflight runtime and a verifier that attacks a sale from the seller's side. Every guarantee, whose code enforces it and where it's proven: [docs/INVARIANTS.md](docs/INVARIANTS.md).

- **Live app:** https://deed-near.vercel.app (NEAR testnet; connect a testnet wallet to buy or ask Preflight)
- **Live Preflight runtime:** https://preflight-production-8802.up.railway.app/v1/health ([API](#the-preflight-service-runtime))
- **Track:** `nfts` (NFTs That Do Something), NEAR HACKATHON 2026
- **Network:** NEAR **testnet** (contracts deployed and live, see [Live deployment](#live-deployment-near-testnet))
- **License:** MIT ([LICENSE](LICENSE))

---

## See it in 2 minutes (no install)

1. Open **https://deed-near.vercel.app/deed/preflight.deedbot.deedhq.testnet**. Under **History**, every line is a real testnet transaction: two sales between Kofi and Maya, the wallet wiping the seller's permissions, earnings paid out, and each rejected attempt by the old owner, with the chain's own error text. **Jobs answered** shows paid Preflight answers with their enclave-signature checks.
2. Open **https://deed-near.vercel.app/proof**: the live sale's attack run, one row per attempt, linked to its transaction.
3. Open **https://deed-near.vercel.app/try**: edit a transaction and watch the free risk flags (served by the hosted runtime). Paying for an explanation needs a NEAR testnet wallet.

## Verify it in 5 minutes

```bash
git clone https://github.com/codemagician1949/Deed && cd Deed
python3 verify/check-testnet.py --runtime https://preflight-production-8802.up.railway.app   # ~30 s, no wallet, no NEAR
```
**You will see** `ALL CHECKS PASS`: our testnet House of Stake contracts have the same code hashes as live mainnet; every transaction in the published sale report exists on chain with the outcome the report claims (7 attacks rejected, 10 steps accepted); and the hosted runtime serves exactly the config the Deed's on-chain activation names. Then `contract/test.sh` (about 5 min, offline after the Rust build: the mainnet bytecode is vendored and hash-checked) and `cd runtime && bun install && bun test` (seconds). Full evidence: [docs/EVIDENCE.md](docs/EVIDENCE.md) · [docs/INVARIANTS.md](docs/INVARIANTS.md).

---

## Contents
1. [The problem](#the-problem)
2. [What is real today](#what-is-real-today)
3. [Try it: do X → see Y](#try-it-do-x--see-y)
4. [How it works](#how-it-works)
5. [The exact security claim](#the-exact-security-claim)
6. [Threat model and proof](#threat-model-and-proof)
7. [Live deployment (NEAR testnet)](#live-deployment-near-testnet)
8. [Live sale and Preflight results](docs/EVIDENCE.md)
9. [Contract reference](#contract-reference)
10. [The Preflight service (runtime)](#the-preflight-service-runtime)
11. [Web app](#web-app)
12. [Repository layout](#repository-layout)
13. [NEAR features used (with file paths)](#near-features-used-with-file-paths)
14. [Prior art and what is different](#prior-art-and-what-is-different)
15. [Roadmap (not built yet)](#roadmap-not-built-yet)
16. [Libraries, AI-written code and baseline](#libraries-ai-written-code-and-baseline)
17. [Team and other submissions](#team-and-other-submissions)

---

## The problem

Selling an online business today (a bot, an API, an AI agent) means trusting the seller to hand over every password, API key and payout setting, and trusting that they kept no copy. On other chains, "agent NFTs" point at a separate wallet (ERC-6551) or rely on an oracle to re-encrypt secrets on transfer (ERC-7857), so control still depends on someone behaving.

The organizers' `nfts` prompt ([docs/TRACK-nfts.md](docs/TRACK-nfts.md)) asks for exactly this: an NFT that carries its own wallet, where "whoever holds the NFT controls that sub-account", with a written explanation of "what stops the old owner from keeping access", a gated holder page, a per-NFT history, and tests "for the transfer path, including a sale in the middle of a payout", plus a threat model written first.

On NEAR, Top Level Accounts (House of Stake) already make the NFT **be** the account: a rented name is a NEP-171 token and a keyless account run by the audited `hos-wallet`. Deed puts a paying service inside that account and makes the sale safe and provable.

---

## What a buyer gets (and doesn't)

| Transfers with the Deed | Doesn't transfer |
|---|---|
| The name, its keyless wallet and future payments into it | Compute, hosting, a NEAR AI API key |
| The public record (sales, payments, blocked attempts, answered jobs) | The seller's knowledge (nothing secret is kept in the config) |
| The right to switch the service on and choose **which runtime** serves it (`runtime_id` + config fingerprint in the activation) | Refund obligations for jobs another runtime accepted (owed by that operator) |

Today one operator account (`deedhq.testnet`) runs the hosted Preflight runtime for every Deed. A buyer who wants independence runs their own copy ([runtime/Dockerfile](runtime/Dockerfile) with their own `RUNTIME_ID` and NEAR AI key) and activates it; from then on the old operator can't serve that name, because the runtime checks that the activation names it. The resale royalty (2.5%) goes to `deedhq.testnet`, the team, fixed at contract init.

---

## What is real today

| Part | Status | Where |
|---|---|---|
| Threat model, written before code (25 attacks) | **Done** | [THREAT_MODEL.md](THREAT_MODEL.md) |
| `deed` contract: owner-checked activation, sale escrow, refund on failure, 5-min proceeds lock, capped royalty, NEP-297 events | **Done, deployed on testnet** | [contract/deed/src/lib.rs](contract/deed/src/lib.rs) |
| Sale tested against the **exact House of Stake bytecode that runs on mainnet** (hash-checked), 19 checks | **Passing** | [contract/deed/tests/real_fleet.rs](contract/deed/tests/real_fleet.rs) |
| Escrow edge cases (forced transfer failure, name back in escrow after a sale, buyer returning the name, wrong price, stale listing, FT-blocked listing, double claim), 10 tests; the buyer-return case also runs on the real bytecode | **Passing** | [contract/deed/tests/escrow.rs](contract/deed/tests/escrow.rs) |
| House of Stake TLA replica on testnet from mainnet bytecode (all code hashes equal mainnet) | **Live** | [deploy/testnet.json](deploy/testnet.json) |
| A real Deed on testnet, sold live, with the seller's attacks run on-chain | **Done** (see [results](docs/EVIDENCE.md)) | [verify/testnet-sale.sh](verify/testnet-sale.sh), [verify/report-testnet.json](verify/report-testnet.json) |
| Web app on **live testnet data**: browse, per-Deed title page with full on-chain history (owners, payments, sweeps, wiped permissions, blocked misuse attempts, each with a tx link), safety-proof page with the live report | **Done** | [web/src/lib/live.ts](web/src/lib/live.ts), [web/src/pages/deed.tsx](web/src/pages/deed.tsx) |
| NEAR wallet (NEAR Connect, testnet): buy, list, cancel, release the seller's payment, switch the service on; owner console that opens only for the current registry owner | **Built** (same contract calls as the live verifier; a signed in-browser run needs a person with a testnet wallet) | [web/src/lib/wallet.tsx](web/src/lib/wallet.tsx), [web/src/lib/actions.ts](web/src/lib/actions.ts) |
| **Preflight runtime**: paid per job in NEAR to the Deed's own account; per-job live owner + activation + config-fingerprint check (no cache, fail closed); NEAR AI verifiable inference with the enclave signature checked locally; one payment = one job; operator refunds | **Live on testnet**: 26 tests incl. a sale in the middle of a paid job, payer authentication and replay after restart; real paid jobs answered with the enclave signature verified (hashes, signer, attestation), plus refunds; see [Live Preflight jobs](docs/EVIDENCE.md#live-preflight-jobs-near-testnet) | [runtime/](runtime/) |
| "Try Preflight" page: free risk flags, pay the Deed from your wallet, get the signed explanation; a Jobs tab on each Deed page | **Built** | [web/src/pages/try.tsx](web/src/pages/try.tsx) |

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

### 1. Run every contract test (no account, no network spend; House of Stake bytecode is vendored in `deploy/mainnet-wasm`)
```bash
contract/test.sh
```
It uses the vendored House of Stake mainnet bytecode ([deploy/mainnet-wasm](deploy/mainnet-wasm/), hashes in `HASHES.txt`; refresh with [deploy/fetch-mainnet-wasm.sh](deploy/fetch-mainnet-wasm.sh)), builds `deed`, and runs three suites in a local NEAR sandbox. **You will see:**
```
test result: ok. 3 passed   (unit)
test result: ok. 10 passed  (escrow edge cases, mock registry)
test result: ok. 4 passed   (on mainnet bytecode: full sale, failed transfer refund, buyer return, onward resale)
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

### 4. Run the Preflight service

(Or use the hosted one: `curl https://preflight-production-8802.up.railway.app/v1/health`. It runs [runtime/Dockerfile](runtime/Dockerfile) on Railway with a persistent volume for the job ledger, so replay protection survives redeploys. It holds no NEAR key: refunds are paid from the operator's machine with `RUNTIME_URL=<host> bun run refunds --yes`, and the server records a refund only after verifying the refund transaction on chain.)

```bash
cd runtime && bun install && bun test     # 26 tests: sale mid-job, payer auth, replay (incl. after restart), fail-closed, payment checks, TEE signature check, risk flags
bun run start                             # http://localhost:8787  (set NEARAI_API_KEY in the repo-root .env to answer)
curl localhost:8787/v1/health              # runtime id, model, config fingerprint, can_answer
```
**You will see** `26 pass`, then the health JSON with `can_answer: true` (when the key is set) and `config_hash: 8c5e8df1…`, the sha256 of [runtime/preflight.config.json](runtime/preflight.config.json), which is also the fingerprint in the Deed's on-chain activation (version 3). With the runtime running, the web app's **Try Preflight** page shows free risk flags as you edit a transaction; paying needs a testnet wallet, and the answer appears with its three signature checks. If the AI step fails (or no key is set), the job becomes `refund_due` and `bun run refunds --yes` pays it back from the operator account.

### 5. Re-run the live sale on testnet (needs testnet NEAR)
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
2. **Activate.** The owner calls `deed.activate(token_id, runtime_id, config_hash, price, version)`. The contract makes a cross-contract `nft_token` view on the registry and, in the callback, records the activation only if the caller was the owner. These are two receipts, not one atomic step, so ownership can change in between; a stale activation is harmless because the runtime serves a job only when `activation.owner` equals the owner it reads fresh for that job. `config_hash` is the sha256 of the public service config (nothing secret).
3. **Run and earn.** The owner can add an AI agent as a wallet extension and give it a capped `hos_grant_spend` (allow-listed receivers, budget, expiry). Customers pay NEAR into the name.
4. **List.** The seller calls `registry.nft_transfer_call(receiver_id = deed contract, msg = {"price_yocto": "…"})`. The name rotates into the escrow; on that rotation the wallet **clears all spend grants, removes every extension, and sweeps the NEAR balance to the seller's payout account**. The escrow records the listing and deletes the seller's activation. (TLA has no NFT approvals, so the escrow must own the name while it's listed.)
5. **Buy.** The buyer calls `deed.buy(token_id, expected_price, listing_nonce)` with exactly the price. The escrow first points the name's payout at the seller (so anything paid in while it was listed is swept to the seller), then calls `registry.transfer_sub_account(…, buyer)`. If the transfer fails, the buyer is refunded in full in the callback and the listing reopens.
6. **Settle.** After a 5-minute settlement window (a safety margin; on the deployed House of Stake code nothing can undo a completed transfer), anyone calls `claim_proceeds(sale_id)`: the seller is paid the price minus royalty, the royalty goes to `royalty_account`. If the name is sitting in the escrow unlisted (the buyer sent it back), it is recorded as the buyer's listing so they can take it back with `cancel`; there is no refund.
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

After a sale and its 5-minute settlement window:

| | Claim | Enforced by |
|---|---|---|
| G1 | The seller's spend grants and every extension the seller added are gone. | `hos-wallet` `apply_rotation`: `spend_grants.clear()` and `extensions.retain(authority)` (audited House of Stake code) |
| G2 | The seller can no longer authorize anything as the name (NEP-641). | `hos-wallet` `w_resolve_auth` panics "named account is not an owner of this account" |
| G3 | NEAR earned while the seller held it went to the seller, once, during the rotation. | `hos-wallet` sweep to the outgoing payout account; `deed.buy` re-points payout to the seller before the sale rotation |
| G4 | The service will not run under the seller's activation. | `deed.activate` requires the current registry owner; listing deletes the old activation |
| G5 | The buyer paid exactly the price; the seller received it minus royalty; on failure the buyer is refunded. | `deed.buy` / `on_buy_resolved` / `claim_proceeds` |

**Not claimed:** that the seller forgets what they knew. The design keeps nothing secret worth knowing: the service config is public (fingerprint on chain), and no third-party API keys live in the Deed. What is sold is the name, the incoming payment stream and the verifiable track record.

**Residual risks (stated plainly):** House of Stake is a trusted lease authority (it can reclaim expired names, run recovery and upgrade its contracts; on our testnet replica the recovery watchers are random keys nobody holds). An off-chain runtime can be down (payments wait in the account). An unrenewed lease can be reclaimed (the title page shows `lease_until`).

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
| C1 | Buyer pays, transfer fails | refund in `on_buy_resolved`, listing reopens | **real bytecode** (registry paused mid-sale) + mock |
| C2 | Underpayment | exact-price check | mock |
| C4 | Price changed mid-purchase | `expected_price` + `listing_nonce` pinning | mock |
| C5 | The name ends up back in the escrow after a sale | seller paid after a 5-min window (insurance: on deployed House of Stake code nothing can undo a completed transfer); a name back in escrow is recorded as the buyer's listing | testnet (early claim refused, payout after window) + mock |
| C6 | Double claim of proceeds | state change before transfer | mock |
| C7 | **Free rental**: buyer sends the name back to the escrow hoping for a refund (found in review; v1 would have refunded) | seller always paid at claim; the name is the buyer's to take back | **real bytecode** + mock |
| D6 | **Payment theft**: someone submits another person's public payment tx with their own question (found in review) | payer signs each job with NEP-413 over Deed + payment + request hash; key must be a full-access key of the payer | runtime tests + hosted runtime (401) |
| D1 | **Sale in the middle of a paid job** | an accepted job is always delivered once; the owner at acceptance and at delivery are both recorded; a payment made before the sale is never served by the buyer (refund) | runtime tests |
| D2 | Seller re-activates the service / replays an old activation | live owner check + strictly increasing version; the runtime also requires the activation to name this runtime and this exact config fingerprint | sandbox + testnet + mock + runtime tests |
| D4 | One payment used for two answers | payment tx hash = job id; in-flight guard for simultaneous submissions | runtime tests + testnet (409 on replay) |
| D5 | Runtime serves under a stale owner when RPC is down | every job reads owner, activation, payment and last ownership change fresh; any failure = refuse, record nothing | runtime tests |

"Mock" tests use [contract/mock-registry](contract/mock-registry/src/lib.rs), a test-only stand-in that mirrors the registry rules Deed depends on (documented in its header), so we can force failures and simulate a future House of Stake revert, which the real contracts don't let a test trigger.

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


## Contract reference

`deed` ([contract/deed/src/lib.rs](contract/deed/src/lib.rs)), near-sdk 5.30.

| Method | Who | What |
|---|---|---|
| `new(registry, royalty_account, royalty_bps ≤ 1000, revert_window_ns?)` | deployer | init; settlement window defaults to 5 min. On testnet `royalty_account` = `deedhq.testnet` (the team), 250 bps |
| `activate(token_id, runtime_id, config_hash, price_yocto, version)` | current owner | reads `nft_token` cross-contract; records only if caller == owner and version > previous |
| `nft_on_transfer(sender_id, previous_owner_id, token_id, msg)` | registry only | records a listing `{price_yocto}`; returns `true` (give back) for bad msg, already listed, or unsettled previous sale. State only: the registry gives it 25 Tgas |
| `buy(token_id, expected_price, listing_nonce)` | anyone but the seller | payable, exact price, ≥ 230 Tgas; re-points payout to seller, transfers the name, refunds on failure |
| `claim_proceeds(sale_id)` | anyone | after the settlement window: pays the seller and royalty; a name back in escrow becomes the buyer's listing |
| `cancel(token_id)` | seller | 1 yocto, ≥ 230 Tgas; returns the name |
| views | anyone | `get_activation`, `get_listing`, `get_listings`, `get_sale`, `get_latest_sale`, `get_royalty`, `get_registry`, `get_revert_window_ns` |

**Events (NEP-297, `standard: "deed"`, `version: "1.0.0"`):** `activated`, `listed`, `list_rejected`, `sold`, `sale_failed_refunded`, `proceeds_paid`, `returned_to_buyer_listing`, `sale_reverted_refunded` (v1 only), `claim_retry`, `cancelled`, `cancel_failed`.

---

## The Preflight service (runtime)

[runtime/](runtime/) (Bun + TypeScript) is the service a Deed runs: before an agent or person signs a NEAR transaction, it pays the Deed and gets a plain-words explanation with risk flags, answered by a verifiable model.

| Endpoint | What |
|---|---|
| `POST /v1/flags {request}` | deterministic risk flags, free ([src/risk.ts](runtime/src/risk.ts): full-access keys, account deletion, contract deploys, unlimited approvals, large values, asset moves, unusual receivers…) |
| `POST /v1/jobs {name, payment_tx, sender, request, auth}` | the paid job; `auth = {public_key, signature, nonce}` is a NEP-413 signature by the payer (recipient `deed-preflight`) over `Preflight job / Deed / Payment / Request sha256` ([src/nep413.ts](runtime/src/nep413.ts)) |
| `POST /v1/jobs/:id/refund {refund_tx}` | records a refund after checking on chain that the operator sent at least the paid amount to the payer |
| `GET /v1/jobs?name=` | public job ledger (shown in the Deed page's **Jobs answered** tab) |
| `GET /v1/config`, `GET /v1/health` | the published service config and its fingerprint |

**Job rules** ([src/jobs.ts](runtime/src/jobs.ts), from THREAT_MODEL §D, written before the code). A job is accepted only if the payer signed it (NEP-413, checked against their on-chain full-access keys, binding this payment to this exact request), the payment is final, went to this name, came from the caller, covers the activated price and is under 24 h old, **and** a fresh read shows the current registry owner signed an activation that names this runtime and this exact config fingerprint. If the name is sold mid-job, the job is still delivered once, and both owners are recorded. A payment made before the latest ownership change is refunded. One made after it but before the new owner switches on is held, then served when they do (refunded after 24 h). Failures refund; RPC trouble refuses.

**Verifiable answers** ([src/nearai.ts](runtime/src/nearai.ts), [src/tee.ts](runtime/src/tee.ts)): the model (`z-ai/glm-5.3-flash`, run by NEAR AI in a TEE) answers; the runtime fetches the enclave's signature over `model:sha256(request bytes):sha256(response bytes)`, re-hashes the exact bytes it sent and received, and recovers the secp256k1 (EIP-191) signer, then checks that signer is listed in NEAR AI's attestation report for the model (`/v1/attestation/report`, Intel TDX + NVIDIA evidence; cached 10 min). All three checks are stored with the job and shown on the page. **Trust boundary:** this proves signed inference by a provider-reported enclave key. We don't independently verify the TDX/NVIDIA quote chain, and the runtime's own logic (owner checks, ledger, refunds) runs on an ordinary server, not in a TEE. An authentic answer isn't necessarily a correct one.

**Config fingerprint**: the system prompt, model and limits live in [runtime/preflight.config.json](runtime/preflight.config.json); its sha256 (`8c5e8df1…`) is what the owner signs at activation, and the runtime refuses activations naming any other config. Nothing secret: a seller can't keep a "secret recipe".

**How good are the flags?** [runtime/eval/RESULTS.md](runtime/eval/RESULTS.md): 24 labelled transactions (safe / check / danger), `bun run eval`. The first run found real bugs (1 dangerous miss, 2 false alarms) that are fixed; the current 22/24 is optimistic because it's the same set the fixes were made on. An independent held-out set is still to do.

**Agents and scripts** pay and ask in one command: `bun run ask --as <account.testnet> --runtime <url> --example approve` ([src/ask.ts](runtime/src/ask.ts)) reads the price from the activation, pays the Deed, signs the job with `near message sign-nep413` and prints the answer with its enclave checks.

**Refunds** ([src/refunds.ts](runtime/src/refunds.ts)) come from the runtime operator's account, never the Deed (THREAT_MODEL decision 2). Dry run by default.

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
| `/try` | Try Preflight: free risk flags, pay the Deed, get the signed explanation | runtime + wallet |

How history is built ([web/src/lib/live.ts](web/src/lib/live.ts)): fetch every transaction that touched the name and the Deed contract, decode the NEP-297 events (`nep171:nft_transfer`, `hos_tla_tenant_wallet:swept_near`, `spend_granted`, `spend_charged`, `wallet:extension_added`, `hos_tla_extension:force_transfer_completed`, every `deed:*` event), plain transfers into the name (payments; from our own `*.deedhq.testnet` accounts they're labelled *our demo*, from anyone else *outside account*, which alone doesn't prove independent demand), and failed calls into the wallet or registry (misuse attempts). Requests are shared and cached briefly because the public APIs are rate-limited.

---

## Repository layout

```
THREAT_MODEL.md              threat model, written before code
contract/
  rust-toolchain.toml        pinned Rust 1.97.1 + wasm target
  deed/src/lib.rs            the Deed contract (activation, escrow, royalty, events)
  deed/tests/escrow.rs       10 sandbox tests vs the mock registry (forced failures, name returned to escrow, pricing)
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
  check-testnet.py           free read-only check of the live deployment and report
  runs/                      earlier live reports, kept unedited
runtime/                     the Preflight service (Bun): job rules, NEAR AI inference + signature check, refunds
  preflight.config.json      the public service config; its sha256 is the activation fingerprint
web/                         the web app
docs/                        EVIDENCE.md, INVARIANTS.md, research (verified facts with source refs), spike results, track prompt, rules
.github/workflows/ci.yml     contract suite, runtime tests, web build, live read-only check
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
| **NEAR AI Cloud verifiable inference** (TEE, ECDSA-signed responses) | Preflight's answers; signature checked against the exact request/response bytes | [runtime/src/nearai.ts](runtime/src/nearai.ts), [runtime/src/tee.ts](runtime/src/tee.ts) |
| Promise chains with callbacks and refunds | `buy` → payout → transfer → `on_buy_resolved` (refund on failure); `claim_proceeds` → `nft_token` → `on_claim_owner` | [contract/deed/src/lib.rs](contract/deed/src/lib.rs) |

---



## Prior art and what is different

| Project | Model | Difference from Deed |
|---|---|---|
| ERC-6551 token-bound accounts | each NFT controls a separate smart-contract account whose control follows the token | similar idea; on NEAR the token and the account are the same name, and a sale also wipes delegated agent keys and settles the account's balance to the seller |
| ERC-7857 / 0G iNFT | agent NFT; secrets re-encrypted on transfer via TEE/oracle | Deed keeps nothing secret; control passes because the audited wallet wipes extensions on rotation |
| Virtuals Protocol | tokens per agent (speculation on the agent) | Deed sells the operating business itself (name, earnings stream, record) |
| Flippa / Acquire | web2 marketplaces for businesses, trust-based handover | handover enforced on-chain and attacked by a verifier on every sale |

---

## Roadmap (not built yet)

Listed so reviewers can tell built from planned:

1. **NEP-641 sign-in for the console**: today the console opens for the wallet account that the registry lists as owner; the next step is resolving a signed NEP-641 authorization through the name's `w_resolve_auth` (already proven to reject the old owner on testnet).
2. **Hosting** the runtime and web app for judges (today both run locally; the Jobs tab falls back to the published ledger snapshot).
3. **A recompute script** that rebuilds every number on a title page from chain data (the web app already builds its history from chain data, with tx links).

---

## Libraries, AI-written code and baseline

- **Built during the hackathon window** (from 2026-11-02): everything in this repository. No pre-hackathon code of ours.
- **Third-party code we deploy unmodified:** House of Stake `tla-contracts` mainnet bytecode (registry, extension, registrar, wallet, wallet deployer, recovery), fetched from mainnet and hash-checked; it is not committed (`*.wasm` is git-ignored).
- **Runtime (Bun):** `@noble/curves`, `@noble/hashes` (secp256k1 recovery, sha256, keccak); NEAR RPC and the FastNEAR transaction API; NEAR AI Cloud.
- **Rust:** `near-sdk` 5.30, `near-workspaces` 0.24, `tokio`, `serde_json`, `anyhow`, `sha2`, `bs58`.
- **Web:** React 19, Vite 8, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI), motion 14, react-router 7, lucide-react, sonner, `@hot-labs/near-connect` 0.12 (wallets), Geist and Instrument Serif fonts. Data: NEAR RPC (FastNEAR) and the FastNEAR transaction API.
- **Tools:** cargo-near 0.22, near-cli-rs 0.30, bun.
- **AI-assisted development (Q-005):** the code, tests, scripts and docs were written with an AI coding assistant (Claude Code) directed and reviewed by the team. The design was reviewed by several models (notes in [docs/PANEL.md](docs/PANEL.md)).

---

## Team and other submissions

- GitHub: [codemagician1949](https://github.com/codemagician1949)
- **Other projects by team members in this hackathon (Q-015):** none. Deed stands on its own: it is this team's only submission.
- Deed shares no code, accounts or servers with any other project.
