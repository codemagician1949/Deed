SCORE: 7.7

| Dimension | Score | Assessment |
|---|---:|---|
| Originality / 1-of-1-ness | 8.3 | Selling a name, operating account, agent authorization and earnings history as one asset is substantially better than another dynamic-metadata NFT. The conceptual leap is not unprecedented—transferable businesses and token-bound accounts exist—but TLA makes the NEAR implementation unusually clean. |
| Fit to track / organizers’ wishes | 9.5 | Almost a direct hit: NEP-171, account-NFTs, sub-account-like control, earnings, transferable access and transfer-security tests. It improves on the example prompt rather than merely implementing it. |
| NEAR-specific depth | 9.0 | TLA, `hos-wallet`, owner-delegated NEP-641 authorization, scoped spend grants and Intents settlement form a coherent NEAR-native stack. No decorative Chain Signatures or post-quantum detour. |
| Real-world usefulness | 5.3 | A paid NEAR-transaction explainer is a weak business. Public RPC data plus an LLM does not obviously justify payment, and twelve days cannot produce meaningful reputation or an organic earnings stream. The primitive is useful; the chosen service mostly demonstrates it. |
| Demo impact | 8.8 | A sale followed by visible, independently reproducible seller attacks is an excellent judging demo—provided the failures come from direct adversarial transactions, not a UI merely displaying “access denied.” |
| Feasibility in 12 days | 6.6 | The narrowed template and eight-call adapter help. Nevertheless, undocumented TLA integration, marketplace sale mechanics, PingPay, AI Cloud, ownership races and a credible attack harness leave little slack. |
| Risk of technical show-stoppers | 6.5 | **Higher means more risk.** The largest risks are misunderstood TLA grant/revocation semantics, non-atomic marketplace handover, and discovering that off-chain runtime checks cannot deliver the claimed security for externally transferred Deeds. |

## 3. Track choice and expected competition

`nfts` is clearly the right lead track. It is likely less crowded than `agents`, `business` and `defi`, and many entries will be superficial variations on membership NFTs, NFT wallets or dynamic metadata. This should stand out if the transfer path actually works on mainnet.

Use `agents` and possibly `business` as secondary tracks, but neither offers better odds: both will attract numerous polished agent-commerce demos, and the paid explainer is too thin to lead there. `security` would overweight the harness while weakening the product story. `open` would waste an unusually precise track fit.

## 4. Three biggest weaknesses

1. **The security claim is stronger than the architecture.**  
   `w_resolve_auth` checks in your runtime make *your correctly behaving runtime* fail closed. They do not make the NEAR protocol reject every action by the seller, and they do not neutralize an already-valid agent spend key against a seller-controlled replacement runtime. “From that block on” is also incompatible with purely observed off-chain ownership changes and in-flight jobs.

2. **The demonstration does not establish an asset worth buying.**  
   Self-paid jobs and labelled demo receipts prove accounting, not demand. After twelve days, “reputation, earnings stream and verifiable track record” will mostly be manufactured demo history. Judges may see an excellent custody-transfer mechanism wrapped around a service nobody would purchase.

3. **The handover has too many integration seams for the schedule.**  
   Freezing is apparently runtime-level, earnings sweep and marketplace listing are separate operations, ownership change is observed asynchronously, and service resumption depends on a new buyer grant. A failure in any seam breaks the headline invariant. A polished hosted demo will not compensate for missing adversarial tests at these boundaries.

## 5. Changes that could raise this to 9+

- **Make revocation an on-chain precondition of every sale, including external transfers.**  
  Prefer short-lived or per-job spend grants rather than a durable runtime key. On buyer takeover, require an explicit on-chain “activate service” transaction that registers the buyer’s runtime and issues a fresh grant. Until then, direct withdrawals using old grants must be impossible or expired. Publish a matrix covering Deed sale, direct TLA transfer, in-flight job and malicious replacement runtime.

- **Narrow the claim to what is actually enforced.**  
  Say: “Deed-mediated sales revoke the old grant before listing; all Deed runtime jobs re-resolve ownership; external transfers disable Deed-managed service until buyer activation.” Then demonstrate each statement independently. Do not say the protocol universally rejects the seller unless direct on-chain calls prove it.

- **Replace simulated commerce with one uncomfortable real test.**  
  Get at least one external tester to pay without a scripted walkthrough, and include questions where the agent must trace receipts, logs and cross-contract calls rather than summarize an account page. Publish cost, latency, refund behavior and wrong-answer handling. One real payment is worth more than fifty self-funded receipts.

- **Build the attack harness as a standalone verifier, not demo theater.**  
  A fresh-clone script should create two wallets, fund them, execute the sale, send direct contract/RPC attack transactions and assert exact errors and balances. Include sale between authorization and inference, duplicate settlement, refund-after-transfer, stale owner response, revoked-grant withdrawal and unavailable RPC. Provide a machine-readable report plus block hashes and transaction links.

- **De-risk or simplify settlement immediately.**  
  On day 1–2, prove the entire TLA purchase/transfer/revocation sequence on testnet or mainnet with disposable names. If Intents cannot provide the required sale semantics, use a minimal escrow/sale contract with an explicit non-atomicity analysis rather than losing days to an integration that does not strengthen the core invariant.

## 6. Factual and technical issues

- **“The protocol rejects the seller from that block on” is not established.** NEP-641 resolution and TLA ownership can secure supported on-chain authorization paths, but your off-chain runtime check is application enforcement. Observation delay, stale RPC responses and already-authorized jobs also contradict an absolute block-level guarantee.
- **External transfers do not automatically fail closed against a malicious old runtime.** If an old spend grant remains valid, the seller can bypass your runtime and call its permitted receivers directly. Ownership re-resolution alone does not revoke that key or grant.
- **`w_resolve_auth` only covers authorizations designed to delegate through it.** It does not invalidate every credential, session, API token or authorization the seller ever possessed. “All future authorization” should be restricted to the named mechanisms.
- **Freeze and drain are not necessarily TLA protocol properties.** In the described design they are service-runtime behavior. A direct transfer outside Deed bypasses that state machine, so its in-flight-job protection cannot be assumed there.
- **TEE-signed inference is provenance evidence, not proof that the answer is correct or that the requested model performed the intended reasoning.** The evidence ledger should describe it accordingly.
- **An earnings history is not independently valuable merely because it is on-chain.** Demo-versus-external labelling is necessary but does not solve wash trading; identify payer relationships and avoid presenting gross self-funded volume as revenue.
- The supplied TLA method names and semantics should be treated as integration assumptions until verified against the deployed contract version, especially grant revocation on transfer, allowed receiver/token behavior and exact NEP-641 failure modes. These are the highest-priority facts to test, not the post-quantum nearcore features, which this idea rightly does not depend on.