# Deed — NEAR HACKATHON project memory (track: `nfts`)

> Read this first, then `docs/RESEARCH.md` (verified facts with file/line references), `docs/PANEL.md` (why Deed was chosen and what the judges' models criticised), `docs/HACKATHON.md` (official rules — re-read the live https://nearhackathon.com/HACKATHON.md before submitting), `docs/TRACK-nfts.md` (the organizers' own prompt for this track).
> Folder created 2026-11-02. Remote: github.com/codemagician1949/Deed (public); pushing to it is authorized, following §Git identity. Deadline **2026-11-14 23:59 UTC** (submissions open 1 Nov).

## One line
**Deed turns a NEAR name into a working AI service you can own, prove and sell — and when it's sold, NEAR's own wallet contract wipes the seller's agent permissions and pays them out in the same step.**

Pitch (one breath): *"On other chains an NFT points at a wallet. On NEAR, the NFT **is** the account. Deed puts a paying AI service inside it — name, wallet, earnings, permissions and track record — so selling the service is just selling the NFT."*

## Why this can win `nfts`
- It is the organizers' `nfts` prompt ("a membership NFT that carries its own wallet… whoever holds the NFT controls that sub-account… explain exactly how control passes on transfer and what stops the old owner from keeping access… a gated page… a history view per NFT… tests for the transfer path, including a sale in the middle of a payout… write the threat model first") **taken one level further: the NFT-account runs a business.** Hit every literal ask.
- Built on **Top Level Accounts** (House of Stake), which the prompt points at: live and audited on mainnet, **no SDK, only 79 names rented in total (2026-11-02)** — almost nobody has built on it. Agent-themed namespaces exist: `.agi`, `.bot`, `.bots`, `.assistant`, `.agency`, `.aide`, `.ask`.
- The panel (Kimi K3.1 Pro, GLM-5.3, GPT-6 Astra, Claude Fable on NEAR AI) ranked Deed #1 of 12 ideas (avg 7.42; GLM 8.3). Track fit 9–9.8, NEAR depth 8.5–9.3, demo 8.5–9.2. Points were lost on overclaiming, scope and "who would buy it" — v3 below fixes each (see docs/PANEL.md).

## Latest panel verdict — v3 (2026-11-02): avg 7.70 (Kimi 8.3, GLM 8.2, GPT-6 7.8, Fable 6.5), #1 of 13
The `apply_rotation` facts lifted the score (v2 7.42 → v3 7.70). To pass 8.5, the build must also fix (details in docs/PANEL.md):
1. **Sale is not atomic** — two revertible rotations; escrow→buyer sweep pays the escrow. Build an explicit sale state machine with every failure branch, finality-gated seller payout (after the 5-min revert window), forwarding of listing-period earnings, and a test per branch.
2. **Own an invariant** — `deed` contract must enforce something the wallet doesn't: per-job escrowed payment with refund-if-unanswered, on-chain job/receipt ledger, activation bound to `rotation_seq`.
3. **Runtime bound to the name, not an operator** — open-source multi-tenant runtime serving whoever the chain says owns the name; buyer needs zero ops.
   Stronger (Claude Fable's fix): run the runtime in a TEE whose **only** credential is a wallet extension on the name. A sale makes the wallet wipe that extension, so the enclave can no longer act as the name until the buyer re-grants. "The NFT is the service" becomes a mechanism. Show the attestation and the key wipe on the title page.
6. **Royalties** ("earn royalties" is in the track tagline): NEP-199 `nft_payout`-style resale cut to the Deed template creator, paid by the sale flow.
7. Drop all post-quantum mentions from Deed: the panel brief accidentally carried PQ facts, and Fable called them dead weight.
4. **Not an AI wrapper** — deterministic tx analysis first (decode actions, known contracts, unlimited approvals, drain patterns), model only explains; publish accuracy on a labelled set.
5. Real external paid calls; a second Deed with a different ledger.

## The precise claim (never say more than this)
After a Deed is sold:
1. **The seller's agent permissions are gone, enforced on-chain by the audited `hos-wallet`**: every ownership rotation runs `spend_grants.clear()` and removes every extension except the lease authority (docs/RESEARCH.md §1 ★). Proven by direct calls from the seller's own client in our verifier.
2. **The seller can no longer authorize anything as the name**: NEP-641 `w_resolve_auth` only resolves for an owner in `wallet.extensions`; the seller was removed.
3. **Earnings settle to the seller automatically**: on Sale/Transfer the wallet sweeps the NEAR balance to the outgoing payout account, then re-points payout to the buyer.
4. **The service stops serving the seller and waits for the buyer** to activate it (Deed's entitlement check), then keeps earning into the same name.
5. Not claimed: that the seller forgets what they knew. The design keeps nothing secret worth knowing (public prompt/config hash, no pasted third-party keys); value = name + earnings stream + verifiable track record. State this residual risk plainly in the README.
- Finality: House of Stake's authority can **revert** the last rotation within 5 minutes. A sale is shown as "final" only after that window. Say so.

## The product (v3 — scope locked)
1. **Mint** — rent a TLA name (e.g. `preflight.bot`; check availability/price day 1) → it's the service's identity, wallet and NEP-171 token.
2. **Activate** — the owner signs a NEP-641 authorization for `{name, runtime_id, config_hash, price, version}`; the `deed` contract records it only if the signer is the current owner. The owner adds the Deed runtime as an extension and gives it a capped `hos_grant_spend` (allow-listed receivers only, budget, expiry) — the runtime can pay its costs but can never drain earnings.
3. **Earn** — one service template with an obvious buyer and a value that compounds with track record. **Recommended: "Preflight"** — before an agent or wallet signs a NEAR transaction it pays a few cents to get a plain-language explanation + risk flags (unknown contract, unlimited approval, drain pattern), answered by a **verifiable NEAR AI model** (TEE-signed response attached). Customers pay **in NEAR** to the name account with a job id (so the protocol sweep settles earnings on sale; USDC would block transfers — see §Risks). x402 via PingPay if it works on our network (VERIFY), otherwise direct NEAR payment + receipt check.
4. **Prove** — public **title page** per Deed: holder lineage (NEP-171/NEP-297 events), earnings, sweeps/payouts, grants issued/revoked, jobs served with TEE signatures, refunds, uptime, and the attacks our verifier ran against it. **Evidence ledger, not "P&L"**: every number links to a tx; demo vs external payments labelled; a recompute script.
5. **Sell** — `deed` contract acts as a **sale escrow**: seller lists (name moved into escrow ownership → wallet clears grants + sweeps NEAR to seller), buyer calls `buy(name)` with the price → contract transfers the name to the buyer and pays the seller in one promise chain with a refund callback on failure. Also show a sale through the official nearaccounts marketplace (Intents, mainnet) if time allows.
6. **Gated owner console** — opens only when NEP-641 resolves the connected wallet as the current owner ("sign in as `preflight.bot`").

## Architecture
| Part | Tech | Folder |
|---|---|---|
| `deed` contract: activation registry (owner-checked via registry/wallet views + callback), sale escrow (list/buy/cancel, refund on failure), events (NEP-297) | Rust, near-sdk 5.x (verify version), cargo-near, near-workspaces | `contract/` |
| Thin TLA adapter: rent, owner/lease views, `hos_grant_spend/revoke`, `hos_agent_status`, `w_resolve_auth`, `transfer_sub_account`, `hos_sweep_ft`, events | TypeScript, near-api-js (verify version) | `shared/tla/` |
| Deed runtime: per-job entitlement check (current owner == activation signer, **no cache**), payment receipt check, NEAR AI verifiable inference + signature fetch, refunds within grant | Bun + TypeScript | `runtime/` |
| Indexer + evidence ledger + recompute script | Bun + TypeScript (RPC / NEAR data APIs) | `indexer/` |
| Web: title pages, history, gated console, list/buy, "try Preflight" | React + Vite + TS + Tailwind; NEAR Connect (`@hot-labs/near-connect`) | `web/` |
| **Verifier** (the centerpiece): fresh-clone script that runs the sale and the attack matrix with direct RPC/contract calls and writes a machine-readable report with tx hashes | Bun + TypeScript | `verify/` |
Network values (registry id, TLA, contract ids, RPC) from `deploy/<network>.json` + `.env` — never hardcoded.

## Threat model (write `THREAT_MODEL.md` first — the prompt demands it)
Every way a seller (or anyone) could try to keep value, and what stops it:
| Attack | Stopped by | Proof in `verify/` |
|---|---|---|
| Seller's runtime uses its old spend grant after sale | `hos-wallet` clears grants + extensions on rotation | seller-signed spend tx fails on-chain |
| Seller re-grants itself | `hos_grant_spend` requires owner caller | tx fails `UNAUTHORIZED` |
| Seller authorizes as the name (sign-in, config change) | `w_resolve_auth` requires owner ∈ extensions | resolution panics `NOT_AN_OWNER` |
| Seller replays an old activation / NEP-641 blob | activation bound to owner + version + nonce; runtime re-checks current owner per job | runtime refuses; contract rejects stale version |
| Sale in the middle of a paid job | job accepted under owner A is completed or refunded by rule (written down); payment receipt and ownership checked at accept and at settle | scripted race test |
| Earnings redirected before sale | payments land in the name account; protocol sweep pays seller exactly once on transfer | balance assertions |
| FT balance blocks or leaks on transfer | earn in NEAR; `hos_sweep_ft` before listing; registry blocks funded transfers otherwise | test |
| Buyer pays, transfer fails | escrow refund callback | test with forced failure |
| HoS reverts the sale within 5 min | UI marks final after window; escrow holds seller payment until final (decide day 2) | documented + test if feasible |
| RPC down / stale | runtime fails closed (no job without fresh owner check) | test |
| Seller kept prompt/config | nothing secret: public config hash; residual risk stated | README |

## Day-1 falsification spike (decision gates — do this before any UI)
1. Find the mainnet `tla-registry` id (`nft_item_info` on a rented name, or the nearaccounts config) and check whether TLA exists on **testnet**.
2. Rent the cheapest suitable name(s) (two, for buyer/seller demos) — **mainnet spend needs the human's OK**.
3. Add an extension + `hos_grant_spend`; spend once; transfer the name to a second account; try the old grant from the seller's client → must fail. Try `w_resolve_auth` with the seller → must panic.
4. Check `transfer_sub_account` caller rules (owner? payable amount?) and whether a contract account can own a name and later transfer it (escrow design).
5. Check PingPay/x402 availability for NEAR.
Gates: if (3) fails → narrow the claim, don't paper over it. If (4) fails → sell via the official marketplace and document non-atomicity. If (5) fails → direct NEAR payments.

## Plan (2 → 14 Nov)
| Date | Goal |
|---|---|
| 2–3 Nov | Day-1 spike + `THREAT_MODEL.md` + `RULES` for jobs/refunds; thin TLA adapter with tests against the real contracts |
| 4–5 Nov | `deed` contract (activation + escrow) with near-workspaces tests incl. forced-failure refunds; deploy |
| 6–7 Nov | Runtime: entitlement, payment check, NEAR AI verifiable answers + signatures, grant-capped costs/refunds |
| 8 Nov | Verifier harness end to end (sale + full attack matrix) → JSON report; CI-able |
| 9–10 Nov | Web: title page, history, gated console, list/buy, try-it; indexer + evidence ledger |
| 10–12 Nov | **Real external paid calls** (target 10–20 from hackathon builders/Discord, labelled external); second Deed with a different ledger |
| 12 Nov | Live sale on mainnet (with OK) recorded; README "do X → see Y" from a clean clone |
| 13 Nov | 90-s video (one moment, split screen), X post draft, final README/what's-real table |
| 14 Nov | Freeze; human makes repo public, posts, submits |
Cut order if behind: official-marketplace sale → second Deed → x402 (use direct payments) → indexer polish. **Never cut:** threat model, verifier attack matrix, live sale with seller lockout, title page + history, gated console.

## Demo (90 s, one moment)
`preflight.bot` explains a risky tx for a paying agent (TEE-signed) → title page shows real external earnings → buyer clicks Buy → split screen: on-chain events show grants cleared + NEAR swept to seller; the seller's client fires 5 attacks, each failing with its on-chain error; the buyer activates; the next paid answer lands in the same name under the new owner.

## README must have (AI screeners first, then humans — Q-017)
What it is in 2 lines; "do X → see Y" steps runnable from a clean clone (`bun run verify` prints the attack report); threat model table; what's real vs planned; prior art (ERC-6551, ERC-7857/0G iNFT, Virtuals) and the NEAR-only difference; every NEAR feature with file paths (TLA, hos-wallet grants, NEP-641, NEP-171/177/181/297, NEP-591 global contract, NEAR AI verifiable inference, Intents if used); libraries + AI-written code disclosure (Q-005); LICENSE (MIT, present); the other project(s) this team submitted (Q-015).

## Hackathon rules that bind us (docs/HACKATHON.md)
- **Q-015: one person may be on at most 2 projects**, independent, each README naming the other. The human is already on **PatchBond** and **Handova (NEAR edition)**. → **Before submitting, the human must decide: Deed replaces one of them, or the co-founder submits Deed without the human.** Never submit three under one person.
- Independent of PatchBond (also uses NEAR AI verifiable inference): no shared code, accounts or servers.
- Testnet-only is eligible (Q-010); TLA and Intents settlement may be mainnet-only → tiny, deliberate mainnet use with the human's OK. Mainnet costs are not reimbursed (Q-008).
- Public repo by 14 Nov; X post with video from the team lead tagging @NEARProtocol #NEARHackathon; one submission per project, not editable; hosted demo a plus (keep up to 18–25 Nov).

## Hard rules for agents
- Never, without the human's explicit confirmation **at the time**: create/make public a repo, post on X, **rent names or spend on mainnet**, sign mainnet transactions, deploy to mainnet, submit.
- Never create or invent the team's NEAR mainnet account. Never print/commit secrets (`.env` git-ignored; `NEARAI_API_KEY` there). Never commit the submission payload.
- Never overclaim: every security sentence in README/video must map to a row in the threat model with a passing verifier check.
- User-facing errors say what went wrong and what to do next.

## Git identity and pushing (set by the team 2026-11-03)
- Remote: `origin` = https://github.com/codemagician1949/Deed (public). The **only** contributor is `codemagician1949`.
- Repo-local identity (already set): `codemagician1949 <278717673+codemagician1949@users.noreply.github.com>` (GitHub no-reply). Don't touch the global config; never commit a personal email.
- **Before every push**: run `gh api user --jq .login`; if it isn't `codemagician1949`, run `gh auth switch -h github.com -u codemagician1949` first. (This machine has many gh accounts logged in.)
- **Before every push**: `git log --format='%an %ae %cn %ce %b' | grep -iE "claude|anthropic"` must print nothing, and every author/committer must be codemagician1949. No Co-Authored-By trailers.
- Small descriptive commits (AI judges read history).

## Decisions log
- **2026-11-02 — Testnet only, all through (team decision).** No mainnet spend. TLA isn't deployed on testnet (`registry.hos.testnet` doesn't exist), so we deploy the House of Stake contracts ourselves on testnet from the **exact mainnet bytecode**, under team-owned testnet accounts, and the verifier prints code hashes next to mainnet's. The README says plainly: "TLA on testnet = our deployment of the audited mainnet code; not House of Stake's." Mainnet open questions (renting names) are closed.
- **2026-11-02 — UI bar:** "astonishing", well animated (`motion`), built on shadcn/ui, and understandable by anyone: plain words first, chain jargon behind a "details" toggle.
- **2026-11-02 — Threat model v1 approved**; `deed` contract (activation + escrow + capped royalty) done with 9 sandbox tests (`contract/test.sh`).

## Open questions for the human
1. ~~Q-015~~ — answered 2026-11-03: "Deed stands on its own" (README: no other submissions by this team).
2. ~~Mainnet spend~~ — closed: testnet only.
3. Team lead name/email/X for the submission; prize NEAR account.
4. New GitHub repo name/owner (e.g. `PatchBond`-independent org).
