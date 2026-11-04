# R2 — "Deed": a NEAR name that is a working AI service you can sell (track: `nfts`) — narrowed after review

## Precise claim (no overclaim)
When a Deed NFT is sold, **on-chain control and all future authorization move to the buyer, and the protocol rejects the seller from that block on**: the seller's NEP-641 authorizations stop resolving, the agent's spend grant no longer works for the seller's runtime, and the service's earnings keep landing in the same account, now controlled by the buyer. We do **not** claim the seller forgets anything they already know; the service is designed so that knowledge isn't worth anything (no pasted secrets, public prompt, value = name + reputation + earnings stream + verifiable track record).

## Built on (verified)
Top Level Accounts by House of Stake (live, audited mainnet; official `nfts` prompt points at it; no SDK): a rented name like `scout.<tla>` is a NEP-171 token and a keyless NEAR account running `hos-wallet`; owner controls it; `hos_grant_spend(extension, receivers, budget, tokens, expires_at)` gives an agent key capped spending; `w_resolve_auth` (NEP-641) always delegates to the current owner. On NEAR the NFT *is* the account (unlike ERC-6551/ERC-7857 where an NFT points at a separate wallet or re-encrypted metadata).

## Scope (one template, one invariant)
- One service template: a "NEAR explainer" agent that answers paid questions about any NEAR transaction/account (x402 via PingPay; responses from a NEAR AI Cloud verifiable model, TEE-signed). No third-party API keys exist in the design; the only runtime secret is minted per owner session.
- **Handover state machine** for sales through Deed: freeze → drain in-flight jobs → revoke spend grant (verified on chain) → sweep earnings to seller → list on the TLA marketplace (Intents) → ownership change observed → buyer grants a fresh spend grant → service resumes. Transfers outside Deed fail closed: the runtime re-checks ownership via `w_resolve_auth` on every job (no cache), so a changed owner stops the old owner's sessions immediately.
- **Attack harness = the centerpiece**: scripted seller attacks after a sale — replay old authorization, use old spend grant, old runtime tries to withdraw, sale during a paid request, RPC down (fail closed) — each shown failing with the on-chain reason; reproducible tests.
- **Evidence ledger**, not "P&L": receipts, linked jobs, inference cost, refunds, demo-vs-external payments labelled; recompute script.
- Thin typed adapter for the ~8 TLA calls we use (no general SDK).

## Demo (90 s)
`scout.<tla>` answers a paid question → listed and bought by a second wallet → split screen: seller's 5 attack attempts fail with on-chain errors, buyer's grant goes live, next paid answer lands in the same account under the new owner.
