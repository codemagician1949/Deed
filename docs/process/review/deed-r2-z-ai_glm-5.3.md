`SCORE: 8.3`

## Sub-scores

| Dimension | Score | Notes |
|---|---|---|
| Originality / 1-of-1-ness | 9 | "NFT that is a revenue-generating AI service with cryptographic handover" is genuinely novel; the honest threat-model framing ("seller's knowledge is worthless by design") is rare. Not another membership NFT. |
| Fit to track & organizers' wishes | 9 | The `nfts` prompt explicitly points at TLA contracts and says "there's no SDK yet — build on the contracts directly." This does exactly that, plus NEP-171, sub-accounts, dynamic behavior. Near-perfect fit. |
| Depth of NEAR-specific tech | 8.5 | TLA keyless accounts + `w_resolve_auth` (NEP-641) + `hos_grant_spend` + fail-closed ownership re-check per job — this is only possible on NEAR (named accounts, rotatable keys, NFT-as-account). Loses a point because the ML-DSA/post-quantum material in the "verified facts" is unused window dressing, and Intents/MPC settlement is PQ-incompatible anyway. |
| Real-world usefulness | 7 | "NEAR explainer agent" is a demo-grade service; the *mechanism* (sellable agent-with-reputation-and-treasury) is the real product. Judges may ask "who buys this?" — the answer is thin. |
| Demo impact | 8.5 | Split-screen "5 seller attacks fail with on-chain errors" is a great 90 seconds — concrete, adversarial, verifiable. The attack harness is the right centerpiece. |
| Feasibility in 12 days | 7 | No SDK for TLA; you're reading audited contract source and writing a typed adapter. The handover state machine (freeze → drain → revoke → sweep → list → resume) has many failure modes to test. Strong Rust/full-stack team + AI agents makes it plausible, but this is the tightest 12-day build in the track. |
| Risk of technical show-stoppers | 7 | Risks: TLA marketplace listing via Intents may not exist as assumed (does the TLA marketplace actually support Intents settlement, or is that hand-waved?); NEP-641 resolution semantics on TLA's `w_resolve_auth` need verification against the actual contract, not the docs; x402/PingPay integration is a third moving part. None fatal, but each could cost days. |

## Lead track & crowding

`nfts` is the right lead track — the prompt literally describes this pattern (NFT-as-account, control passing on transfer, threat model for the transfer). Expect the typical field: membership/club NFTs, royalty-splitting NFTs, a few ERC-6557-clone attempts, maybe one TLA-based name-market project. Most will be shallower than this. Secondary tracks worth adding to the array: `agents` (an agent that earns and is itself an asset) and `security` (the attack harness is a policy/spending-limit story). `agents` is likely the most crowded track; `nfts` gives better odds. Keep `nfts` as lead.

## 3 biggest weaknesses

1. **The service is a prop.** "NEAR explainer answering paid questions" will not impress as a business; if judges sense the agent exists only to be sold, the "NFTs That Do Something" claim reduces to "NFT that has a wallet and a test suite." The earnings stream must be real enough (even if small, externally sourced) that the sale transfers something of value.
2. **Handover state machine complexity vs. 12 days.** Freeze/drain/revoke/sweep/list/resume plus fail-closed re-checks plus a scripted attack harness plus a gated page plus a history view is a lot of surface. The likely failure mode is a half-tested state machine where one attack path actually succeeds — which, in a track whose prompt says "write down every way a seller could keep the money," is disqualifying.
3. **Unverified integration assumptions.** TLA marketplace + Intents listing, `w_resolve_auth` behavior on ownership change mid-job, and x402/PingPay payment rails are each asserted, not demonstrated. Any one being wrong forces a redesign under deadline.

## Changes to reach 9+

- **Make the earnings real and external.** Have the agent sell 10–20 actual paid answers to hackathon participants / Discord during the build window (even at $0.50 via Intents), labeled as external in the evidence ledger. A sale that transfers *demonstrated* revenue beats a sale that transfers a demo.
- **Shrink the state machine, harden the harness.** Cut "freeze → drain in-flight jobs" to a simpler two-phase model (revoke grant + sweep, with in-flight jobs refunded by the runtime's escrow). Spend the saved days making the attack harness exhaustive and CI-reproducible: every attack with its on-chain error, a fuzzed transfer-during-job test, and the "sale in the middle of a payout" test the prompt explicitly demands.
- **Verify the two load-bearing facts in week 1, not week 2:** (a) read the actual TLA contract source for `w_resolve_auth` and confirm per-job re-resolution semantics and what happens to outstanding grants on transfer; (b) confirm the TLA marketplace's actual settlement path. If Intents listing doesn't exist, fall back to an atomic contract-mediated sale (buyer deposits, contract transfers NFT, seller paid in same receipt) — arguably a *better* demo since it's atomic.
- **Add the per-NFT history view the prompt requires** (earnings, payouts, holder lineage) — it's cheap and explicitly requested; missing it loses points for a trivial reason.
- **Drop the post-quantum framing entirely** unless you use it. One honest paragraph in the README on why the MPC bridge layer is not PQ-safe would show judgment; claiming PQ relevance you don't have invites a judge ding.

## Factual/technical errors

- **"NEP-641 authorizations stop resolving" for the seller** — correct only if `w_resolve_auth` delegates to current owner *and* the runtime re-checks per job with no cache. The idea asserts this; verify against contract source. If TLA caches or if authorizations are bound to a session token minted earlier, the fail-closed claim has a hole.
- **"Transfers outside Deed fail closed"** — only if every privileged action goes through ownership re-check. Any path where the runtime holds a long-lived secret (the "per-owner session mint") must expire that secret on ownership change; otherwise the old owner's session survives until expiry. State the expiry bound explicitly.
- **"List on the TLA marketplace (Intents)"** — unverified; the TLA marketplace's settlement mechanism needs confirmation. Don't state it as fact in the README.
- **"Sweep earnings to seller"** — if earnings land in the account the buyer now owns, the sweep must occur *before* ownership transfer in the same atomic sequence, or the buyer can refuse/delay it. The state machine ordering (sweep before list) is right, but a non-atomic gap between sweep and sale means post-sweep earnings accrue to the buyer — fine, but say so; "all future earnings go to buyer, all pre-sale earnings to seller" needs a clean on-chain cutoff, and in-flight jobs straddling the sale are exactly where this gets messy.
- Minor: the ML-DSA facts are accurate as stated but irrelevant to this build; don't let them leak into the pitch as implied security properties.