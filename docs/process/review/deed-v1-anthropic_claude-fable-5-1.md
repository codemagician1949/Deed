SCORE: 6.5

## 1. Overall
Strong alignment, real NEAR-only primitives, a genuinely good demo beat (seller locked out live). But the plan rests on three contract/NEP surfaces that are undocumented or unverifiable, is effectively mainnet-only, and hedges on the one component (TEE vault) that makes the threat model true rather than theatre. Executed exactly as written it is a top-3 `nfts` entry; it wins 1st only if the TLA SDK, the real attested vault, and the transfer tests actually ship.

## 2. Sub-scores
| Dimension | Score | Why |
|---|---|---|
| Originality / 1-of-1 | 6 | ERC-7857 "iNFT" (0G) and ERC-6551 token-bound accounts already describe "agent NFT with encrypted metadata re-encrypted on transfer via TEE". Deed's edge is that on NEAR the NFT *is* the account (wallet, name, earnings move natively) — that is a real differentiator, but you must say so in the README or a judge will think you copied 7857. |
| Track fit / organizer wishes | 9 | Builds directly on TLA (which the prompt literally points at), NEP-171, threat model, gated access, history view, transfer tests — it mirrors the official prompt's structure almost line by line.