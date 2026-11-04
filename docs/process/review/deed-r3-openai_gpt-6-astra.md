SCORE: 7.8

**Lead track: `nfts`. A credible first-place contender, but not yet a first-place architecture.** The strongest feature is the independently reproducible ownership handoff—not the AI service. The largest unresolved issue is that your proposed escrow introduces asynchronous settlement and reversible ownership into an otherwise relatively clean story.

This score assumes your supplied TLA source findings are accurate and the planned features actually ship. It is a comparative judgment, not a 78% probability; the competing submissions are unknown.

## 1. Sub-scores

| Dimension | Score | Judgment |
|---|---:|---|
| Originality / 1-of-1-ness | **7.6** | Transferable AI businesses and NFT accounts already exist conceptually. A NEAR-native handoff with adversarial evidence is a meaningful implementation distinction. |
| Fit to track / organizer wishes | **9.5** | Almost directly answers the prompt: NFT-account, earnings, ownership-dependent access, history, and transfer-time tests. |
| Depth of NEAR-specific technology | **8.8** | TLA wallet rotation, named NFT-accounts, NEP-641 authorization, and native settlement are substantive integrations. Do not claim the overall product is impossible elsewhere. |
| Real-world usefulness | **6.0** | Transaction explanations are useful but crowded. You have not established why someone would buy this service rather than recreate it. |
| Demo impact | **8.5** | A sale followed by direct seller attacks is strong. Five-minute reversibility and buyer activation complicate the 90-second narrative. |
| Feasibility in 12 days | **6.5** | Plausible with an existing resale path. Custom escrow, unfamiliar audited contracts, payment reconciliation, TEE verification, and a reliable verifier are too many critical-path integrations. |
| Technical show-stopper risk | **6.5** | **Higher means greater risk.** The principal risks are settlement semantics, lease-authority reversion, and whether the necessary flows work in a reproducible deployment. |

## 2. Track choice and likely competition

**Keep `nfts` as the lead.** You have unusually close alignment with its explicit transfer-security requirements.

I would expect fewer entries than in agents, DeFi, or security, but that does not imply an easy field. Typical NFT entries will likely include:

- Membership NFTs with gated pages.
- NFT-controlled wallets and treasury shares.
- AI-character or agent NFTs.
- Wrappers around the same TLA contracts.

That last category matters. The organizers explicitly point builders toward TLA. **Using TLA is not itself your differentiation.** Your differentiation must be the verifiable handoff, correctly reconciled money, and continuity of an actual service.

A completed, useful membership business with real users could beat Deed if Deed is primarily an impressive transfer test.

Suggested submission:

```json
{
  "tracks": ["nfts", "security", "agents"]
}
```

- **`security`:** justified by the adversarial transfer verifier and transaction preflight functionality.
- **`agents`:** justified if actual agent clients buy the service programmatically.
- **`business`:** add only if autonomous operation, costs, and revenue are genuinely demonstrated—not merely because the NFT earns fees.

No alternate lead offers better odds. As a security entry, Deed would face purpose-built defenses and more demanding detection benchmarks. As an agent entry, the business loop is comparatively thin.

## 3. The three biggest weaknesses

### 1. “One promise chain” does not make the sale atomic

This is the most serious problem.

On NEAR, successful receipts do not roll back because a subsequent receipt fails. Your sequence therefore needs explicit answers for:

- Buyer payment accepted, name transfer fails.
- Name transfer succeeds, seller payment fails.
- Transfer succeeds, callback fails or runs out of gas.
- Seller receives payment, then an authorized ownership reversion occurs.
- A retry repeats an already completed action.
- A buyer-funded payment or job arrives while escrow owns the name.

A generic “refund callback on failure” is insufficient and can be dangerous: **which failure permits a refund, and how do you prove ownership did not already move?**

The five-minute revert window makes this harder. An escrow sale appears to involve at least two rotations: seller → escrow and escrow → buyer. You must establish the actual reversion semantics of both, including whether a revert reinstates escrow as owner.

A polished UI over unresolved settlement is a losing submission.

### 2. You transfer on-chain authority, but not yet a compelling business

The wallet’s permission wipe is inherited from the underlying protocol. Your contribution is orchestration, service authorization, commercial continuity, and proof.

The missing business question is:

> What does the buyer acquire that is worth more than deploying an identical Preflight service?

Potential answers include the name, integrated clients, recurring demand, public reputation, verified earnings history, and operational continuity. The current plan only weakly establishes those.

Also, distinguish:

- **Ownership of the NFT-account.**
- **Authority to configure your hosted service.**
- **Ability to operate the service independently of your team.**

If the buyer still depends on your backend and your inference-provider account, this is a transferable hosted-service entitlement—not a fully transferable autonomous business. That can fit the track, but name it accurately.

Ten to twenty external paid calls establish integration and some demand. They do not establish durable revenue or profitable operation.

### 3. Your strongest proof is currently too easy to stage accidentally

A negative attack test proves little if the permission never worked beforehand.

For example:

- An “old grant rejected” result is weak unless that exact grant successfully spent before transfer.
- An authorization failure is weak unless the same seller successfully authenticated before transfer.
- An RPC outage is not an on-chain rejection.
- A stale runtime activation may fail in your application, not in the audited wallet.
- A “TEE-signed” response is not independently verified confidential inference merely because the response contains a signature.

Your demo must clearly separate **protocol enforcement, runtime enforcement, and infrastructure failure**. Otherwise the evidence ledger overstates its conclusions.

## 4. Changes that could raise this to 9+

These are scope substitutions, not a request to add another product.

### A. Prefer a supported sale path over a new marketplace

**First choice:** use an existing TLA resale/venue flow, if it supports the required lifecycle. Keep your contract focused on activation and service configuration.

**If custom escrow is unavoidable:** make it the core engineering task and reduce UI scope. Implement a persisted settlement state machine with:

- Unique sale IDs and idempotent callbacks.
- Explicit ownership-transfer status.
- Separate buyer-refund and seller-proceeds claims.
- Seller proceeds unavailable until the relevant reversion period has elapsed and ownership has been reconciled.
- Recovery after interrupted callbacks.
- No refund triggered merely by failure of a downstream payout.
- Tests for every receipt boundary.

Claimable proceeds are generally easier to reason about than entangling transfer success with immediate external payout.

**Day-2 gate:** if you cannot demonstrate the full sale-and-recovery lifecycle, remove custom escrow. Do not spend ten days discovering that your centerpiece cannot settle safely.

### B. Specify one testable transfer invariant

Use something like:

> Once a sale is finalized, the previous ownership epoch cannot authorize a new service job or wallet operation; all previously accepted payments have a recorded beneficiary or refund outcome.

Bind activations and accepted jobs to the account’s authoritative rotation/version state where available.

For the MVP:

1. Stop accepting new jobs before escrow deposit.
2. Drain or refund accepted jobs.
3. Record the settlement checkpoint.
4. Transfer ownership.
5. Wait through the actual finalization conditions.
6. Require buyer activation before reopening.

Still test a forced transfer during a job. The expected result can be “no delivery; refund recorded,” rather than seamless continuation.

**Do not use a per-job owner lookup as a complete concurrency guarantee.** Ownership can change after the lookup.

### C. Make the verifier establish causality

Each attack scenario should include:

1. **Positive control:** the operation succeeds before transfer.
2. **Ownership transition:** transaction and resulting state.
3. **Negative control:** identical former authority fails afterward.
4. **Buyer control:** equivalent authorized operation succeeds for the buyer.
5. **Enforcement attribution:** wallet, registry, runtime, or infrastructure.

The JSON report should include network, block references, deployed code hashes, transaction outcomes, balance reconciliation, and expected versus observed results.

Provide two modes:

```bash
bun run verify:local
bun run verify:live
```

- **Local:** deterministic automated tests, with clear disclosure of what is simulated.
- **Live:** actual deployed contracts and documented funding/name prerequisites.

A fresh clone is not sufficient reproducibility if the judge also needs an unavailable name, private operator credentials, or your intervention.

### D. Demonstrate an asset worth transferring

Use two actual client integrations, not merely twenty manually generated purchases.

Show that:

- Clients continue buying from the **same named endpoint** after the sale.
- Neither client needs a new account address or integration.
- The buyer can change price/configuration and receive subsequent earnings.
- The seller cannot do those things.
- Gross receipts, inference costs, and net contribution are shown separately.
- The buyer can redeploy the documented runtime under their own credentials.

Public configuration is fine. The asset’s defensibility can be distribution and reputation rather than secrets.

### E. Make Preflight narrow and measurable

Do not attempt a general AI transaction-security product.

Support a small set of NEAR actions well: transfers, function calls, key changes, and contract deployment, including their relevant parameters.

Use deterministic parsing and rules for the actual flags. Let the model explain those findings. Include a fixed evaluation corpus and unsupported-case behavior.

Explicitly state that inspecting transaction actions does **not** establish the safety of arbitrary called contract code.

That is more defensible than an unbenchmarked “AI says this transaction is risky.”

### F. Tell the truth in the demo

The five-minute window cannot disappear inside a 90-second presentation.

Show:

- A previously finalized sale with replayable evidence.
- A fresh sale entering **pending finalization**.
- Seller attacks and the exact layer rejecting each.
- Buyer activation and paid continuity on the finalized example.

Cut the second Deed if it competes with these proofs. A second instance adds less value than a correctly handled failed sale.

## 5. Factual and technical corrections

**I cannot independently confirm the supplied November 2026 release claims or repository findings here.** Treat those as supplied evidence, not independently verified findings from this review. Pin source commits, deployed code hashes, networks, and protocol versions in the submission.

The material corrections and qualifications are:

| Claim | Correction / qualification |
|---|---|
| “Transfer and pay seller in one promise chain” | A promise chain is not an atomic cross-contract transaction. Partial success requires explicit reconciliation. |
| “Final after five minutes” | Only with respect to the particular revert mechanism, assuming its conditions are understood. Lease expiry, reclaim, recovery, and authority privileges must be disclosed separately. This is a leased name, not necessarily perpetual title. |
| “NEAR earnings settle to the seller” | A balance sweep does not distinguish earnings from deposits, working capital, or unpaid-job liabilities. Inspect reserve rules and sweep failure handling. The ledger must perform that accounting. |
| “Grant clearing proves seller lockout” | It proves the relevant stored permissions were cleared. It does not by itself cancel previously dispatched receipts, revoke off-chain sessions, or settle already accepted jobs. |
| “Runtime checks current owner per job” | Useful but subject to a time-of-check/time-of-use race. Define authorization and payment semantics across ownership changes. |
| “Five attacks fail with on-chain errors” | Some listed cases are runtime checks or infrastructure failures. Report them accurately rather than forcing them into an on-chain security narrative. |
| “TEE-signed model answer” | Verify what the provider actually attests: execution environment, request/response binding, model identity if available, and freshness. Attestation does not prove explanation correctness. |
| `w_resolve_auth` as owner login | Distinguish authorization resolution from complete session authentication. Demonstrate signed, domain-bound, expiring challenges and replay protection using the applicable standard flow. |
| Ethereum cannot rotate keys without moving funds | Too broad. Ordinary EOAs lack NEAR-style native key rotation, but smart-contract wallets can support replaceable authorization. Bitcoin users can migrate funds to new outputs. Neither supports the blanket comparison as written. |
| Post-quantum support strengthens Deed | Not unless Deed actually uses and verifies it end to end. The release details are currently irrelevant to the proposed MVP. Do not imply the runtime, TEE, bridges, or complete system are post-quantum secure. |

Finally, **x402 is not a necessary dependency here**. A documented native-NEAR payment protocol with unique job IDs and receipt verification is sufficient. Remove it from the critical path unless an actual client requires it.

**Bottom line:** Deed can beat generic NFT-account demos through rigorous, reproducible transfer evidence and uninterrupted customer integration. It will not win merely by showcasing protections already provided by TLA. Resolve settlement, demonstrate what economic asset changes hands, and make every security claim independently falsifiable.