# Preflight risk-flag evaluation

Deterministic flags only ([src/risk.ts](../src/risk.ts)), on 24 labelled transactions ([cases.json](cases.json): 8 safe, 8 check, 8 danger). The set and labels were written by the team, so this is a sanity check, not an independent benchmark. The AI explanation is evaluated separately (it needs paid inference).

**Read with care:** the first run ([RESULTS-v1.md](RESULTS-v1.md): 14/24, 1 dangerous miss, 2 false alarms) found real bugs, which were fixed in src/risk.ts. Because the fixes were made looking at these same cases, this result is optimistic; a held-out set written by independent testers is the fair measure and is still to do. Cases still rated differently from their label are left as they are, not relabelled.

- Exact match: **22/24**
- Dangerous misses (danger rated safe): **0**
- Under-rated (any case rated lower than its label): **2** (d5, a7)
- False alarms (safe rated check/danger): **0**
- Latency: 0.46 ms max per transaction (in-process); inference cost for flags: none

| label \ rated | safe | check | danger |
|---|---|---|---|
| safe | 8 | 0 | 0 |
| check | 1 | 7 | 0 |
| danger | 0 | 1 | 7 |

| case | label | rated | flags | why |
|---|---|---|---|---|
| b1 | safe | safe | info:value | small NEAR transfer to a named account |
| b2 | safe | safe | info:moves_assets | FT transfer of a small amount with the 1 yocto security deposit |
| b3 | safe | safe | info:value | storage deposit for a token |
| b4 | safe | safe | info:value | wrapping 2 NEAR |
| b5 | safe | safe | — | voting / view-like call with no deposit |
| b6 | safe | safe | info:function_call_key | adding a function-call key limited to a game contract |
| b7 | safe | safe | — | claiming staking rewards |
| b8 | safe | safe | info:value | NFT mint paying 0.1 NEAR |
| d1 | danger | danger | high:full_access_key | adds a full-access key: classic drainer |
| d2 | danger | danger | high:unlimited_approval | unlimited ft_approve to an unknown spender |
| d3 | danger | danger | high:delete_account | deletes the account, sending everything to a stranger |
| d4 | danger | danger | high:deploy_contract | deploys new code to the user's own account |
| d5 | danger | **check** | medium:large_value | sends 50 NEAR to a 'verification' contract |
| d6 | danger | danger | high:full_access_key, medium:delete_key | AddKey + DeleteKey of the user's own key: account takeover |
| d7 | danger | danger | info:moves_assets, high:extreme_amount, medium:lookalike_name | transfers the user's whole FT balance to a lookalike name |
| d8 | danger | danger | high:nft_approval | nft_approve to an unknown marketplace for all-time control |
| a1 | check | check | medium:transfer_call | ft_transfer_call into a DEX: normal for swaps, but moves tokens into a contract |
| a2 | check | check | medium:approval | bounded approval of 100 tokens to a known DEX |
| a3 | check | check | medium:transfer_call | listing an NFT on a marketplace via nft_transfer_call |
| a4 | check | check | medium:large_value | 15 NEAR transfer: fine if intended, large for most users |
| a5 | check | check | medium:opaque_call | multisig / wallet execute: inner actions are opaque |
| a6 | check | check | medium:large_value | staking 30 NEAR with a validator |
| a7 | check | **safe** | — | storage_withdraw of everything from a contract |
| a8 | check | check | medium:delete_key | removing one of the user's keys (could be cleanup, could lock them out) |
