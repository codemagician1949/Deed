# What a client should check

A Deed's runtime is an ordinary server. An honest runtime refuses to serve a name whose activation doesn't name it, but nothing stops a dishonest or outdated operator from running modified code and answering anyway. So the guarantee for customers comes from **what the client checks**, not from what the old server is able to do.

Before paying, and again when an answer arrives, a client (wallet, agent or the Deed web app) should check:

| # | Check | How | Why |
|---|---|---|---|
| 1 | The Deed is switched on | `deed.get_activation({token_id})` is not null | No activation → nobody is authorised to serve or charge |
| 2 | The activation is the current owner's | `activation.owner == registry.nft_token({token_id}).owner_id`, and the owner isn't the escrow | After a sale, the seller's activation no longer counts until the buyer activates |
| 3 | You're talking to the named runtime | use `activation.runtime_url` (recorded on chain by the owner); its `/v1/health` `runtime_id` == `activation.runtime_id` | An old operator's runtime has a different id after the buyer switches to their own |
| 4 | It runs the activated config | sha256 of the bytes at `/v1/config/raw` == `activation.config_hash` | The owner signed this exact prompt, model and limits |
| 5 | Pay through the job escrow | `deed.pay_job({token_id, request_hash: sha256(JSON request)})` with exactly `activation.price_yocto`; send `{job_id, request}` to the runtime | The contract holds the money; only the named runtime can settle it, into the name, after an owner re-check; otherwise it is refunded (by anyone after 15 min) |
| 6 | The answer is signed by the attested enclave | recompute sha256 of the request and response bytes, recover the EIP-191 signer from NEAR AI's signature and find it in NEAR AI's attestation report for the model | Proves the text came from the model in the enclave, unmodified |

Checks 1–4 are what [verify/check-testnet.py](../verify/check-testnet.py) (section 4) does for the hosted runtime. Check 6 is what the runtime stores with each job ([runtime/src/tee.ts](../runtime/src/tee.ts)) and what the Deed page re-displays; a careful client recomputes it itself from the stored `requestBody`, `responseBody` and signature.

**What these checks don't cover.** Check 6 proves an authentic answer, not a correct one. A runtime operator that passes checks 1–4 can still refuse service; it then can't be paid, and the customer (or anyone) reclaims the payment with `refund_job` after 15 minutes. The runtime id in `/v1/health` is self-reported; what binds it is that only the account named in the job can settle it on chain.
