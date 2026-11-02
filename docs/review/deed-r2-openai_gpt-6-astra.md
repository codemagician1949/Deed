SCORE: 7.2

**A plausible first-place contender in `nfts`, but not with the security claim currently stated.** The strongest component is a transferable, revenue-receiving account with an adversarial handover demonstration. The weakest is that the proposed runtime checks do not establish the claimed protocol-level revocation.

This score measures competitive strength, not a 72% probability of winning. I have no visibility into other submissions.

## 1. Sub-scores

| Dimension | Score | Assessment |
|---|---:|---|
| Originality / 1-of-1-ness | **7.4** | “Sell an agent business” is familiar. A working NEAR name, explicit handover semantics, and reproducible seller attacks are more distinctive. Much of the account/NFT novelty belongs to TLA, not Deed. |
| Fit to track and organizers’ wishes | **9.3** | Directly addresses NFTs as accounts, earnings, access rights, and transfer safety. Uses infrastructure explicitly highlighted by the organizers. |
| NEAR-specific technical depth | **8.5** | TLA account ownership, delegated authorization, spending permissions, and asynchronous handover are substantive. Integrating existing calls alone will not demonstrate deep engineering. |
| Real-world usefulness | **5.8** | Transferable service ownership is useful. A paid NEAR explainer has weak demonstrated demand and an easily copied product. |
| Demo impact | **8.4** | Same account, different owner, persistent earnings, rejected seller attacks: legible and demonstrable. Five unexplained error boxes would weaken it. |
| Feasibility in 12 days | **6.2** | Plausible only if TLA ownership, authorization, payment, and marketplace paths work immediately. You have several unfamiliar integrations and financially significant race conditions. |
| Technical show-stopper risk | **7.1** | **Higher means more risk here.** The critical uncertainty is whether existing TLA grants actually become unusable after arbitrary ownership transfers. |

## 2. Lead track and expected competition

**Keep `nfts` as the lead.** This is more directly aligned with its prompt than with any other track.

I would expect fewer entries than in broad agent/DeFi categories, but many plausible competitors will be:

- Membership NFTs with wallets and revenue sharing.
- Transferable agents or businesses.
- Dynamic credentials and access passes.
- Thin wrappers around the same TLA contracts.

Consequently, **“the NFT is a working account” will not be enough to win**. The organizer explicitly supplied that starting point. Your differentiator must be a difficult, independently verified ownership transition—not the existence of TLA.

`security` is a credible secondary track **only if the security mechanism survives a malicious runtime**, rather than merely demonstrating that your own server refuses requests. Its strongest typical competitors will have actual policy enforcement, attack corpora, and measurable security properties.

`agents` also fits if the service genuinely earns money and pays for inference. It likely offers worse lead-track odds: a single explainer agent is thin against agent-commerce systems.

Suggested submission tracks, conditional on delivery:

```json
{
  "tracks": ["nfts", "agents", "security"]
}
```

Do not add `privacy` just because inference runs in a TEE, or `business` simply because payments exist.

## 3. The three weaknesses most likely to prevent a win

### 1. The central security invariant is not established

> “The protocol rejects the seller from that block on.”

That conflates three separate properties:

1. The seller cannot issue new owner-authorized commands.
2. Previously issued spending permissions no longer work.
3. Previously accepted asynchronous operations cannot execute later.

A current-owner check can establish the first under appropriate semantics. It does not automatically establish the other two.

Your external-transfer fallback is particularly weak:

> “The runtime re-checks ownership … on every job.”

A malicious seller can run a modified runtime that omits that check. If their existing capability can still call the account or spending extension directly, your server’s refusal is irrelevant.

Likewise, revoking a grant does not necessarily cancel a payment receipt already emitted. “Same block” is not an adequate ordering model for a cross-contract asynchronous system.

**A screener that bypasses your UI and exercises the old grant directly could invalidate the headline claim.**

### 2. The product risks looking like rented infrastructure plus a chatbot

TLA supplies the name/account relationship, ownership transfer, wallet behavior, and potentially most authorization machinery. An inference provider supplies the answer generation.

What does Deed uniquely contribute?

The answer needs to be:

- A precise handover protocol.
- Enforced payment/liability treatment.
- A transfer-aware service entitlement system.
- An adversarial verification suite.

Without these, it is primarily an integration demo.

The economic story also needs restraint. Seller-generated payments are not evidence of demand; receipts are not reputation; inference costs alone are not profit. Your evidence-ledger framing is appropriate, but judges still need to see why someone would buy this particular service.

### 3. Twelve days is short for this dependency graph

You depend on:

- TLA contracts and undocumented integration edges.
- NEP-641 resolution semantics.
- Spending extensions.
- A marketplace/Intents sale path.
- x402/PingPay payment reconciliation.
- NEAR AI Cloud access and verification.
- Reliable ownership observation.
- Handover recovery after crashes.

AI coding agents help write adapters. They do not resolve uncertain contract semantics or make asynchronous operations atomic.

The likely failure is not “nothing works.” It is **a polished happy path with unfinished adversarial and refund behavior**—exactly what this submission invites judges to inspect.

## 4. Changes that could raise it to 9+

A 9+ version is not broader. It proves less, more rigorously.

### A. Make the first 24 hours a falsification exercise

Before building the UI:

1. Create or acquire the actual TLA NFT-account.
2. Issue an actual spending grant.
3. Transfer the NFT through an ordinary supported transfer path.
4. Invoke the old grant **directly from the seller-controlled client**.
5. Repeat with pending authorization resolution and pending payment execution.

Publish the transactions and results.

**Decision gate:** If grants survive transfer, you must change the architecture or narrow the claim. Do not cover the behavior with an application-level ownership check.

If TLA cannot provide transfer-bound spending authority within the available time, the safer scope is:

- No persistent agent permission over the name account’s treasury.
- Inference spending from a separately bounded, owner-session-specific service budget.
- Explicit disclosure of what happens to the previous owner’s remaining service budget.
- Treasury withdrawals controlled by the existing current-owner authorization mechanism.

This sacrifices some autonomy but removes a potentially fatal promise.

### B. Replace the slogan with a testable specification

For example:

> After the ownership transition is finalized, newly submitted seller-owner commands fail. Pre-transfer accepted operations follow the documented settlement policy. Deed-mediated sales revoke the listed capabilities before listing; arbitrary transfers have separately tested behavior.

That is less dramatic and much more defensible.

Specify the linearization point for every security claim. Distinguish:

- Request submitted.
- Authorization accepted.
- Funds reserved.
- Transfer initiated.
- Transfer finalized.
- Payment completed.

Do not claim pending effects vanish unless the contracts actually enforce that.

### C. Make the centerpiece one hostile transaction trace

The strongest demo is not five red badges. It is:

1. Seller starts a paid request.
2. A sale is attempted while that request is unresolved.
3. The system blocks the sale or follows a declared settlement policy.
4. Sale completes.
5. Seller uses a standalone script—not your UI—to reuse the old capability.
6. The actual enforcing contract rejects it.
7. Buyer completes the next paid request at the same service address.

Include a fresh valid buyer operation as a positive control. Otherwise, a broken system could “pass” every rejection test.

Add tests for external transfer, transfer away and back, duplicate callbacks, restart mid-handover, and failed refund.

### D. Define the money being sold

Your “sweep earnings to seller” step needs accounting boundaries:

- Completed-job proceeds available to the seller.
- Customer prepayments reserved for unfinished jobs.
- Refund liabilities.
- Operating capital included in the sale.
- Infrastructure costs not measured on-chain.

**Never sweep the entire balance merely because the runtime reports zero active jobs.**

A buyer should see a machine-recomputed sale manifest: acquired name, included balance, obligations, service configuration hash, historical receipts, and explicit exclusions.

That is more commercially meaningful than an agent avatar or additional models.

### E. Make reproduction the main deliverable

Ship:

```text
make local-test
make adversarial-test
make live-smoke
make recompute-ledger
```

Include:

- Pinned contract versions and network identifiers.
- A deterministic local fixture.
- A live integration path with prerequisites and costs documented.
- Expected outcomes and transaction links.
- Clear separation of mocked inference from real inference.
- Clear separation of application refusals from contract rejections.
- A component diagram identifying **TLA-provided behavior versus Deed-built behavior**.

Use the first two days to prove integration viability, the middle period to implement handover/accounting, and reserve the final three days for adversarial tests, independent reproduction, and the demo. Cut integrations rather than consume that testing window.

## 5. Factual and technical corrections

**I am treating the supplied 2026 release details as premises, not independently verified facts.** The following issues remain even if those details are all accurate.

### “The NFT is the account”

This is acceptable product shorthand, but not a literal explanation of NEAR’s account model. A token and an account remain distinct protocol/application concepts; contracts connect their ownership and control.

Also, an ERC-6551 account is a real account, not merely a metadata pointer. Your useful distinction is the particular NEAR name/account integration and control mechanism—not that competitors lack real accounts.

### Current-owner resolution does not prove grant invalidation

Even if `w_resolve_auth` delegates to the current owner, that does not by itself establish how an already-created spending grant behaves.

Verify the exact extension implementation, delegation rules, ownership binding, callback handling, and any permission caching. Cite the deployed code responsible for each invariant.

### “From that block on” is too strong

Finality, receipt ordering, and cross-contract execution matter. An already-authorized operation may execute after ownership changes. Checking ownership when a job begins is not equivalent to checking it at every financial effect.

Describe finalized state transitions and accepted operations, not an unspecified block boundary.

### RPC-down behavior is not an on-chain rejection

An RPC outage causing the runtime to stop is an **application availability/security decision**. There is no on-chain error if no transaction reaches the chain.

Similarly, an old runtime refusing a request is not proof that the old runtime cannot withdraw. Label those tests honestly.

### TEE verification and provider credentials need separation

“No third-party API keys” is not established by choosing NEAR AI Cloud. Confirm its actual authentication and billing mechanism.

Also, a verifiable TEE environment does not automatically imply every response has a portable signature binding together the request, model, output, and service identity. Demonstrate the verification artifact actually available.

If a platform credential exists, acknowledge it and explain that it is not transferred with the NFT.

### Post-quantum features are not a differentiator for this scope

Deed does not currently depend on them. Do not add PQ integration to exploit release novelty.

Separately, the comparison with Ethereum is overbroad: Ethereum EOAs have key-derived addresses, but smart-contract wallets can support signer rotation without changing their address. Key rotation also does not make the entire application or its external settlement dependencies post-quantum secure.

### A rented name is not perpetual ownership

Show expiry and renewal obligations in the sale manifest. Explain what happens to service access and balances at expiry based on actual TLA behavior. A buyer is acquiring a time-bounded position unless renewal rights establish otherwise.

---

**Verdict:** Keep the idea and the `nfts` lead. Spend the first day trying to break its central claim. If arbitrary-transfer revocation is genuinely enforced—or the architecture is narrowed to avoid promising it—this can become a first-place-quality submission. If the attack harness mostly proves that your own backend obeys your own rules, it will not.