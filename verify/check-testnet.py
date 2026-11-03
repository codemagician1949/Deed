#!/usr/bin/env python3
"""Read-only check of the live Deed deployment on NEAR testnet. No wallet, no NEAR, no keys.

  python3 verify/check-testnet.py [--runtime https://preflight-production-8802.up.railway.app]

Checks:
  1. Each House of Stake replica contract on testnet has the same code hash as the live mainnet contract
     (both read now, not from our files), and as the vendored deploy/mainnet-wasm/*.wasm.
  2. The deed contract is deployed and answers views; the demo Deed's owner and activation are readable.
  3. Every transaction in verify/report-testnet.json exists on chain, and its outcome (accepted or
     rejected) matches what the report says.
  4. Optionally, the hosted Preflight runtime is up and serves the same config fingerprint the Deed's
     on-chain activation names.
Exit code = number of failed checks.
"""
import base64, hashlib, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEP = json.load(open(os.path.join(ROOT, "deploy", "testnet.json")))
TESTNET = DEP.get("rpc", "https://rpc.testnet.fastnear.com")
MAINNET = "https://rpc.mainnet.fastnear.com"
TXAPI = "https://tx.test.fastnear.com"
runtime = sys.argv[sys.argv.index("--runtime") + 1] if "--runtime" in sys.argv else None
fails = 0
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58(b):
    n, s = int.from_bytes(b, "big"), ""
    while n:
        n, r = divmod(n, 58)
        s = B58[r] + s
    return s


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))


def rpc(url, method, params):
    r = post(url, {"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    if "error" in r:
        raise RuntimeError(r["error"])
    return r["result"]


def code_hash(url, account, global_id=False):
    if global_id:
        r = rpc(url, "query", {"request_type": "view_global_contract_code_by_account_id", "finality": "final", "account_id": account})
        return r["hash"]
    return rpc(url, "query", {"request_type": "view_account", "finality": "final", "account_id": account})["code_hash"]


def view(url, contract, method, args):
    r = rpc(url, "query", {"request_type": "call_function", "finality": "final", "account_id": contract,
                           "method_name": method, "args_base64": base64.b64encode(json.dumps(args).encode()).decode()})
    return json.loads(bytes(r["result"]))


def check(ok, label):
    global fails
    print(("PASS " if ok else "FAIL ") + label)
    if not ok:
        fails += 1


print("== 1. Replica bytecode = live mainnet bytecode")
pairs = [
    ("tla_registry.wasm", DEP["registry"], "registry.hos", False),
    ("hos_extension.wasm", DEP["extension"], "ext.hos", False),
    ("mpc_recovery.wasm", DEP["recovery"], "rec.hos", False),
    ("registrar.wasm", DEP["tla"], "bot", False),
    ("hos_wallet.wasm", DEP["walletImpl"], "impl.hos", True),
]
for wasm, testnet_acct, mainnet_acct, is_global in pairs:
    local = b58(hashlib.sha256(open(os.path.join(ROOT, "deploy", "mainnet-wasm", wasm), "rb").read()).digest())
    try:
        t = code_hash(TESTNET, testnet_acct, is_global)
        if mainnet_acct == "bot":  # mainnet TLAs run the registrar as a global contract (gpub.hos)
            m = rpc(MAINNET, "query", {"request_type": "view_code", "finality": "final", "account_id": "bot"})["hash"]
        else:
            m = code_hash(MAINNET, mainnet_acct, is_global)
        check(t == m == local, f"{testnet_acct} {t[:12]}… = mainnet {mainnet_acct} {m[:12]}… = vendored {wasm}")
    except Exception as e:
        check(False, f"{testnet_acct}: {e}")

print("\n== 2. Deed contract and the demo Deed")
try:
    name = "preflight." + DEP["tla"]
    token = view(TESTNET, DEP["registry"], "nft_token", {"token_id": name})
    act = view(TESTNET, DEP["deed"], "get_activation", {"token_id": name})
    item = view(TESTNET, name, "nft_item_info", {})
    check(token is not None and item["owner_id"] == token["owner_id"], f"{name}: registry owner {token['owner_id']} = the account's own nft_item_info owner")
    check(item["collection_id"] == DEP["registry"], f"the account reports collection {item['collection_id']}")
    print(f"     activation: {act and (act['owner'], 'v' + str(act['version']), act['config_hash'][:12] + '…')}")
except Exception as e:
    check(False, f"deed views: {e}")

print("\n== 3. Published live-run report matches the chain")
rep = json.load(open(os.path.join(ROOT, "verify", "report-testnet.json")))
hashes = [s["tx"] for s in rep["steps"] if s.get("tx")]
found = {}
for i in range(0, len(hashes), 20):
    for t in post(TXAPI + "/v0/transactions", {"tx_hashes": hashes[i:i + 20]}).get("transactions", []):
        recv = t["transaction"]["receiver_id"]
        failed = any("Failure" in json.dumps(rc["execution_outcome"]["outcome"]["status"])
                     for rc in t["receipts"] if rc["receipt"]["receiver_id"] == recv)
        found[t["transaction"]["hash"]] = failed
for s in rep["steps"]:
    if not s.get("tx"):
        continue
    if s["tx"] not in found:
        check(False, f"{s['row']}: tx {s['tx'][:10]}… not found on chain")
        continue
    want_fail = s["expect"] == "fail"
    check(found[s["tx"]] == want_fail, f"{s['row']:<5} {s['tx'][:10]}… {'rejected' if found[s['tx']] else 'accepted'} on chain: {s['what'][:60]}")

if runtime:
    print("\n== 4. Hosted Preflight runtime")
    try:
        h = json.load(urllib.request.urlopen(runtime.rstrip("/") + "/v1/health", timeout=30))
        check(True, f"{runtime} up · model {h['model']} · can_answer {h['can_answer']}")
        check(act is not None and h["config_hash"] == act["config_hash"], "runtime config fingerprint = the Deed's on-chain activation")
        check(h["runtime_id"] == (act or {}).get("runtime_id"), f"activation names this runtime ({h['runtime_id']})")
    except Exception as e:
        check(False, f"runtime: {e}")

print(f"\n{'ALL CHECKS PASS' if fails == 0 else str(fails) + ' FAILED'}")
sys.exit(fails)
