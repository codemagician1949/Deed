# Deed

[![ci](https://github.com/codemagician1949/Deed/actions/workflows/ci.yml/badge.svg)](https://github.com/codemagician1949/Deed/actions/workflows/ci.yml)

**Deed makes a NEAR name a sellable, paid AI service.** The name (here `preflight.deedbot.deedhq.testnet`) is at once an NEP-171 NFT, a real NEAR account with its own wallet, and the identity of a paid service. Customers pay the name. When it's sold, House of Stake's audited wallet code wipes every permission the seller or their AI agents had and pays the seller what the name earned; Deed's escrow pays the price and the buyer switches the service on under their own name.

- **Live app:** https://deed-near.vercel.app · **Live runtime:** https://preflight-production-8802.up.railway.app/v1/health
- **Track:** `nfts` · **Network:** NEAR **testnet** only · **License:** MIT

**Deed's own work:** the activation registry, the sale escrow, the Preflight service, the web app and a verifier that attacks every sale from the seller's side. **Not ours:** the NFT-is-the-account design and the permission wipe on transfer are House of Stake's Top Level Accounts (audited by Valhalla Security per their repo); Deed's code is not audited. House of Stake isn't deployed on testnet, so we run a **replica from the exact mainnet bytecode** under team accounts (code hashes checked live against mainnet).

---

## See it in 2 minutes (no install)

1. **https://deed-near.vercel.app/deed/preflight.deedbot.deedhq.testnet**: every line under **History** is a testnet transaction: two sales, the wallet wiping the seller's permissions, earnings paid out, and each rejected attempt by the old owner with the chain's own error. **Jobs answered** shows paid answers with their enclave-signature checks.
2. **https://deed-near.vercel.app/proof**: the live sale's attack run, one row per attempt, each linked to its transaction.
3. **https://deed-near.vercel.app/try**: edit a transaction and watch the free risk flags; paying for an explanation needs a testnet wallet.

## Verify it in 5 minutes

```bash
git clone https://github.com/codemagician1949/Deed && cd Deed
python3 verify/check-testnet.py --runtime https://preflight-production-8802.up.railway.app   # ~30 s, no wallet, no NEAR
contract/test.sh                          # ~5 min: 17 tests (14 in a local NEAR sandbox, 4 of those on House of Stake mainnet bytecode)
cd runtime && bun install && bun test     # seconds: 39 tests (job rules, payer auth, refunds, crash recovery, TEE signature)
```
**You will see** `ALL CHECKS PASS`: the testnet replica's code hashes equal live mainnet's (read from both chains now, and from the vendored `.wasm`); every transaction in the published sale report exists on chain with the outcome the report claims; the hosted runtime serves exactly the config the Deed's on-chain activation names. The `.wasm` hash check makes the contract tests refuse to run on anything but mainnet bytecode.

**The numbers, reconciled** (each counted once):

| What | Count | Where |
|---|---|---|
| Seller-side attack attempts in the live testnet sale, all refused | **9** = 7 rejected transactions + 2 refused view calls (sign-in as the name) | [verify/report-testnet.json](verify/report-testnet.json), [docs/EVIDENCE.md](docs/EVIDENCE.md) |
| Accepted steps in that sale (list, buy, activate, claim…) | 10 transactions, plus 2 views and 6 balance/state reads | same |
| Checks in the sandbox sale on mainnet bytecode | 19, in 4 tests | [contract/deed/tests/real_fleet.rs](contract/deed/tests/real_fleet.rs) |
| Threat-model rows | 31, each naming its test, or "no test" | [THREAT_MODEL.md](THREAT_MODEL.md) |
| Paid Preflight jobs on testnet | 8 jobs: 4 answered with signature checks, 4 refunded (each refund linked) | [docs/EVIDENCE.md](docs/EVIDENCE.md#live-preflight-jobs-near-testnet) |

All live activity so far is between the team's own testnet accounts (Kofi, Maya). It shows the mechanism works, not that anyone else wants it.

---

## What a buyer gets (and doesn't)

| Transfers with the Deed | Doesn't transfer |
|---|---|
| The name, its keyless wallet and future payments into it | Compute, hosting, a NEAR AI API key |
| The public record (sales, payments, blocked attempts, answered jobs) | The seller's knowledge (nothing secret is kept in the config) |
| The right to switch the service on and choose **which runtime** serves it (`runtime_id` + config fingerprint in the activation) | Refunds for jobs another runtime accepted (owed by that operator) |

Today one operator (`deedhq.testnet`) runs Preflight for every Deed. A buyer can run their own copy ([runtime/Dockerfile](runtime/Dockerfile), own `RUNTIME_ID` and NEAR AI key) and activate it; the old operator is then **no longer the authorised runtime**. An honest runtime refuses on its own. A dishonest one could still answer, so clients trust an answer only if the current on-chain activation names that runtime and config, its owner is the current registry owner, and the answer carries a valid enclave signature: [docs/CLIENTS.md](docs/CLIENTS.md). The 2.5% resale royalty goes to the team (`deedhq.testnet`), fixed at contract init.

---

## How it works

1. **Rent.** A name rented from the House of Stake registry becomes a keyless account run by the global `hos-wallet` code; only extensions (owner, lease authority, agents) can act.
2. **Activate.** The owner calls `deed.activate(name, runtime_id, config_hash, price, version)`; the contract checks the caller against the registry owner in a callback. `config_hash` is the sha256 of the public service config.
3. **Earn.** Customers pay NEAR to the name and sign the job (NEP-413). The runtime serves only if a fresh chain read shows the current owner activated *this* runtime and *this* config; it keeps serving the seller while the Deed is listed.
4. **List.** `nft_transfer_call` moves the name into the escrow. On that rotation the wallet **clears spend grants, removes every extension and sweeps the NEAR balance to the seller**.
5. **Buy.** `deed.buy` (exact price) re-points payout to the seller, then transfers the name; if the transfer fails, the buyer is refunded in the same callback.
6. **Settle.** After a 5-minute settlement window anyone calls `claim_proceeds`: the seller is **always** paid (minus royalty). If the buyer sent the name back, it becomes the buyer's listing, never a refund. On today's House of Stake code nothing can undo a completed transfer, so the window protects against nothing yet; it is a margin in case a future registry adds an undo.
7. **Switch on.** The buyer activates with a higher version; the next paid answer lands in the same name under the new owner.

Call-by-call sequence, contract API, runtime API and web routes: [docs/REFERENCE.md](docs/REFERENCE.md).

## The exact security claim

After a sale:

| | Claim | Enforced by | Proven |
|---|---|---|---|
| G1 | The seller's spend grants and every extension they added are gone | `hos-wallet` `apply_rotation` (House of Stake) | sandbox on mainnet bytecode + testnet txs |
| G2 | The seller can't authorise anything as the name (NEP-641) | `hos-wallet` `w_resolve_auth` | sandbox + testnet view panics |
| G3 | NEAR earned under the seller went to the seller, once | wallet sweep; `deed.buy` re-points payout first | sandbox + testnet balance reads |
| G4 | The seller's activation no longer counts | `deed.activate` owner check; runtime per-job owner check | sandbox + testnet + runtime tests |
| G5 | Buyer paid exactly the price; seller received it minus royalty; failed transfer → buyer refunded | `deed.buy` / `on_buy_resolved` / `claim_proceeds` | sandbox (real bytecode: registry paused mid-sale) + testnet |

**Not claimed:** that the seller forgets what they knew, that an old operator's server is unable to answer (clients must check, above), or that refunds are guaranteed: they are an off-chain obligation of the runtime operator that accepted the job ([who owes what across a sale](THREAT_MODEL.md#who-owes-what-across-a-sale)). Full model with 31 rows: [THREAT_MODEL.md](THREAT_MODEL.md) · every guarantee by whose code and where it's proven: [docs/INVARIANTS.md](docs/INVARIANTS.md).

---

## What is real today, and what isn't

| Part | Status |
|---|---|
| Threat model written before code; `deed` contract (activation, escrow, refunds, capped royalty, NEP-297 events) | **Done, deployed on testnet** |
| Sale tested in a sandbox on the **exact House of Stake mainnet bytecode** (19 checks) + 10 escrow edge-case tests | **Passing in CI** |
| A real Deed sold live on testnet with the seller's attacks run on chain | **Done**, [results](docs/EVIDENCE.md) |
| Preflight runtime: paid jobs, payer signatures, per-job owner check, NEAR AI verifiable inference with the enclave signature checked, refunds | **Live** (Railway); answered and refunded jobs on testnet |
| Web app on live chain data: title page with full history, proof page, market, owner console, Try Preflight | **Live** (Vercel) |
| Wallet actions in the browser (buy, list, cancel, release payment, activate, pay and sign a job) | **Built**; the live sales and jobs so far were signed from the CLI, not yet by an outside person in a browser |
| A buyer running their own runtime | **Supported, not yet demonstrated** by someone outside the team ([runbook](docs/HANDOVER.md)) |
| Risk-flag accuracy | 22/24 on the team's own set, which the fixes were tuned on, so optimistic ([results](runtime/eval/RESULTS.md)). A held-out harness that refuses to run until an outsider's labels are frozen in git is ready ([how](runtime/eval/HELDOUT.md)); the set itself isn't written yet |
| Model verdicts | The model once answered a full-access-key request (flagged high) with "CHECK FIRST". The final verdict is now the stricter of the model's and the flags', applied in code next to the unchanged signed text |

**Roadmap:** on-chain job escrow (so refunds don't depend on the operator), the runtime's URL bound in the activation, NEP-641 sign-in for the console, a script that recomputes every title-page number from chain data.

---

## NEAR features used

Top Level Accounts (registry, registrar, `hos-wallet`, `hos-extension`, `mpc-recovery`) · NEP-171/177/181 NFT, `nft_transfer_call` listing, live `nft_token` owner checks · keyless accounts with wallet extensions and agent spend grants (`hos_grant_spend`) · NEP-641 `w_resolve_auth` · NEP-591 global contracts · NEP-297 events · NEP-413 signed messages (payer authentication) · NEP-330 source metadata (to match mainnet commits) · NEAR AI Cloud verifiable inference (TEE-signed answers) · promise chains with refund callbacks · NEAR Connect wallets. File paths for each: [docs/REFERENCE.md](docs/REFERENCE.md) and [docs/INVARIANTS.md](docs/INVARIANTS.md).

## Prior art

ERC-6551 gives each NFT a separate account whose control follows the token; on NEAR the token and the account are the same name, and a sale also wipes delegated agent permissions and settles the balance to the seller. ERC-7857/0G iNFTs re-encrypt agent secrets on transfer through a TEE or oracle; Deed keeps nothing secret, and control passes because the wallet wipes extensions on rotation. Virtuals tokenises speculation on an agent; Deed sells the operating business (name, earnings, record). Flippa-style marketplaces rely on a trusted handover; here it is enforced on chain and attacked by a verifier.

---

## Libraries, AI-written code and baseline

- **Baseline:** everything in this repository was built during the hackathon window, from 2026-11-02 (first commit). No pre-hackathon code of ours.
- **Third-party code deployed unmodified:** House of Stake [`tla-contracts`](https://github.com/houseofstake/tla-contracts) mainnet bytecode (registry and recovery at commit `bf0b65d`, the rest at `0925e0f`), fetched from mainnet and vendored in [deploy/mainnet-wasm](deploy/mainnet-wasm/) with its hashes.
- **Libraries:** Rust `near-sdk` 5.30, `near-workspaces` 0.24; Bun runtime with `@noble/curves`, `@noble/hashes`; web: React 19, Vite, Tailwind 4, shadcn/ui (Base UI), motion, react-router, `@hot-labs/near-connect`. Services: NEAR RPC and FastNEAR APIs, NEAR AI Cloud. Tools: cargo-near 0.22, near-cli-rs 0.30.
- **AI-assisted development (Q-005):** the code, tests, scripts and docs were written with an AI coding assistant (Claude Code), directed and reviewed by the team.
- **Process notes:** before and during the build we asked several AI models to critique the design as judges might; their notes and our responses are in [docs/process/](docs/process/). They are working notes, not external validation.

## Team and other submissions

- GitHub: [codemagician1949](https://github.com/codemagician1949)
- **Other projects by team members in this hackathon (Q-015):** none; Deed is this team's only submission. It shares no code, accounts or servers with any other project.

## Documents

[THREAT_MODEL.md](THREAT_MODEL.md) · [docs/INVARIANTS.md](docs/INVARIANTS.md) · [docs/EVIDENCE.md](docs/EVIDENCE.md) (live sale, live jobs, testing strategy, bugs found) · [docs/REFERENCE.md](docs/REFERENCE.md) (run it, call-by-call, APIs) · [docs/CLIENTS.md](docs/CLIENTS.md) · [docs/HANDOVER.md](docs/HANDOVER.md) · [docs/SPIKE.md](docs/SPIKE.md) · [docs/RESEARCH.md](docs/RESEARCH.md)
