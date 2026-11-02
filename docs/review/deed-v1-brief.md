# Idea v1 — "Deed": AI agents you can own, prove and sell like a house

Track: `nfts` (NFTs That Do Something) as lead; also `agents`.

## The NEAR tech it is built on (all real, verified 2026-11-02)
- **Top Level Accounts (TLA)** by House of Stake — live and audited (Valhalla Security) on NEAR mainnet, **no SDK yet**; the official `nfts` track prompt points at it. A rented name like `scout.agent` is a NEP-171 token AND a real NEAR account running the shared `hos-wallet` global contract (NEP-591). It has **zero access keys**; whoever holds the NFT (the "ownership account") controls it. Transfers re-point control atomically; resale settles via NEAR Intents.
- `hos-wallet` already ships **agent spending grants**: `hos_grant_spend(extension, receivers, budget_yocto, token budgets, item fences, expires_at)`, `hos_revoke_spend`, `hos_agent_status`. An agent key ("extension") can spend only to allow-listed receivers, within budget, until expiry.
- **NEP-641 Offchain Authorizations** (Final, Aug 2026): `w_resolve_auth` — any off-chain service can ask the account "do you authorize this exact payload?" The TLA wallet always delegates to its *current* owner. So off-chain control follows the NFT automatically, with no transaction and no key.
- NEAR AI Cloud verifiable (TEE-signed) inference; x402 pay-per-call via the PingPay Agent Pay facilitator; NEAR Intents.

## The problem
AI agents are becoming small businesses (they earn per call / per job), but you can't **own, value or sell** one safely. Today an "agent" is a pile of API keys, a server, a prompt and a wallet scattered across services. Sell it and the seller still has copies of every key and secret; the buyer can't verify revenue; there's no title. Agent tokenization projects (e.g. Virtuals) sell speculative tokens, not the working business.

## The product
**Deed turns an AI agent into a single NFT-account that owns everything the agent is: its name, its wallet and earnings, its spending limits, its secrets and its track record. Sell the NFT and every one of those moves to the buyer in one step — and the seller provably loses access to all of them.**

1. **Mint**: create a TLA account (e.g. `scout.agent`) — that's the agent's identity, wallet and NFT.
2. **Run**: the agent runs inside a TEE (NEAR AI Cloud / OutLayer). Its config and secrets (system prompt, third-party API keys) live in the Deed **vault**, encrypted, and are released to the runtime only under a fresh NEP-641 authorization that resolves through `scout.agent` → its *current* owner. Spending uses `hos_grant_spend` so the agent's runtime key can only pay allow-listed receivers within a budget.
3. **Earn**: the agent sells a real service (e.g. "summarise any GitHub repo") pay-per-call via x402; every payment lands in `scout.agent`. Each answer is a TEE-signed NEAR AI response, so **revenue and work are both verifiable**.
4. **Prove**: a public "title page" per agent: owner history (NEP-171 events), on-chain revenue, call count, refund rate, signed sample outputs — a verifiable P&L, like a house's deed + inspection report.
5. **Sell**: list via the TLA marketplace (Intents). On transfer: the owner changes → NEP-641 now resolves only for the buyer → vault re-wraps secrets for the buyer, old runtime sessions die, spending grant is revoked and must be re-granted by the new owner. The seller keeps nothing.

## Threat model (the hard part — how a seller could try to keep value)
- Copied secrets → secrets are only ever decrypted inside the TEE for a session authorised by the current owner; the seller never sees plaintext after setup. Third-party keys the seller pasted in could still be known to them → Deed requires rotating any pasted key at sale ("rotation checklist" enforced before listing) and prefers TEE-generated credentials.
- Live sessions → session tokens bound to an owner + expiry; transfer event invalidates them.
- Spending grant → revoked automatically in the transfer flow (or expires).
- Revenue redirection → payments go to the account itself, never to the owner.
- Funds inside at sale → TLA blocks direct transfer of a funded account unless via a registry "venue"; Deed sweeps earnings to the seller before listing (documented), and the marketplace sale settles via Intents.

## Build plan (13 days, testnet first; Intents/TLA resale mainnet-only per rules)
1. TypeScript SDK for TLA accounts (none exists): read lease/owner, call wallet actions via owner, grant/revoke spend, resolve NEP-641.
2. NEP-641 resolver + vault service (Bun) — secrets released only for current-owner authorizations; runs in/with a TEE.
3. One real agent earning via x402 with NEAR AI verifiable responses.
4. Title page web app; transfer demo showing seller locked out in real time.
5. Tests for the transfer path incl. a sale in the middle of a payment.

## Demo moment (90 s)
Agent `scout.agent` earns real micro-payments → title page shows verifiable revenue → listed and bought → seller's dashboard instantly says "access revoked", buyer's agent keeps serving and earning to the same name.
