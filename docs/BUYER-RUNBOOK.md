# Independent buyer: runbook

The test this proves: **someone outside the team** buys a Deed with their own wallet, runs Preflight on their own server with their own NEAR AI key, switches the Deed onto it, and a customer is served by the new runtime, while the old (team) runtime stops being the authorised one. Everything is on NEAR testnet; nothing costs real money.

## Who is needed

| Role | Who | Needs | Time |
|---|---|---|---|
| **Seller** | the team (`kofi.deedhq.testnet`, the Deed's current owner) | nothing new | 5 min |
| **Buyer** | a person outside the team, on their own machine | a NEAR testnet wallet with **~3 test NEAR** ([faucet](https://near-faucet.io)); a [NEAR AI Cloud](https://cloud.near.ai) API key (a few cents of inference); a [Railway](https://railway.com) account **or** Docker on a machine with a public URL | 30–40 min |
| **Customer** | ideally a second outside person (the buyer can play it with a second wallet if not) | a testnet wallet with ~0.2 test NEAR | 5 min |

Record the buyer's screen in **one continuous take** from step 3 to step 8 (browser plus a terminal). Keep every transaction hash the wallet shows.

## Steps

**1. Seller lists the Deed** (team). At https://deed-near.vercel.app/console, connected as the owner, list `preflight.deedbot.deedhq.testnet` at **1 NEAR**. The wallet wipes the seller's agent permissions and pays out the earnings in the same step. While it's listed the service keeps answering for the seller.

**2. A customer is served before the sale** (customer). At https://deed-near.vercel.app/try, pick a transaction and pay: the payment goes into the Deed contract's job escrow. The answer comes from the team runtime, which then settles the job into the name. Note the payment hash.

**3. Buyer buys** (buyer, recording starts). Open https://deed-near.vercel.app/deed/preflight.deedbot.deedhq.testnet, connect your testnet wallet, click **Buy this Deed**, confirm 1 NEAR. The page's **History** shows the transfer, the wipe and the seller's payment, all in that one transaction.

**4. Nothing to wait for.** The seller was paid in the sale transaction. A job paid before the sale and not yet settled is refunded to its customer by the contract, never paid into the buyer's name.

**5. Buyer starts their own runtime.** Fork https://github.com/codemagician1949/Deed, then either:
- **Railway:** New project → Deploy from GitHub repo (the fork). It builds `runtime/Dockerfile` via `railway.json`. Add a volume mounted at `/data`. Variables: `RUNTIME_ID=<your-account.testnet>`, `NEARAI_API_KEY=<your key>`, `RUNTIME_KEY=<limited key>` (below). Generate a public domain.
- **Docker:** from the repo root, `docker build -f runtime/Dockerfile -t preflight . && docker run -p 8787:8787 -v preflight-data:/data -e RUNTIME_ID=<your-account.testnet> -e NEARAI_API_KEY=<your key> -e RUNTIME_KEY=<limited key> preflight`, behind any public HTTPS URL.
- **The limited key:** with near-cli-rs and your account's full key in the legacy keychain, `ROOT=<your-account.testnet> RUNTIME_ID=<your-account.testnet> DEED=deed.deedhq.testnet deploy/runtime-key.sh` adds a function-call key that can only call `settle_job`/`refund_job` on the Deed contract and writes it to `.env` as `RUNTIME_KEY`. Without it your runtime can't settle, so paid jobs are refunded after 15 minutes.

Check it: `curl https://<your-runtime>/v1/health` shows `"runtime_id": "<your-account.testnet>"`, `"config_hash": "678ff1f4…"`, `"can_answer": true` and `"can_settle": true`. Your runtime starts with an empty job ledger.

**6. Buyer switches the Deed onto their runtime.** At https://deed-near.vercel.app/console (connected as the buyer), open **Run it on your own runtime**, enter `<your-account.testnet>` and your runtime's URL (it is recorded on chain in the activation, so clients find your runtime without asking anyone), set a price, click **Switch on**. Note the activation hash.

**7. The old runtime is no longer authorised.** Two ways to see it:
- `python3 verify/check-testnet.py --runtime https://preflight-production-8802.up.railway.app` now **fails** "activation names this runtime", and `python3 verify/check-testnet.py --runtime https://<your-runtime>` **passes** all checks.
- https://deed-near.vercel.app/try (team runtime) shows ✗ "This runtime is the one the owner switched on" and blocks paying; https://deed-near.vercel.app/try?runtime=https://<your-runtime> shows ✓ ✓.

**8. A customer is served by the new runtime** (customer). Open https://deed-near.vercel.app/try (it now finds your runtime from the activation), pay. The answer comes from the buyer's runtime with its enclave checks, and the payment lands in the Deed's wallet in the buyer's era. Recording ends.

## What to send back to the team

- The buyer's and customer's testnet account names (they'll be labelled "outside account" on the Deed page).
- Transaction hashes: buy, activation, both customer payments and their settlements.
- The buyer's runtime URL (kept up through judging if possible, or the job ledger: `curl https://<your-runtime>/v1/jobs?name=preflight.deedbot.deedhq.testnet`).
- The recording, and **anything that broke or needed help**: that goes in the evidence as it happened.

## Refunds on the buyer's runtime

Nobody owes refunds out of pocket any more: a job's payment stays in the Deed contract until it is settled. If an answer fails, the runtime calls `refund_job` with its limited key; if the runtime is down, **anyone** can call `refund_job` after 15 minutes and the customer gets the payment back.

## Alternative: start a fresh Deed instead of buying this one

If the team isn't around to list, an outsider can create their own Deed at https://deed-near.vercel.app/new (about 0.36 test NEAR), run steps 5–8 on it, and then sell it to a second person through the same pages.
