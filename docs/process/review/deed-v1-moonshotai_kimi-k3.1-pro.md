SCORE: 7.8

## Sub-scores

| Dimension | Score | Assessment |
|---|---:|---|
| Originality / 1-of-1-ness | **9.0** | Transferable ownership of an operating agent business is substantially more interesting than another membership NFT or agent wallet. TLA plus off-chain authorization is a distinctive combination. |
| Fit to track and organizers’ wishes | **9.8** | Almost an ideal expansion of the official prompt: NEP-171, account-bound assets, portable earnings/access, transfer security, history, and sub-accounts. |
| Depth of NEAR-specific technology | **9.3** | TLA, `hos-wallet`, NEP-591, NEP-641, Intents, verifiable inference, and spending grants form a coherent NEAR-native design—not Ethereum with NEAR branding. |
| Real-world usefulness | **7.4** | Secure agent acquisition is a plausible need. The initial repo-summarizer business is commodityware, however, and one agent’s dashboard does not establish a market. |
| Demo impact | **9.2** | Real-time seller lockout while service and revenue continue under the buyer is an excellent demo, provided every step is live rather than orchestrated UI state. |
| Feasibility in 12 days | **5.5** | A missing TLA SDK, unfamiliar mainnet contracts, secure vaulting, TEE deployment, x402 settlement, marketplace transfer, web app, and adversarial tests are too many critical-path systems. |
| Risk of technical show-stoppers | **7.8 / 10 risk** | Higher means worse. The largest risks are undocumented contract semantics, secure runtime/attestation integration, and making revocation continuous across on-chain and off-chain systems. |

## 3. Track choice and expected competition

**`nfts` is the correct lead track and offers the best odds.** It directly answers—and substantially extends—the track’s example prompt. `agents` is a valid secondary track, but leading there would make Deed compete against general contractor agents, commerce marketplaces, negotiation systems, and payment demos. That track will likely be much more crowded.

Expect many `nfts` submissions to be membership wallets, dynamic credentials, game inventories, or NFTs holding balances. Few teams are likely to attempt TLA directly precisely because there is no SDK. That gives Deed a strong differentiation advantage. Do not switch to `open`; it would waste an unusually exact track fit.

## 4. The three biggest weaknesses

### 1. “The seller provably loses access to all of them” is not true

You can prove transfer of the **NEAR account, future owner authorization, and on-chain funds**. You cannot prove that a seller forgot plaintext prompts, source code, copied API credentials, customer lists, exported logs, or previously received inference outputs. A TEE protects future decryption; it does not erase history.

Likewise, an NFT account is not automatically the entire business. Unless explicitly transferred, the seller may still control the deployment pipeline, source repository, container image, domain, external API accounts, and runtime infrastructure.

This overclaim is dangerous because the project’s central pitch is provable title. Judges will attack exactly that sentence.

### 2. The plan has too many unproven critical-path components

Writing the TLA SDK is not a preparatory chore; it is where the project can die. The team must discover actual owner-call semantics, transfer restrictions, grant behavior, event formats, error cases, and marketplace settlement before building higher layers.

Then it still needs a production-credible vault, owner-bound sessions, TEE release policy, payment integration, and safe transfer behavior. A common failure mode will be an impressive title page backed by mocked attestations, simulated x402 calls, or a transfer script whose off-chain revocation steps can half-fail.

### 3. “Verifiable P&L” currently proves much less than advertised

On-chain receipts prove receipts. TEE-signed inference proves that a particular attested workload produced a response; it does **not** prove response quality, a unique customer, absence of self-dealing, or business profitability. Call counts, refund rates, hosting costs, inference costs, and acquisition costs need explicit provenance.

A single agent receiving team-generated micro-payments would be a transfer mechanics demo, not evidence that agents are sellable businesses. That may still be enough for a good submission, but not comfortably for first place.

## 5. Changes that could raise this to 9+

1. **Make one complete live transfer the non-negotiable milestone.**  
   Use a real mainnet TLA name, real third-party payment, real marketplace/Intents settlement, and two independently controlled owner wallets. Record one uninterrupted transaction-linked demo. Defer multiple agents, elaborate valuation, and generic SDK polish until this works.

2. **Narrow the security claim and transfer the actual runtime.**  
   Say: “The seller loses on-chain control and cannot obtain new vault releases or create new authorized sessions.” Publish the residual-copying risks explicitly. Package the agent as an immutable, measured container with its source/version hash on the title page; transfer its repository/deployment artifacts or run it in buyer-instantiable infrastructure. Otherwise the buyer purchases an income address, not necessarily the business.

3. **Implement the vault as an authorization system, not merely encrypted storage.**  
   Bind every release to:
   - current TLA owner checked at release time;
   - exact agent account and payload/nonce;
   - short session expiry;
   - attested TEE measurement and approved image hash;
   - monotonically versioned configuration.

   Cache no owner decision across a transfer. Revoke runtime sessions through a short lease/heartbeat that rechecks ownership, rather than relying solely on a transfer watcher. Show what happens if the watcher or vault is offline.

4. **Turn the transfer tests into an adversarial matrix.**  
   Include sale during payment, sale during inference, stale authorization replay, cached owner response, seller session heartbeat after transfer, expired and unexpired spending grants, partial revocation failure, duplicate transfer events, buyer never re-granting spend, and a funded-account listing. Publish reproducible tests and identify which invariants are enforced by TLA versus Deed.

5. **Make the financial title page honest and independently reproducible.**  
   Separate:
   - settled gross receipts;
   - facilitator/swap/network fees;
   - inference and hosting costs where measurable;
   - refunds and failed calls;
   - net observable cash flow;
   - self-funded/test transactions.

   Link every figure to transactions and expose the indexer/query script. Label signed samples as evidence of execution, not quality. Even 10–20 genuine external paid calls would strengthen the submission more than another dashboard feature.

6. **Have a deliberate fallback that preserves the core innovation.**  
   If full attested vault release is not ready, ship TLA ownership, NEP-641 gating, real payments, continuous service, and transfer tests using a narrowly scoped development vault—clearly marked non-production. Do not substitute a fake TEE badge. The TLA transfer is the winning insight; the vault is an enhancement.

## 6. Factual or technical issues about NEAR

The named primitives are plausible and appropriately connected, but several statements confuse a primitive’s guarantee with Deed’s additional guarantees:

- **NEP-641 authorization does not itself revoke sessions, re-encrypt secrets, or erase cached authority.** Those require Deed’s resolver, vault, and runtime design. Any service caching a prior authorization can otherwise continue accepting the seller until expiry.
- **NFT transfer and vault re-wrapping are not one atomic operation.** TLA control transfer may be atomic; the off-chain secret transition is eventually consistent unless carefully designed. Session cutover and spending re-grants need explicit failure handling.
- **A spending grant does not become harmless merely because ownership changed unless `hos-wallet` enforces that invariant.** Verify this directly in contract code and tests. A separate “revoke in the transfer flow” step is not atomic with an Intents sale.
- **TEE-signed inference is not verification of useful work or revenue authenticity.** It attests to a particular execution environment/output claim. Customers can still be bots or the team itself.
- **The TLA account does not inherently contain the agent’s source, secrets, deployment, or external accounts.** Deed must supply and transfer those relationships.
- **“Zero access keys” does not mean no old capability can exist anywhere.** Runtime extension grants, issued sessions, copied plaintext, and off-chain credentials remain separate revocation domains.
- **The claimed funded-account transfer restriction and registry-venue behavior must be verified against the deployed contract version**, including whether sweeping is mandatory and how marketplace settlement handles balances arriving between listing and sale.
- **Do not call the displayed figures a full P&L unless costs are included.** On-chain revenue history plus signed samples is a cash-flow and provenance report.

None of these invalidates the idea. They define the difference between a winning implementation and a polished demo whose strongest sentence is false.