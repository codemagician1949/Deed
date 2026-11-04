**SCORE: 8.0**

## Sub-scores

| Dimension | Score | Notes |
|---|---|---|
| Originality / 1-of-1-ness | 9 | "Agent as a sellable asset with clean title" is genuinely novel. Virtuals et al. sell tokens, not the business. The title-page/verifiable-P&L framing is fresh. |
| Fit to track & organizers' wishes | 9.5 | This is almost a restatement of the `nfts` prompt's soul (NFT-as-account, control passes on transfer, threat model first) elevated to the agents era. Organizers will feel *read*. |
| Depth of NEAR-specific tech | 9 | TLA + NEP-591 global contract + NEP-641 offchain auth + TEE inference + Intents resale. Almost none of this is portable to another chain. This is what wins hackathons. |
| Real-world usefulness | 7 | Real problem, but the buyer-side market for "buy a working agent" is speculative in 2026. It's a strong *primitive*, not yet a business. |
| Demo impact | 8.5 | Seller locked out in real time while the agent keeps earning under the same name is a great 90 seconds — *if* the transfer flow actually works live. |
| Feasibility in 12 days | 6 | This is the weak point. You're building: a TLA SDK from scratch (no SDK exists — that's a feature for "hard tech" points but a schedule killer), a NEP-641 resolver, a TEE vault, an x402-earning agent, a title page, and a live transfer demo. That's 4 hard integrations, not one. |
| Risk of technical show-stoppers | 6 | TLA contracts are live but the "no SDK" warning in the prompt is the organizers telling you the edges are sharp. NEP-641 resolver behavior on a TLA wallet, vault re-wrap on transfer, and session invalidation are all unproven in the wild. Any one failing kills the demo. |

## Lead track & crowding

`nfts` as lead is correct — the core artifact is "ownership with behavior," and the prompt literally describes the transfer-control problem you're solving. Expect typical `nfts` entries: membership NFTs with sub-account wallets (the prompt's example, done 5–10 times), dynamic art NFTs, credential NFTs. Most will be shallow NEP-171 + frontend work. Your entry outclasses that field on depth *if it runs*.

Cross-listing `agents` is right, but don't expect to win there — the `agents` track will be full of general-contractor/payment-agent builds using the Agent API, and yours is an *ownership* story, not a commerce story. A secondary listing in `security` is arguably stronger than `agents`: "seller provably loses access" is a policy/spending-limits story (`hos_grant_spend`, revocation, threat model). I'd list `nfts`, `agents`, `security`, and possibly `open` — the grand-prize angle ("what does ownership of AI mean") lives in `open` framing.

## 3 biggest weaknesses

1. **Scope vs. 12 days.** The TLA SDK alone could eat the hackathon. If the transfer demo doesn't run live on testnet, you have a well-documented architecture and no product — and human judges at this level punish that hard. You must ruthlessly decide what's demo-critical (mint → earn → sell → locked out) vs. nice-to-have (full SDK, generic vault, refund-rate analytics).
2. **The vault/secret-rotation story is the soft underbelly.** Your threat model admits it: any third-party API key the seller pasted is still known to them. A "rotation checklist enforced before listing" is a UX promise, not a mechanism. A sharp judge will ask: "what stops the seller from keeping a copy of the agent's *brain* (prompt, fine-tune, data) even if the keys rotate?" You need a crisp answer — e.g., the agent's competitive value lives in on-chain reputation + the TLA name, not the prompt, so a copied prompt is a shell without the title. Say that explicitly.
3. **Unverified integration claims.** You assert `hos_grant_spend`'s exact signature, NEP-641 delegation-to-current-owner semantics on the TLA wallet, and "transfer invalidates sessions." If any of these behave differently (e.g., `w_resolve_auth` isn't wired to the ownership account, or grants don't auto-revoke), the architecture needs rework mid-hackathon. Day 1 must be a spike proving the TLA + NEP-641 + grant-revoke path end-to-end before anything else is built.

## Changes to reach 9+

1. **Cut the SDK to a thin client.** Don't build a general TLA SDK; build ~200 lines of typed functions for exactly the 6 calls you need. Frame it as "reference integration," open-source it, move on. Saves 3–4 days.
2. **De-risk the demo with a fallback path.** Build the transfer flow against the TLA contracts on testnet first; if NEP-641 resolution through the TLA wallet has issues, fall back to owner-signed authorization (current owner signs, resolver checks current owner from chain state) — same security story, less novel plumbing, still demonstrable. Have this decided by day 3.
3. **Make the "seller keeps nothing" proof the centerpiece, not a bullet.** A live split-screen: seller's terminal tries to authorize a vault read / spend / x402 call and gets rejected with the on-chain reason, while the buyer's succeeds — timestamped against the transfer tx. Judges remember the moment the door slams.
4. **Add one real buyer-side use case.** "Buy a revenue-earning repo-summarizer for $X, its verifiable 30-day revenue is $Y" — a concrete price-to-earnings framing on the title page. This converts the demo from "clever mechanism" to "new market," which is grand-prize language.
5. **Write the threat model as a README section with a table**: attack vector → mechanism → what's guaranteed vs. best-effort (be honest about pasted-key rotation). The prompt explicitly asked for the threat model first; honoring that structure will be noticed.

## Factual/technical checks

- TLA / House of Stake / `hos-wallet` / audited on mainnet / no SDK: consistent with the track prompt's own note — treat the prompt as ground truth, but verify the `hos_grant_spend` signature against the actual contract on day 1; your spec quotes it with unusual precision for something with no SDK.
- NEP-641 "Final, Aug 2026": I can't confirm this; NEP-641 is not a standard I can verify as final. If it's actually draft/pending, say "draft" in the README — judges will check, and an inflated status claim costs credibility.
- "TLA blocks direct transfer of a funded account unless via a registry venue": plausible (prevents draining via transfer), but verify; if wrong, your sale-time fund-sweep story changes.
- x402/PingPay settling to a NEAR recipient via Intents: matches the `agents` track note. Fine.
- One real gap: "old runtime sessions die" — TEE session invalidation on transfer is *your* system's job, not the chain's. The transfer event must be polled/webhooked by your runtime to kill sessions; there's a window between transfer and detection. Acknowledge it and bound it (short session TTLs, e.g. 60s), or a judge will find it.

**Bottom line:** This is a top-3 idea on paper in the `nfts` track with a genuine shot at the grand prize conversation. Whether it wins 1st depends almost entirely on whether the live transfer-and-lockout demo works by judging day. Cut scope to protect that demo and it's a 9.