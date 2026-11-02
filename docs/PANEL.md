# How Deed was chosen — NEAR AI panel (2026-11-02)

12 ideas were scored by four models via NEAR AI Cloud with the same prompt ("chance this wins 1st place in its lead track if executed as planned", 0–10). Briefs and critiques for Deed are in `docs/review/`. Other ideas' files live in the session scratchpad.

| Rank | Idea | Track | Kimi K3.1 Pro | GLM-5.3 | GPT-6 Astra | Claude Fable | Avg |
|---|---|---|---|---|---|---|---|
| 1 | **Deed v2** — AI service in a NEAR name; seller locked out on sale | nfts | 7.7 | 8.3 | 7.2 | 6.5 | **7.42** |
| 2 | QLOCK — coins only a post-quantum signature can move | memecoins | 8.0 | 7.4 | 6.6 | 7.1 | 7.28 |
| 3 | Deed v1 — sell an AI agent like a house | nfts | 7.8 | 8.0 | 6.7 | 6.5 | 7.25 |
| 4 | $QDAY — PQ registration + Doomsday Clock | memecoins | 7.8 | 7.4 | 6.7 | 6.5 | 7.10 |
| 5 | Heirloom — child's NFT-account, 18-year PQ lock | nfts | 7.7 | 7.4 | 6.5 | 6.3 | 6.98 |
| 6 | Q-Day Thesis | thesis | 8.1 | 7.4 | 6.3 | 6.0 | 6.95 |
| 7 | Lifeboat — first PQ wallet | security | 7.8 | 7.6 | 6.8 | 4.5 | 6.67 |
| 8 | JUBILEE — Sabbath + Jubilee memecoin | memecoins | 7.0 | 7.4 | 5.6 | 6.0 | 6.50 |
| 9 | Bazaar of Names — game | games | 7.6 | 6.5 | 6.4 | 5.0 | 6.38 |
| 10 | Commons Keys — DAO holds web2 keys | social | 6.2 | 6.5 | 6.6 | 5.5 | 6.20 |
| 11 | Exit Door Thesis | thesis | 7.7 | 4.5 | 6.5 | 5.0 | 5.92 |
| 12 | Lanes — 1,000-agent swarm via gas keys | swarms | 6.8 | 6.8 | 5.8 | 4.0 | 5.85 |

## What every reviewer praised about Deed
Track fit 9–9.8 (it is the `nfts` prompt elevated to agents); NEAR-only depth 8.5–9.3 (TLA + hos-wallet + NEP-641 + NEP-591 + Intents + verifiable AI); demo impact 8.5–9.2 (seller locked out live while the agent keeps earning); `nfts` expected to be less crowded than `agents`, and few teams will touch TLA because there's no SDK.

## What cost points (and the v3 answer — see CLAUDE.md)
| Critique | v3 answer |
|---|---|
| "Seller provably loses everything" overclaims; seller may keep copies | Claim only what is enforced; design the service so there are no seller secrets; publish residual risks |
| Old spend grant may survive transfer; runtime checks only bind an honest runtime | **Verified in source:** `apply_rotation` clears all spend grants and removes all extensions on transfer. Harness proves it with direct calls from the seller's own client |
| Handover is a fragile 7-step off-chain state machine | On-chain: the wallet clears grants and sweeps NEAR to the seller on Sale/Transfer. Deed adds a small **escrow/venue-style sale contract** so payment and transfer are one promise chain; only FT sweep + revert window remain, both handled explicitly |
| No plausible buyer / self-paid revenue | Pick a service whose value compounds with name + track record; get real external paid calls during the build; evidence ledger labels demo vs external |
| Too much scope, unverified TLA semantics | Day-1 falsification spike with decision gates; thin adapter, not an SDK; one service template |
| Missing the prompt's literal asks (gated page, per-NFT history, transfer tests incl. sale mid-payout, threat model first) | All are explicit deliverables |
| Prior art ERC-6551 / ERC-7857 / Virtuals | README section naming them and the NEAR-only difference |

## Re-score — Deed v3 (2026-11-02, after the `apply_rotation` findings)
| Version | Kimi K3.1 Pro | GLM-5.3 | GPT-6 Astra | Claude Fable | Avg |
|---|---|---|---|---|---|
| v1 | 7.8 | 8.0 | 6.7 | 6.5 | 7.25 |
| v2 | 7.7 | 8.3 | 7.2 | 6.5 | 7.42 |
| **v3** | **8.3** | 8.2 | **7.8** | 6.5 | **7.70** |
Still #1 of 13 entries, now clearly ahead (next: QLOCK 7.28). Critiques in `docs/review/deed-r3-*`.

### What still costs points (fix these to pass 8.5)
1. **Escrow is not atomic.** NEAR receipts don't roll back; seller→escrow and escrow→buyer are two rotations, each revertible for 5 min; on escrow→buyer the sweep pays the *escrow*, not the seller. → Design the sale as an explicit state machine with every failure branch (payment accepted/transfer fails; transfer ok/payout fails; callback out of gas; revert after payout; retries), hold the seller's payment until the revert window closes, forward listing-period earnings to the seller, and test each branch. Or, if the day-1 spike shows a simpler path, sell via the official marketplace and document it.
2. **Thin owned surface.** The lockout is House of Stake's code. → Make the `deed` contract enforce an invariant the wallet doesn't: e.g. per-job escrowed payments with refund-if-unanswered, an on-chain job/receipt ledger the title page reads, finality-gated payout, and activation bound to `rotation_seq` so a stale activation can never resume.
3. **The buyer gets a name, not a running service.** → Make the runtime bound to the name, not to an operator: one hosted, open-source multi-tenant runtime that serves whichever owner the chain says (activation keyed by name + rotation_seq), so the buyer's service continues with zero ops; publish its code hash.
4. **"Preflight" looks like an AI wrapper.** → Lead with deterministic analysis (decode actions, known-contract list, approval/unlimited-allowance detection, drain patterns from receipts) and use the model only to explain; publish accuracy on a labelled set of risky/benign txs.
5. **Real buyers/revenue.** External paid calls labelled; a second Deed with a different ledger.
