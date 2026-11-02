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
