# Deed: technical reference

The full reference behind the [README](../README.md): how to run every part, how the sale works call by call, the live deployment, the contract API, the Preflight runtime and the web app. Threat model: [THREAT_MODEL.md](../THREAT_MODEL.md). Guarantees and where each is proven: [INVARIANTS.md](INVARIANTS.md). Live results: [EVIDENCE.md](EVIDENCE.md).

1. [Try it: do X → see Y](#try-it-do-x--see-y)
2. [How it works](#how-it-works)
3. [Live deployment (NEAR testnet)](#live-deployment-near-testnet)
4. [Contract reference](#contract-reference)
5. [The Preflight service (runtime)](#the-preflight-service-runtime)
6. [Web app](#web-app)
7. [Repository layout](#repository-layout)

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
It uses the vendored House of Stake mainnet bytecode ([deploy/mainnet-wasm](../deploy/mainnet-wasm/), hashes in `HASHES.txt`; refresh with [deploy/fetch-mainnet-wasm.sh](../deploy/fetch-mainnet-wasm.sh)), builds `deed`, and runs three suites in a local NEAR sandbox. **You will see:**
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

(Or use the hosted one: `curl https://preflight-production-8802.up.railway.app/v1/health`. It runs [runtime/Dockerfile](../runtime/Dockerfile) on Railway with a persistent volume for the job ledger, so replay protection survives redeploys. It holds no NEAR key: refunds are paid from the operator's machine with `RUNTIME_URL=<host> bun run refunds --yes`, and the server records a refund only after verifying the refund transaction on chain.)

```bash
cd runtime && bun install && bun test     # 39 tests: sale mid-job, payer auth, replay (incl. after restart), fail-closed, payment checks, TEE signature check, risk flags
bun run start                             # http://localhost:8787  (set NEARAI_API_KEY in the repo-root .env to answer)
curl localhost:8787/v1/health              # runtime id, model, config fingerprint, can_answer
```
**You will see** `39 pass`, then the health JSON with `can_answer: true` (when the key is set) and `config_hash: 678ff1f4…`, the sha256 of [runtime/preflight.config.json](../runtime/preflight.config.json), which is also the fingerprint in the Deed's on-chain activation (version 4). With the runtime running, the web app's **Try Preflight** page shows free risk flags as you edit a transaction; paying needs a testnet wallet, and the answer appears with its three signature checks. If the AI step fails (or no key is set), the job becomes `refund_due` and `bun run refunds --yes` pays it back from the operator account.

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
anyone ──claim_proceeds──▶ deed ──nft_token──▶ registry ──on_claim_owner──▶ pay seller + royalty (always; a name found back in escrow
                                                                 becomes the buyer's listing, never a refund)
```

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
| `deed.deedhq.testnet` | **Deed contract** | see [deploy/testnet.json](../deploy/testnet.json) | n/a |

Names under the replica look like `<label>.deedbot.deedhq.testnet` (a testnet account can't own a short top-level name like `.bot`). Mainnet source commits (from each contract's `contract_source_metadata`): registry and recovery `bf0b65d`, extension, registrar, wallet and deployer `0925e0f` of [houseofstake/tla-contracts](https://github.com/houseofstake/tla-contracts). Reproduce: [deploy/fetch-mainnet-wasm.sh](../deploy/fetch-mainnet-wasm.sh) then [deploy/testnet.sh](../deploy/testnet.sh).

---


## Contract reference

`deed` ([contract/deed/src/lib.rs](../contract/deed/src/lib.rs)), near-sdk 5.30.

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

[runtime/](../runtime/) (Bun + TypeScript) is the service a Deed runs: before an agent or person signs a NEAR transaction, it pays the Deed and gets a plain-words explanation with risk flags, answered by a verifiable model.

| Endpoint | What |
|---|---|
| `POST /v1/flags {request}` | deterministic risk flags, free ([src/risk.ts](../runtime/src/risk.ts): full-access keys, account deletion, contract deploys, unlimited approvals, large values, asset moves, unusual receivers…) |
| `POST /v1/jobs {name, payment_tx, sender, request, auth}` | the paid job; `auth = {public_key, signature, nonce}` is a NEP-413 signature by the payer (recipient `deed-preflight`) over `Preflight job / Deed / Payment / Request sha256` ([src/nep413.ts](../runtime/src/nep413.ts)) |
| `POST /v1/jobs/:id/refund {refund_tx}` | records a refund after checking on chain that the operator sent at least the paid amount to the payer, after the payment, in a transfer not already used for another job |
| `GET /v1/jobs?name=` | public job ledger (shown in the Deed page's **Jobs answered** tab) |
| `GET /v1/config`, `GET /v1/health` | the published service config and its fingerprint |

**Job rules** ([src/jobs.ts](../runtime/src/jobs.ts), from THREAT_MODEL §D, written before the code). A job is accepted only if the payer signed it (NEP-413, checked against their on-chain full-access keys, binding this payment to this exact request), the payment is final, went to this name, came from the caller, covers the activated price and is under 24 h old, **and** a fresh read shows the current registry owner signed an activation that names this runtime and this exact config fingerprint. If the name is sold mid-job, the job is still delivered once, and both owners are recorded. A payment made before the latest ownership change is refunded. One made after it but before the new owner switches on is held, then served when they do (refunded after 24 h). Failures refund; RPC trouble refuses. While a Deed is listed, the seller of the active listing counts as the owner, so the service keeps answering for them (those payments reach the seller at the sale). Owner, activation and last ownership change are read twice; if anything moved between the reads, nothing is recorded and the payer resubmits. On startup, any job left mid-answer by a crash becomes `refund_due`. Who owes what across a sale: [THREAT_MODEL.md](../THREAT_MODEL.md#who-owes-what-across-a-sale).

**Verifiable answers** ([src/nearai.ts](../runtime/src/nearai.ts), [src/tee.ts](../runtime/src/tee.ts)): the model (`z-ai/glm-5.3-flash`, run by NEAR AI in a TEE) answers; the runtime fetches the enclave's signature over `model:sha256(request bytes):sha256(response bytes)`, re-hashes the exact bytes it sent and received, and recovers the secp256k1 (EIP-191) signer, then checks that signer is listed in NEAR AI's attestation report for the model (`/v1/attestation/report`, Intel TDX + NVIDIA evidence; cached 10 min). All three checks are stored with the job and shown on the page. **Trust boundary:** this proves signed inference by a provider-reported enclave key. We don't independently verify the TDX/NVIDIA quote chain, and the runtime's own logic (owner checks, ledger, refunds) runs on an ordinary server, not in a TEE. An authentic answer isn't necessarily a correct one.

**Config fingerprint**: the system prompt, model and limits live in [runtime/preflight.config.json](../runtime/preflight.config.json); its sha256 (`678ff1f4…`) is what the owner signs at activation, and the runtime refuses activations naming any other config. Nothing secret: a seller can't keep a "secret recipe".

**How good are the flags?** [runtime/eval/RESULTS.md](../runtime/eval/RESULTS.md): 24 labelled transactions (safe / check / danger), `bun run eval`. The first run found real bugs (1 dangerous miss, 2 false alarms) that are fixed; the current 22/24 is optimistic because it's the same set the fixes were made on. An independent held-out set is still to do.

**Agents and scripts** pay and ask in one command: `bun run ask --as <account.testnet> --runtime <url> --example approve` ([src/ask.ts](../runtime/src/ask.ts)) reads the price from the activation, pays the Deed, signs the job with `near message sign-nep413` and prints the answer with its enclave checks.

**Refunds** ([src/refunds.ts](../runtime/src/refunds.ts)) come from the runtime operator's account, never the Deed (THREAT_MODEL decision 2). Dry run by default.

---

## Web app

React 19 + Vite + TypeScript + Tailwind v4 + [shadcn/ui](https://ui.shadcn.com) (Base UI) + [motion](https://motion.dev). Dark and light themes, respects `prefers-reduced-motion`, plain-language copy with chain terms kept for the details.

| Route | Purpose | Data today |
|---|---|---|
| `/` | what a Deed is; live totals; animated sale explainer | **live** |
| `/market` | every Deed in the registry, filter/search | **live** |
| `/deed/:id` | title page: status, stats, on-chain history, owners, earnings, on-chain facts; real buy and release-payment | **live** + wallet |
| `/how` | four steps + FAQ | static |
| `/proof` | live testnet run report with tx links + every attack | **live report** ([web/public/report-testnet.json](../web/public/report-testnet.json)) |
| `/console` | owner console, opens only for the current registry owner: switch on/update price, list, cancel | **live** + wallet (read-only preview without one) |
| `/try` | Try Preflight: free risk flags, pay the Deed, get the signed explanation | runtime + wallet |

How history is built ([web/src/lib/live.ts](../web/src/lib/live.ts)): fetch every transaction that touched the name and the Deed contract, decode the NEP-297 events (`nep171:nft_transfer`, `hos_tla_tenant_wallet:swept_near`, `spend_granted`, `spend_charged`, `wallet:extension_added`, `hos_tla_extension:force_transfer_completed`, every `deed:*` event), plain transfers into the name (payments; from our own `*.deedhq.testnet` accounts they're labelled *our demo*, from anyone else *outside account*, which alone doesn't prove independent demand), and failed calls into the wallet or registry (misuse attempts). Requests are shared and cached briefly because the public APIs are rate-limited.

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
