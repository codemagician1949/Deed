#!/usr/bin/env python3
"""Recompute a Deed title page's headline numbers from chain data, independently of the web app.

    python3 verify/recompute-title.py [token_id] [--compare]

Sources: the account history of the name and of the Deed contract (FastNEAR's public transaction index,
the only per-account history NEAR offers), and the Deed contract's own state read over RPC (every job and
sale record). Every number below is re-derived by this file's own code, from the same definitions the page
states, and the job and sale numbers are cross-checked against contract state. With --compare it also runs
the page's own loader (web/src/lib/live.ts, needs bun) and checks that both give the same numbers.

Definitions (as on the page):
  Paid into the name   successful plain NEAR transfers to the name + jobs the contract settled into it
  Payments             the number of those
  Misuse attempts      failed transactions that tried to act as the name, call the Deed contract about it,
                       or move it in the registry
  Owners so far        holding periods: listing into the escrow and cancelling don't count as a new owner
"""
import base64, json, os, subprocess, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEP = json.load(open(os.path.join(ROOT, "deploy", "testnet.json")))
RPC = DEP.get("rpc", "https://rpc.testnet.fastnear.com")
TXAPI = "https://tx.test.fastnear.com"
DEED, REGISTRY = DEP["deed"], DEP["registry"]
args = [a for a in sys.argv[1:] if not a.startswith("--")]
TOKEN = args[0] if args else "preflight." + DEP["tla"]


def post(url, body, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
            return json.load(urllib.request.urlopen(req, timeout=60))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503, 504) or i == tries - 1:
                raise
            time.sleep(1 + i)
        except (urllib.error.URLError, TimeoutError, OSError):
            if i == tries - 1:
                raise
            time.sleep(2 + i)


def view(contract, method, a):
    r = post(RPC, {"jsonrpc": "2.0", "id": 1, "method": "query", "params": {"request_type": "call_function", "finality": "final",
              "account_id": contract, "method_name": method, "args_base64": base64.b64encode(json.dumps(a).encode()).decode()}})
    return json.loads(bytes(r["result"]["result"]).decode())


def near(y):
    return int(y) / 1e24


# ---- history ----
def hashes(account):
    return [t["transaction_hash"] for t in post(TXAPI + "/v0/account", {"account_id": account}).get("account_txs", [])]

name_h, deed_h = hashes(TOKEN), hashes(DEED)
all_h = list(dict.fromkeys(name_h + deed_h))
txs = []
for i in range(0, len(all_h), 20):
    txs += post(TXAPI + "/v0/transactions", {"tx_hashes": all_h[i:i + 20]}).get("transactions", [])


def summarize(t):
    tx, receipts = t["transaction"], t.get("receipts") or []
    events, failed = [], False
    for rc in receipts:
        o = rc["execution_outcome"]["outcome"]
        for l in o["logs"]:
            if l.startswith("EVENT_JSON:"):
                try:
                    events.append(json.loads(l[11:]))
                except ValueError:
                    pass
        if rc["receipt"]["receiver_id"] == tx["receiver_id"] and "Failure" in json.dumps(o["status"]):
            failed = True
    acts = []
    for a in tx["actions"]:
        if isinstance(a, str):
            acts.append({"kind": a})
            continue
        kind, p = next(iter(a.items()))
        args_ = None
        if isinstance(p, dict) and p.get("args"):
            try:
                args_ = json.loads(base64.b64decode(p["args"]))
            except Exception:
                args_ = None
        acts.append({"kind": kind, "method": (p or {}).get("method_name"), "deposit": (p or {}).get("deposit"), "args": args_})
    ts = int((t.get("execution_outcome") or {}).get("block_timestamp") or (receipts[0]["execution_outcome"]["block_timestamp"] if receipts else 0))
    return {"hash": tx["hash"], "signer": tx["signer_id"], "receiver": tx["receiver_id"], "ok": not failed, "events": events, "acts": acts, "ts": ts}

S = sorted((summarize(t) for t in txs), key=lambda s: s["ts"])
relevant = [s for s in S if s["receiver"] == TOKEN or s["hash"] in name_h or any(
    (e.get("data") if isinstance(e.get("data"), dict) else (e.get("data") or [{}])[0]).get("token_id") == TOKEN
    or json.dumps(e.get("data")).find(f'"{TOKEN}"') >= 0 for e in s["events"]) or any(
    (a.get("args") or {}).get("token_id") == TOKEN for a in s["acts"] if isinstance(a.get("args"), dict))]

paid, payments, blocked, settled_ev = 0, 0, 0, set()
for s in relevant:
    for a in s["acts"]:
        if a["kind"] == "Transfer" and s["receiver"] == TOKEN and s["ok"] and a.get("deposit"):
            paid += int(a["deposit"]); payments += 1
    if not s["ok"]:
        if s["receiver"] == TOKEN:
            blocked += 1
        elif s["receiver"] == DEED:
            a = next((a for a in s["acts"] if a.get("method")), {})
            tid = (a.get("args") or {}).get("token_id") if isinstance(a.get("args"), dict) else None
            blocked += (not tid or tid == TOKEN)
        if s["receiver"] == REGISTRY and any(a.get("method") == "transfer_sub_account" for a in s["acts"]):
            blocked += 1
    for e in s["events"]:
        d = e["data"][0] if isinstance(e.get("data"), list) and e["data"] else e.get("data") or {}
        if e.get("standard") == "deed" and e.get("event") == "job_settled" and (d.get("job") or {}).get("token_id") == TOKEN:
            j = d["job"]; paid += int(j["amount_yocto"]); payments += 1; settled_ev.add(int(j["id"]))

# owners: holding periods from NEP-171 transfer events
first, moves = None, []
for s in relevant:
    for e in s["events"]:
        d = e["data"][0] if isinstance(e.get("data"), list) and e["data"] else e.get("data") or {}
        if e.get("standard") == "nep171" and TOKEN in (d.get("token_ids") or []):
            if e.get("event") == "nft_mint":
                first = d.get("owner_id")
            elif e.get("event") == "nft_transfer":
                first = first or d.get("old_owner_id"); moves.append((d["old_owner_id"], d["new_owner_id"]))
holder, periods = first, 0
for frm, to in moves:
    if to == DEED or (frm == DEED and to == holder):
        continue
    periods += 1; holder = to
owners = periods + 1

# ---- cross-checks against contract state (not the index) ----
jobs_state, i = {}, 1
while True:
    j = view(DEED, "get_job", {"job_id": str(i)})
    if not j:
        break
    if j["token_id"] == TOKEN:
        jobs_state[i] = j
    i += 1
settled_state = {k for k, j in jobs_state.items() if isinstance(j["state"], dict) and "Settled" in j["state"]}
sales, i = [], 1
while True:
    s = view(DEED, "get_sale", {"sale_id": str(i)})
    if not s:
        break
    if s["token_id"] == TOKEN:
        sales.append(s)
    i += 1
owner_now = view(REGISTRY, "nft_token", {"token_id": TOKEN})["owner_id"]
listing = view(DEED, "get_listing", {"token_id": TOKEN})
holder_now = listing["seller"] if (owner_now == DEED and listing) else owner_now

fails = 0
def check(ok, label):
    global fails
    print(("PASS " if ok else "FAIL ") + label); fails += not ok

print(f"== {TOKEN}: recomputed from {len(relevant)} transactions\n")
print(f"  Paid into the name   {near(paid):.4f} NEAR")
print(f"  Payments             {payments}")
print(f"  Misuse attempts      {blocked}")
print(f"  Owners so far        {owners}\n")
check(settled_ev == settled_state, f"jobs settled into the name: {len(settled_state)} in contract state = {len(settled_ev)} job_settled events")
check(sum(int(jobs_state[k]['amount_yocto']) for k in settled_state) <= paid, "contract-state settled amounts are included in 'Paid into the name'")
check(holder == holder_now, f"current holder from the transfer history ({holder}) = registry/escrow state now ({holder_now})")
from_escrow = [to for frm, to in moves if frm == DEED and to != DEED]
check(all(s["buyer"] in from_escrow for s in sales) and all(s["state"] == "Paid" for s in sales),
      f"{len(sales)} sale records in contract state: each buyer received the name from the escrow in the history, and each sale is Paid")

if "--compare" in sys.argv:
    js = f'import {{ loadDeed }} from "{ROOT}/web/src/lib/live"\nconst d = await loadDeed("{TOKEN}")\nconsole.log(JSON.stringify({{ earned: d.stats.earnedNear, payments: d.stats.jobs, blocked: d.stats.refunds, owners: d.holders.length }}))\n'
    p = os.path.join(ROOT, "web", ".recompute-compare.ts"); open(p, "w").write(js)
    try:
        out = subprocess.run(["bun", p], capture_output=True, text=True, cwd=os.path.join(ROOT, "web"), timeout=300).stdout.strip().splitlines()[-1]
    finally:
        os.remove(p)
    w = json.loads(out)
    print(f"\n== the page's own code says: {w}")
    check(abs(w["earned"] - near(paid)) < 1e-6, "Paid into the name matches")
    check(w["payments"] == payments, "Payments match")
    check(w["blocked"] == blocked, "Misuse attempts match")
    check(w["owners"] == owners, "Owners so far match")

print(f"\n{'ALL CHECKS PASS' if fails == 0 else str(fails) + ' FAILED'}")
sys.exit(fails)
