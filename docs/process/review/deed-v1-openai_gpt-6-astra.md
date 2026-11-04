SCORE: 6.7

**Verdict:** A credible `nfts` contender, but not yet a first-place plan. The NFT-account fit is strong. The central promise—**“sell the NFT and the seller provably loses everything”**—is materially stronger than the proposed system can establish.

Against typical membership NFTs, royalty dashboards and token-bound wallets, a working agent-business handover could stand out. Against a smaller project with thoroughly tested ownership transfer, this version could lose on correctness and reproducibility.

*I treat the supplied November 2026 protocol descriptions as premises where appropriate; I have not independently inspected the current contracts or documentation. Deployment-specific behavior below needs source-level verification.*

## 1. Sub-scores

| Dimension | Score | Assessment |
|---|---:|---|
| Originality / 1-of-1-ness | **7.0** | Tradable agents and NFT-bound accounts are not new. A demonstrably safe handover of an operating, revenue-producing service is more distinctive. |
| Track / organizer fit | **9.5** | Directly addresses NFTs as operating accounts, earnings, ownership transfer and seller-retained access. |
| NEAR-specific technical depth | **8.5** | TLA ownership, wallet grants and account-resolved authorization could form a coherent NEAR-native architecture. The primitives are not categorically unique to NEAR. |
| Real-world usefulness | **6.0** | Transferring a small service is useful. A GitHub summarizer is replaceable, and ownership of its account does not establish ownership of its infrastructure, customers or external credentials. |
| Demo impact | **8.5** | A live paid service surviving sale while old authority is rejected is compelling. A dashboard merely displaying “revoked” proves little. |
| Feasibility in 12 days | **4.5** | New contract integration, confidential execution, vault security, payments, resale and adversarial testing are too many critical paths. AI coding agents do not remove integration uncertainty. |
| Technical show-stopper risk | **8.0 risk** | **10 = highest risk.** Grant persistence, confidential-runtime availability, authorization semantics and mainnet resale could each invalidate the advertised flow. |

These are judgment scores, not calibrated probabilities. I do not know the competing submissions.

## 2. Track choice and expected competition

### Lead with `nfts`

This is the right track. Your differentiating question is:

> What exactly changes hands when someone buys this NFT, and what authority does the seller retain?

That is much stronger alignment than “an agent accepts payments.”

I would expect `nfts` to have **lower volume than the broad agent tracks, but several highly aligned entries**, because the official prompt already points builders toward NFT-controlled accounts and transfer safety. TLA usage alone will not make you unique. Other teams can discover the same contracts.

Typical competitors will likely include:

- Membership NFTs with treasury balances.
- Revenue-sharing or royalty-bearing accounts.
- Transferable access credentials.
- NFT-owned shops, bots or other small services.

Your advantage must be **operational continuity plus adversarially tested handover**, not the number of protocol names in the README.

Use:

```json
{
  "tracks": ["nfts", "agents"]
}
```

Keep `agents` only if the product actually exhibits agent behavior and paid work. A fixed summarization endpoint with a payment wrapper is a weak agent-economy entry.

I would not switch the lead to `agents`, `business` or `security`. Those tracks invite comparisons against richer autonomous workflows or dedicated security systems. Do not add `privacy` merely because one inference provider uses a TEE.

## 3. The three biggest weaknesses

### 1. The ownership guarantee is false at its advertised scope

**“The seller keeps nothing” is not supportable.**

A seller can retain:

- API keys they originally supplied.
- Prompt and code copies.
- Previously obtained outputs or secrets.
- Control over a deployment account, DNS, billing account or external provider.
- Existing wallet grants, unless the actual wallet implementation invalidates them.
- In-flight work or previously issued authorizations.

A TEE can protect secrets during supported execution. It cannot erase information someone already knows or transfer legal and operational control over arbitrary third-party services.

The proposed “rotation checklist” is especially weak. A checklist is not cryptographic evidence that an old credential was revoked. For arbitrary providers, you generally cannot verify that claim without provider-specific integration.

**What stops this winning:** a judge asks the seller to exercise an old grant after the NFT transfer, or asks who still controls the external API account. The headline collapses.

### 2. The transfer boundary is not actually designed

An atomic NFT ownership update does not atomically update:

- Your vault.
- A worker’s memory.
- An outstanding HTTP request.
- A payment facilitator.
- Existing spending grants.
- Authorization caches.

“Transfer event invalidates sessions” means an off-chain component must observe and enforce the event. There is a delay and a failure mode. “Revoked automatically—or expires” conflates two materially different guarantees.

You also have not specified the economics of a transfer:

- Who owns a request accepted before sale but completed afterward?
- Who pays its inference cost?
- Who owes a refund?
- What happens to a payment arriving after the pre-sale sweep?
- Can the seller withdraw funds after the buyer inspected the listing?

**What stops this winning:** the happy-path animation works, but the required “sale in the middle of a payout” exposes an undefined state machine.

### 3. Too much infrastructure, too little proven business

The plan contains at least five substantial integrations before testing begins. The strongest demo also depends on mainnet functionality and external services.

Meanwhile:

- One paid call does not establish market demand.
- TEE-signed inference does not prove that output is correct or useful.
- On-chain deposits do not prove independent customer revenue.
- Gross receipts are not a P&L.
- A service bound to your hosted platform is not an independently portable business.

**What stops this winning:** the submission becomes a collection of impressive-looking integrations with a fragile demo and overstated evidence. A smaller competitor can beat it with one clean, reproducible ownership invariant.

## 4. Changes that could make this a 9+ contender

These changes could support a 9+ evaluation **if implemented and independently reproducible**. They do not guarantee first place.

### A. Narrow the promise

Replace the house analogy and “owns everything” claim with:

> **Deed transfers control of an earning agent account and its managed service permissions. The handover verifies that prior-owner authorization and spending authority no longer work.**

Explicitly exclude copied intellectual property, historical information and unsupported external credentials.

For the hackathon, support **one managed service template**, not arbitrary agent migration.

### B. Eliminate seller-supplied secrets from the winning path

Use:

- Public GitHub inputs.
- Platform-managed inference access, or a supported credential minted inside the verified runtime.
- No pasted seller API keys.
- A configuration that the buyer can inspect or whose declared version is committed.

If you cannot verify confidential execution of your own worker and vault, **drop the secret-transfer claim**. Keep verifiable inference as a separate feature.

A narrower, truthful handover is more competitive than a broad, unverifiable vault.

### C. Build a handover state machine before the dashboard

For sales initiated through your supported flow:

1. **Freeze** new jobs and owner-controlled withdrawals.
2. **Drain or explicitly cancel** accepted jobs.
3. **Revoke all supported spending grants**, then verify their state.
4. **Commit the sale state:** account balance, configuration version and outstanding liabilities.
5. **Transfer through the supported venue.**
6. **Verify finalized ownership.**
7. **Start buyer-authorized operation** and require fresh spending grants.

This is a brief maintenance window, not magic uninterrupted atomic transfer. Say so.

You must also address transfers outside this flow: either the underlying system safely invalidates the relevant authority, or you detect the ownership change and fail closed. **Do not claim your marketplace wrapper controls every possible NFT transfer.**

Do not invent an ownership epoch in your backend and call it an on-chain guarantee. Establish what the underlying contracts enforce.

### D. Make the attack harness the centerpiece

Ship a reproducible test suite that attempts:

| Attempt | Required evidence |
|---|---|
| Seller replays an old authorization | Rejected against the post-transfer ownership state. |
| Seller invokes an old spending grant | Transaction fails or grant is demonstrably unusable—not just hidden in the UI. |
| Old worker tries a privileged action | Action blocked under the documented handover rules. |
| Sale occurs during a paid request | Documented completion/refund rule holds without double payment. |
| Sale fails after freezing | Safe recovery; no ambiguous partial activation. |
| Ownership observer or RPC fails | Privileged actions fail closed. |
| Buyer resumes service | Same account receives payments, with new authority and traceable receipts. |

In the demo, show actual rejected requests and transaction outcomes.

**The winning moment should be “the seller tried to steal,” not “the seller’s dashboard turned red.”**

### E. Replace “verifiable P&L” with an evidence ledger

Show separately:

- Payments received.
- Linked order IDs.
- Service delivery receipts.
- Recorded inference costs.
- Refunds.
- Unmatched deposits.
- Cash remaining in the account.

Label demo purchases as demo purchases. Explain that linked payments do not establish independent demand and can be wash-traded.

Offer a downloadable ledger and a script that recomputes the displayed totals. That helps both AI screeners and human judges.

### F. Cut the build surface immediately

Do not build a general TLA SDK. Build a thin, pinned adapter for the methods you actually use, with contract IDs, network configuration and integration tests.

A feasible schedule:

| Dates | Deliverable |
|---|---|
| **Nov 2–3** | Verify TLA transfer/grant behavior, authorization flow, supported runtime and actual resale path. Execute a minimal end-to-end transfer. |
| **Nov 4–6** | One paid service, account-bound revenue and receipt ledger. |
| **Nov 7–9** | Handover state machine and adversarial tests. |
| **Nov 10–11** | Title page, mainnet rehearsal, operational failure handling. |
| **Nov 12–14** | Feature freeze, reproducibility, demo recording and submission buffer. |

**Kill criterion:** if the grant invalidation and supported resale path are not demonstrated by the end of November 3, reduce the architecture. Do not leave those assumptions until the final demo.

## 5. Factual and technical corrections

### Definite conceptual errors

**“No transaction and no key” overstates off-chain authorization.**  
A view-based authorization check may require no transaction. The requesting party still needs a valid authorization mechanism. Current-owner delegation does not mean anyone can request secrets without authenticated evidence.

**TEE inference is not the same as a confidential agent runtime.**  
An attested inference service does not automatically protect your Bun vault, orchestration process, credential handling or outbound calls. Verify which exact code executes inside the trusted boundary and what the attestation covers.

**TEE signatures do not prove business performance.**  
Depending on their format and verification procedure, they can attest to a response or execution context. They do not establish correctness, customer satisfaction, legitimate demand or complete cost accounting.

**Re-wrapping encryption keys does not revoke previously learned plaintext.**  
Nor does it necessarily terminate already-running processes. Credential revocation and runtime fencing are separate problems.

**NFT transfer is not off-chain atomic revocation.**  
Document the actual consistency boundary and maximum stale-authority window, or adopt a freeze-and-drain design.

**A revenue account is not a P&L.**  
You need costs and attribution; “profit” remains limited to what the system observes.

### Claims that require contract/documentation verification

| Claim | What must be checked |
|---|---|
| Existing grants stop working after sale | Whether grants are owner-scoped, cleared on transfer, or remain attached to the account. This is a go/no-go issue. |
| Automatic grant revocation in the transfer flow | Whether the venue actually enforces it and whether alternative transfer routes bypass it. |
| Funded accounts cannot directly transfer | Exact balance definition, supported assets, exemptions and treatment of late-arriving funds. |
| Vault release through `w_resolve_auth` | Exact authorization schema, replay protection, domain separation, finality assumptions and supported ownership-account types. |
| “Zero access keys” guarantees seller exclusion | Contract upgrade rights, recovery paths, delegates and all other retained authority—not merely account keys. |
| Resale settles through Intents | Supported venue, asset, network, permission and integration requirements. |
| A rented name behaves like durable title | Lease expiry, renewal, recovery and the fate of the associated service and funds. |
| Mainnet-only resale “per rules” | That restriction is not established by the track excerpts supplied. Cite the actual rule or document it as an integration limitation. |

The official example’s NEP-171-contract requirement is an example, not a reason to duplicate TLA. **Explain that you compose an existing NFT-account system, and identify precisely what Deed adds.**

## Bottom line

Keep `nfts` as the lead. Remove arbitrary secrets, SDK ambition and claims of transferring an entire business.

Build one earning service and prove one difficult invariant:

> **After the supported handover completes, the seller’s previously valid authority cannot control or spend from the transferred service, and the buyer can resume operation.**

That is a plausible first-place submission. The current “everything moves, seller keeps nothing” version is a security claim waiting to fail verification.