# Writing the held-out set (for someone outside the team)

The 24 cases in [cases.json](cases.json) were written by the team, and the risk flags were fixed while looking at them, so the 22/24 there is optimistic. A fair measure needs transactions written and labelled **by someone who hasn't seen [src/risk.ts](../src/risk.ts) or those results**, with the labels fixed in git before anything runs.

## 1. Write the cases (about 20, 30–60 min)

Copy [heldout.template.json](heldout.template.json) to `heldout.json` and add NEAR transactions a wallet user might be asked to sign: ordinary ones and dangerous ones, in your own mix. For each, pick one label:

- `safe`: fine to sign for a typical user.
- `check`: legitimate in some contexts; the user should confirm they meant it.
- `danger`: a drainer or irreversible pattern a typical user should not sign.

and say why in a few words. The transaction format is `{ receiver_id, actions: [{ type, params }] }`, with action types `Transfer`, `FunctionCall`, `AddKey`, `DeleteKey`, `DeleteAccount`, `DeployContract`, `Stake` (amounts in yoctoNEAR as strings). Real transactions copied from an explorer are welcome.

## 2. Freeze, commit, then run

```bash
cd runtime
bun run eval/heldout.ts freeze eval/heldout.json      # writes eval/heldout.lock.json (sha256 of your file)
git add eval/heldout.json eval/heldout.lock.json && git commit -m "eval: held-out set by <name>, frozen"
bun run eval/heldout.ts run eval/heldout.json --ai    # flags + model; writes eval/heldout-RESULTS.md
```

`run` refuses if the file isn't committed, changed after freezing, or doesn't match its lock, so the git history shows the labels existed before the results. The report gives exact matches, **dangerous misses** (danger rated safe), under-rated cases, **false alarms** (safe rated check or danger), latency and model tokens, for the free flags and for the model's verdict separately. Whatever it shows gets published as it is; no relabelling, and any fix after it is tested on a new set.
