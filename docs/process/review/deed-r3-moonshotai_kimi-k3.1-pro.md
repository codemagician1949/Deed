SCORE: 8.3

## Sub-scores

| Dimension | Score | Assessment |
|---|---:|---|
| Originality / 1-of-1-ness | 9.2 | Selling a revenue-producing, agent-operated NEAR name is substantially more distinctive than another membership or token-bound-account NFT. The audited rotation mechanics are the differentiator, not the AI service. |
| Fit to track / organizers’ wishes | 9.7 | Almost a direct implementation of the prompt: NEP-171 account, transferable earnings and access, gated console, lineage, and adversarial transfer tests. Using production TLA contracts is better than deploying a toy NFT. |
| NEAR-specific technical depth | 9.4 | TLA rotation, NEP-641, sub-accounts, spend grants, native account settlement, and NEAR AI attestation form a coherent stack. No gratuitous post-quantum or Intents bolt-on. |
| Real-world usefulness | 6.3 | “Preflight” risks being an LLM transaction-explainer wrapper with no demonstrated demand. The ownership primitive is more useful than the initial service. Ten to twenty paid calls would be evidence, not product-market fit. |
| Demo impact | 9.1 | A live sale followed by failed seller attacks and immediate buyer activation is visually and technically strong. It will land only if every transaction is independently inspectable and nothing depends on a prerecorded backend. |
| Feasibility in 12 days | 7.0 | The application scope is controlled, but TLA integration, safe escrow, payment/job correlation, TEE verification, indexing, and reproducible adversarial tests are a lot. Escrow and external-user acquisition are the likely schedule sinks. |
| Risk of technical show-stoppers | 4.5 / 10 *(higher = worse)* | Main risks are testnet/TLA availability, non-atomic escrow failure states, attestation integration, and discovering that the demo requires team-operated infrastructure that cannot credibly transfer. |

## Track choice and competition

`nfts` is clearly the right lead track. It should also list `agents`, and optionally `security`; those describe the paid service and permission lockout but should not displace the lead.

Expect a moderately crowded NFT track dominated by membership passes, dynamic metadata, game inventory, and generic ERC-6551-style token-bound accounts. Few entries should have production-account rotation semantics or a serious adversarial verifier. This project can stand near the top without needing mass adoption.

Switching to `agents` would reduce its odds: the sale mechanism would become supporting machinery around a comparatively ordinary paid AI endpoint. `security` would invite much harsher scrutiny of whether an LLM can safely assess transactions. `business` and `open` offer no better fit.

## Three weaknesses most likely to stop it winning

1. **The transferred “business” is partly a team-operated server.**  
   On-chain ownership transfers the name, earnings address, and authorization. It does not transfer customers, hosting, source deployment, runtime integrity, or service continuity. If the same team runtime merely starts trusting a new owner, the sale demonstrates administration—not acquisition of an autonomous service.

2. **The service itself may be judged an AI wrapper.**  
   A model explaining a risky transaction is easy to reproduce and can be confidently wrong. A TEE signature establishes provenance under particular attestation assumptions; it does not establish that the risk flags are correct. Weak deterministic analysis would drag down an otherwise excellent NFT mechanism.

3. **Escrow could consume the schedule or undermine the central safety story.**  
   NEAR promises and callbacks do not make the purchase atomic. A refund callback does not roll back a successful name transfer. Partial execution, repeated callbacks, the five-minute revert, and owner changes during payment all need explicit recovery behavior. “One promise chain plus refund callback” is not an adequate design.

## Changes needed to justify 9+

- **Make service portability part of the demo.** Publish a pinned runtime container/source bundle and activate a *buyer-operated* endpoint after the sale. Bind endpoint, runtime/config hash, model, name, and response to the activation/attestation. Show the seller endpoint refusing work and the independently hosted buyer runtime fulfilling the next paid request without team intervention.

- **Make Preflight deterministic before making it conversational.** Decode real NEAR actions—including `AddKey`, `DeleteKey`, function-call deposits, FT calls, and recipient changes—and apply explicit policy rules. Use the model only to explain those findings. Include a fixture corpus of malicious and benign transactions with expected flags. Never describe the output as a safety guarantee.

- **Avoid custom escrow if the production TLA sale path can support the demo.** If custom escrow is necessary, implement an explicit state machine with idempotent callbacks, timeout recovery, buyer/seller reclaim paths, double-purchase protection, and tests for every promise outcome. Test the five-minute revert rather than merely displaying a countdown.

- **Strengthen the verifier rather than adding features.** A fresh clone should deploy/fund what it needs on testnet, execute the flows, and emit independently checkable transaction hashes and assertions. Add the prompt’s literal **sale during payout** test, stale web sessions, payment finality/reorgs where relevant, duplicate callbacks, escrow recovery, and buyer activation from stale seller state. Keep a separate mainnet evidence run if testnet TLA is unavailable.

- **Get undeniable external usage.** Twenty payments generated by the team are worth little. Publish several independent agents/users, their clients or invocation scripts, uncorrelated funding accounts, and labelled payments. A second Deed should use a genuinely different paid function, not a cosmetic configuration change.

- **Cut polish before cutting evidence.** A plain title page with complete, recomputable events beats a polished dashboard backed by an opaque database.

## Factual or technical issues

The core reading of the TLA rotation behavior is consistent with the supplied facts. The problems are mainly overclaims:

- **The service lockout is not entirely on-chain.** Grant deletion and NEP-641 denial are protocol-enforced; “the service stops serving the seller” is runtime policy. Existing sessions, cached API responses, and the seller’s own hosted endpoint require separate invalidation and testing.
- **A Deed is rented name/control rights, not unconditional perpetual ownership.** The lease authority retains protocol powers, including the short revert window and other rotation causes. The UI and README should say exactly what the buyer acquires.
- **Escrow is not atomic.** Cross-contract promise execution cannot be assumed to roll back as a unit. Refunds and name transfer require recoverable state transitions.
- **The sweep settles NEAR only.** It does not transfer or settle arbitrary FTs, NFTs, off-chain receivables, or future obligations. Restricting earnings to NEAR is sensible; keep that limitation visible.
- **`config_hash` alone proves nothing about running code.** Without an attestation measurement or reproducible runtime binding, it is just a registry value.
- **TEE-signed inference is not verified transaction safety.** Phrase it as verifiable provenance, and actually verify the certificate/attestation chain rather than merely displaying a signature.
- **Per-job owner lookup does not solve payment/job binding by itself.** You still need finality handling, exact deposit accounting, request identifiers or another unambiguous correlation mechanism, replay protection, and behavior for payment arriving during rotation.