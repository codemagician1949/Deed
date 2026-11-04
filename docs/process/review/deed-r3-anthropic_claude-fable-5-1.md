SCORE: 6.5

## 1. Verdict in one paragraph

This is the most prompt-literal, evidence-first entry the `nfts` track is likely to see: it answers every bullet of the organizers' example prompt (control-on-transfer explanation, gated holder page, per-NFT history, mid-payout transfer test, threat model first) and it does so on the one primitive the organizers explicitly flagged as new and SDK-less (Top Level Accounts). That gets it into the top three almost by default. What keeps it from a confident 1st is that the invariant you are "proving" is enforced almost entirely by houseofstake's audited `hos-wallet`, not by your code; your own contract is a thin activation registry plus an escrow whose main reason to exist is working around the fact that you are not a registered venue. The product on top (pay-a-few-cents tx explainer) is plausible but small, and the economic story ("why would anyone buy `preflight.bot`?") is asserted, not shown. Judges who are impressed by rigor will rank it 1st; judges who ask "what did *you* build?" will rank it 2nd behind something with a more original contract.

## 2. Sub-scores

| Dimension | Score | Why |
|---|---|---|
| Originality / 1-of-1 | 7 | "Sellable AI agent as NFT" is ERC-7857 / Virtuals territory (you cite it, good). The NEAR twist — NFT *is* the account, wallet wipes grants on rotation — is genuinely 1-of-1 on NEAR, but the twist is the platform's, not yours. The verifier-as-centerpiece framing is the original part. |
| Track fit | 9 | Maps 1:1 onto the prompt. Uses the exact contracts the organizers linked. Risk: so does everyone who read the prompt. |
| NEAR-specific depth | 7.5 | TLA + NEP-641 + NEAR AI Cloud TEE + named-account key rotation are all NEAR-only. But you are *consuming* depth, not *adding* it. The 2.13/2.14 PQ/ML-DSA facts in your header are unused — dead weight in the README unless you do something with them. |
| Real-world usefulness | 5 | Preflight is a fine micro-service; agent wallets would use it. But 79 names rented system-wide and a resale market for AI-service names is speculative. "10–20 external paid calls" will read as friends-and-family. |
| Demo impact | 7 | Split-screen "5 attacks fail with on-chain errors" is strong for technical judges. For a 90-second video it is dense and the "service" part (a text explanation) is visually flat. No one gasps at a JSON report. |
| Feasibility (12 days) | 6.5 | Small Rust contract, runtime, verifier, title page, console, threat model, two deeds, real mainnet sale. Doable with agents, but no SDK, cross-contract promise chains with refund callbacks, NEP-641 with no wallet support, and a 5-minute revert window to reason about. Expect 3–4 days lost to TLA quirks. |
| Show-stopper risk | 6 (moderate) | Escrow contract as NFT owner (does `hos-wallet` accept a contract account as sole extension? can a contract complete NEP-641 flows? probably irrelevant, but check). TLA on testnet unknown. Mainnet-only verifier = AI screeners can't reproduce. x402-on-NEAR is probably vapor; drop it. |

## 3. Track choice and crowding

`nfts` is right. It will be moderately crowded (NFT tracks always draw volume) but low in quality: expect ~60% "membership NFT with a sub-account treasury" clones of the example prompt, a few dynamic-NFT games, and 2–4 serious TLA builds. Your real competition is another team that builds a *novel contract* on TLA (e.g., sharded NFT items, NEP-199 royalties flowing to a name, name-as-DAO-member). Against those, your rigor wins only if your own contract also does something non-trivial.

Secondary tracks to list: `agents` (the name earns and sells its service) and `security` (Preflight is literally pre-sign risk flags; the attack matrix is agent-security content). Do **not** lead with `agents` — that track will be crowded with flashier agent-commerce demos and your NFT-transfer invariant is irrelevant there. `security` as a secondary is worth it: Preflight alone could place 2nd/3rd there with zero extra work. `open` is a waste.

## 4. Three biggest weaknesses

1. **Thin owned surface area.** Grant-clearing, extension wiping, sweeping, NEP-641 resolution, the revert window — all houseofstake. Your contract is a registry (one map) plus an escrow that exists because you can't be a venue. A judge will write "excellent test suite for someone else's wallet." You need your contract to enforce at least one invariant the audited wallet does not.

2. **The buyer buys a name and a config hash, not a running service.** The runtime is operator-run off-chain. After the sale the seller's server is still up; the buyer must deploy their own. "Keeps earning into the same name" is true only if the buyer does ops. Your honest framing admits this, but it undercuts the headline "a NEAR name that *is* a working AI service." If the compute isn't bound to the name, the NFT does less than you claim.

3. **Escrow edge cases contradict "proof."** (a) On escrow→buyer rotation, `sweep_to(outgoing)` pays the *escrow*, not the seller — earnings accrued during listing must be forwarded or they silently go to your contract. (b) The lease authority can revert the escrow→buyer rotation for 5 minutes; if you pay the seller atomically, a revert leaves the buyer with nothing. A verifier that doesn't test the revert path is not proving finality, it's assuming it. (c) Earning in NEAR instead of USDC "because transfers are blocked otherwise" is a workaround that signals you couldn't integrate with the venue system — judges from houseofstake will notice.

## 5. Changes that would push this to 9+

- **Bind compute to the name.** Run the Preflight runtime in a TEE (NEAR AI Cloud confidential VM, or a Dstack-style enclave) whose *only* credential is a wallet extension / function-call key on the name. Then the sale genuinely kills the service: wallet wipes the extension → enclave can no longer sign responses as the name → buyer re-grants to re-activate. Show the attestation and the key-wipe on the title page. This turns "the NFT is the service" from marketing into a mechanism and removes weakness #2.

- **Make your contract enforce something the wallet doesn't:**
  - Revert-window-aware settlement: escrow holds buyer funds until `rotation_seq` is stable past the 5-minute window (or until the next rotation is observed), with buyer refund if the lease authority reverts. Test it in the matrix.
  - NEP-199 `nft_payout`-style royalty: the Deed template creator takes a cut on every resale. "Earn royalties" is in the track tagline and you currently don't do it.
  - Forward escrow-period earnings to the seller (fix the sweep bug) and show the tx.

- **Become, or use, a venue.** Either register the deed contract as a venue (if the registry allows it — check `tla-registry` for a permissionless path), or use the existing nearaccounts listing flow with `"kind":"agent"` and only add your settlement logic. Then earn in USDC. Listing a Deed on the real nearaccounts resale page with real metadata is a better demo beat than your own Buy button.

- **Reproducibility for AI screeners.** Ship a near-workspaces sandbox that deploys the TLA contracts from source and runs the full verifier offline (`bun run verify --sandbox`), plus `--mainnet` mode that replays against recorded tx hashes. A mainnet-only verifier that needs a funded key will fail the screening step, and that step runs before any human sees your attack matrix.

- **Prove liquidity, not just earnings.** Do one *real* resale to an unaffiliated buyer for real NEAR and put the tx on the title page. One arms-length sale beats 20 demo calls.

- **Second template that's visually different** (e.g., `translate.bot` or a NEP-641 "sign-in-as-name" gatekeeper) so judges see a platform, not a single hand-built artifact.

- **Cut:** x402 (not credibly on NEAR in 12 days), the PQ facts (irrelevant unless you add "buyer activates with an ML-DSA key" as a 1-line flourish — only if trivial), and "sale mid-paid-job" as one of seven — promote it to the headline test since the prompt asks for exactly that.

## 6. Factual / technical issues

- **Escrow sweep direction:** as noted, the wallet sweeps to the *outgoing* owner on each rotation. In your two-rotation flow, the second sweep's recipient is the escrow contract. Your claim (3) "NEAR earnings settle to the seller automatically"