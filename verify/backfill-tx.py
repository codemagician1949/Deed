#!/usr/bin/env python3
"""Fill in transaction hashes for failed attack rows in verify/report-testnet.json.

near-cli-rs doesn't print a transaction ID when a transaction fails, so the verifier can't capture
the hash of an attack that the chain rejected. This looks each one up on chain (FastNEAR tx API):
the failed transaction from the attacking account, to the expected contract and method, whose
error matches the one the verifier recorded, within the run's time window.

Each row also gets a "kind": "tx" (a transaction whose outcome is shown), "view" (a view call that
panicked or succeeded), or "state" (a balance/state read).
Usage: python3 verify/backfill-tx.py [report.json]
"""
import json, sys, urllib.request, datetime

REPORT = sys.argv[1] if len(sys.argv) > 1 else "verify/report-testnet.json"
API = "https://tx.test.fastnear.com"
r = json.load(open(REPORT))
name = r["name"]
root = name.split(".", 2)[2]  # preflight.deedbot.<root>
deed, registry = f"deed.{root}", f"registry.{root}"

def post(path, body):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))

hashes = set()
for acct in (name, deed, registry):
    try:
        hashes |= {t["transaction_hash"] for t in post("/v0/account", {"account_id": acct})["account_txs"]}
    except Exception as e:
        print("warn: history for", acct, e)
txs = []
hl = sorted(hashes)
for i in range(0, len(hl), 20):
    txs += post("/v0/transactions", {"tx_hashes": hl[i:i + 20]})["transactions"]

def failure(t):
    for rc in t["receipts"]:
        st = json.dumps(rc["execution_outcome"]["outcome"]["status"])
        if "Failure" in st:
            return st
    return None

def method(t):
    for a in t["transaction"]["actions"]:
        if isinstance(a, dict) and "FunctionCall" in a:
            return a["FunctionCall"]["method_name"]
    return None

ran = datetime.datetime.fromisoformat(r["ran_at"].rstrip("Z"))
ran_ns = int(ran.replace(tzinfo=datetime.timezone.utc).timestamp() * 1e9)
WINDOW = 30 * 60 * 10**9  # the run takes ~7 min; search the 30 min before "ran_at"

used = set()
filled = 0
for s in r["steps"]:
    what = s["what"]
    if s.get("tx"):
        s["kind"] = "tx"
        continue
    err = (s.get("error") or "")
    if s["expect"] == "fail" and err.startswith("panicked:"):
        # The CLI's error text ends with the closing `")` of its own wrapper; drop it before matching.
        needle = err.replace("panicked: ", "").rstrip('")\\ ')[:40]
        best = None
        for t in txs:
            h = t["transaction"]["hash"]
            ts = int(t["execution_outcome"]["block_timestamp"])
            f = failure(t)
            if h in used or not f or not (ran_ns - WINDOW <= ts <= ran_ns):
                continue
            if needle.replace('"', '\\"') in f or needle in f.replace('\\"', '"'):
                if best is None or ts > best[0]:
                    best = (ts, h, t)
        if best:
            used.add(best[1])
            s["tx"] = best[1]
            s["kind"] = "tx"
            s["signer"] = best[2]["transaction"]["signer_id"]
            s["method"] = method(best[2])
            filled += 1
            continue
    s["kind"] = "view" if ("sign in" in what) else "state"

json.dump(r, open(REPORT, "w"), indent=2)
print(f"filled {filled} attack tx hashes; kinds:", {k: sum(1 for s in r['steps'] if s.get('kind') == k) for k in ('tx', 'view', 'state')})
for s in r["steps"]:
    if s["expect"] == "fail":
        print(f"  {s['row']:<4} {s.get('kind'):<5} {str(s.get('tx'))[:12]:<12} {s.get('signer','')} {s.get('method','')}  {s['what'][:50]}")
