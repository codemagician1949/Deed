`SCORE: 8.2`

## Sub-scores

- **Originality / 1-of-1-ness: 9** — "NFT whose transfer provably evicts the seller's AI agent and settles earnings" is a genuinely novel framing. ERC-6551/7857 comparisons are honest and the differentiator (audited wallet enforces the lockout, not your code) is real. Most `nfts` entries will be membership NFTs with sub-account wallets — literally the track's example prompt. This is a different animal.
- **Fit to track / organizers' wishes: 9** — The track hint is "NFTs as accounts, sub-accounts, NEP-171." This builds directly on the TLA contracts the organizers themselves linked in the prompt. That's about as on-brief as it gets.
- **Depth of NEAR-specific tech: 8.5** — TLA contracts, NEP-641 offchain auth, rotation semantics read from audited source, escrow via promise chains. Only NEAR can do "sell the account, address unchanged, agent keys wiped on-chain." Docked because the PQ/ML-DSA facts in the preamble are decorative — they don't appear in the actual design.
- **Real-world usefulness: 6.5** — "Preflight" (pay a few cents for a tx risk explanation) is a plausible agent service but thin as a business. Its real function is to be a revenue-generating proof for the ownership-transfer invariant. Judges will notice the service is a prop.
- **Demo impact: 9** — Split-screen sale + 5 live failing attacks from the seller's own client is exactly what a harsh judge wants to see. The attack matrix is the demo.
- **Feasibility in 12 days: 7** — Small Rust contract + verifier + title page + a TEE-signed inference service is a lot. The falsification spike is smart, but the schedule has no slack for the spike *failing* a gate and forcing a redesign at day 5.
- **Risk of show-stoppers: 6.5** — Real risks: (a) escrow contract owning a TLA name may hit registry/venue rules you haven't fully verified; (b) only 79 names rented system-wide — you're building on a near-empty protocol with no SDK, so every integration is archaeology; (c) NEP-641 gated console depends on wallet-side support that may not exist for TLA names; (d) "10–20 real external paid calls" in 12 days is optimistic — external demand for a brand-new service is not something you can schedule.

## Lead track & crowding

`nfts` is right. The track prompt literally describes the membership-NFT-with-sub-account-wallet, so expect many entries of exactly that shape — most shallow, a few competent. This submission beats the median hard because it inverts the prompt's core question ("what stops the old owner keeping access?") into its entire product. `open` is a plausible fallback (chain abstraction, experimental) but you'd lose the organizers' explicit TLA affinity and face more diverse competition. Stay in `nfts`; consider adding `agents` or `security` as secondary tags since the attack matrix is agent-security content.

## 3 biggest weaknesses

1. **The revenue service is the weakest part.** "Preflight" is a wrapper around one model call. Judges allergic to hype will ask: who actually pays for this, and did the "external earnings" come from anything other than your own test wallets? If the title page's "real external earnings" is 15 calls from your other Deed, it reads as staged.
2. **Escrow-by-contract is unproven on TLA.** The registry blocks transfers of names holding allow-listed FTs unless via a registered venue — your escrow must become a venue or avoid those assets, and `transfer_sub_account` semantics for contract-owned names need the day-1 spike to confirm. If escrow ownership fails, the centerpiece sale flow degrades to a direct transfer and the demo loses its one-transaction elegance.
3. **12-day schedule assumes zero spike failures.** Five decision gates, any of which could invalidate the design, plus a full Rust contract, TEE inference integration, verifier, title page, and threat model. Something will slip; the plan doesn't say what gets cut first.

## Changes to reach 9+

- **Make the attack matrix the product, not the appendix.** Ship the verifier as a standalone, reusable tool ("run it against *any* TLA name, not just ours"). A generic `tla-verify` that auditors and marketplaces could use post-sale is real-world usefulness that survives even if Preflight has zero organic demand. This converts weakness #1 into a strength.
- **Pre-commit a fallback for the escrow gate.** Before day 2 ends, either confirm contract-owned names work or pivot to: seller lists → buyer pays escrow contract → escrow calls registry transfer with seller as caller in a callback. Write the fallback in the README so a spike failure is a documented branch, not a scramble.
- **Guarantee external demand mechanically.** Instead of hoping agents find Preflight, integrate it where traffic already exists: a near.social widget, a NEAR AI agent skill, or a small x402/HTTP endpoint that any agent can hit. One integration with an existing agent marketplace beats 20 calls from your own second Deed.
- **Cut scope to protect the demo.** Drop the second Deed and the NEP-641 gated console if time tightens; keep verifier + title page + sale-with-attacks. The 90-second demo is the score; everything else is README material.
- **Use the PQ facts or delete them.** One cheap win: sign the verifier's report / config hash with ML-DSA-65 via `@noble/post-quantum` and verify with the `ml_dsa_verify` host function on-chain — a one-day feature that makes the "post-quantum-safe ownership transfer" story concrete instead of preamble trivia.

## Factual/technical errors

- No outright errors found — the rotation semantics, sweep-to-seller, 5-minute revert, and NEP-641 resolution scope are consistent with the described audited source. Two cautions: (1) "USDC avoided because it blocks non-venue transfers" — verify the current allow-list contents at spike time; allow-lists change. (2) The claim "the service keeps nothing secret worth knowing" is asserted, not enforced — a config hash is public but the *runtime* holding model API credentials is a secret the seller could keep; state explicitly that credentials live in the buyer-replaceable runtime and the seller's runtime is simply no longer paid or authorized, rather than implying no data exposure exists.