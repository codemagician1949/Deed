#!/usr/bin/env python3
"""Read-only check of the live Deed deployment on NEAR testnet. No wallet, no NEAR, no keys.

  python3 verify/check-testnet.py [--runtime https://preflight-production-8802.up.railway.app]

Checks:
  1. Each House of Stake replica contract on testnet has the same code hash as the live mainnet contract
     (both read now, not from our files), and as the vendored deploy/mainnet-wasm/*.wasm.
  2. The deed contract is deployed and answers views; the demo Deed's owner and activation are readable.
  3. Every transaction in verify/report-testnet.json exists on chain, its outcome (accepted or rejected)
     matches the report, and every rejected one failed with the exact error the report expects.
     Then a few facts are re-read live: the old owner still can't sign in as the name (NEP-641), the old
     agent is still disabled, and the listing's sweep event paid the seller (G3).
  4. Optionally, the hosted Preflight runtime is up; the sha256 of the raw config bytes it serves equals
     the fingerprint it reports, the Deed's on-chain activation, and runtime/preflight.config.json here.
     The deployed Deed contract's code hash equals the one recorded at deploy (deploy/testnet.json).
Exit code = number of failed checks.
"""
import base64, hashlib, json, os, sys, urllib.parse, urllib.request

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
import re
found, failure_text, logs = {}, {}, {}
for i in range(0, len(hashes), 20):
    for t in post(TXAPI + "/v0/transactions", {"tx_hashes": hashes[i:i + 20]}).get("transactions", []):
        recv = t["transaction"]["receiver_id"]
        h = t["transaction"]["hash"]
        bad = [json.dumps(rc["execution_outcome"]["outcome"]["status"]) for rc in t["receipts"]
               if "Failure" in json.dumps(rc["execution_outcome"]["outcome"]["status"])]
        found[h] = any("Failure" in json.dumps(rc["execution_outcome"]["outcome"]["status"])
                       for rc in t["receipts"] if rc["receipt"]["receiver_id"] == recv)
        failure_text[h] = " ".join(bad).replace('\\"', '"')
        logs[h] = [l for rc in t["receipts"] for l in rc["execution_outcome"]["outcome"]["logs"]]
for s in rep["steps"]:
    if not s.get("tx"):
        continue
    if s["tx"] not in found:
        check(False, f"{s['row']}: tx {s['tx'][:10]}… not found on chain")
        continue
    want_fail = s["expect"] == "fail"
    ok = found[s["tx"]] == want_fail
    why = ""
    if ok and want_fail and s.get("expect_error"):
        ok = re.search(s["expect_error"], failure_text[s["tx"]], re.I) is not None
        why = f" with /{s['expect_error']}/" if ok else f" but NOT with /{s['expect_error']}/"
    check(ok, f"{s['row']:<5} {s['tx'][:10]}… {'rejected' if found[s['tx']] else 'accepted'} on chain{why}: {s['what'][:60]}")

# Re-read a few facts live (they hold until the name changes hands again).
seller, agent = rep.get("seller"), rep.get("agent")
if seller and agent:
    try:
        cur = view(TESTNET, DEP["registry"], "nft_token", {"token_id": rep["name"]})["owner_id"]
        blob = json.dumps({"payload": "sign in to deed", "owner": seller, "authorization": "x"})
        try:
            view(TESTNET, rep["name"], "w_resolve_auth", {"path": [], "authorization": blob})
            refused = False
        except Exception:
            refused = True
        if cur != seller:
            check(refused, f"A4    live: the old owner {seller} still can't sign in as {rep['name']} (NEP-641)")
        st = view(TESTNET, rep["name"], "hos_agent_status", {"extension": agent})
        check(not st["extension_enabled"] and st["grant"] is None, f"G1    live: the old agent {agent} is still disabled, no grant")
    except Exception as e:
        check(False, f"live re-read: {e}")
    list_tx = next((s["tx"] for s in rep["steps"] if s["row"] == "list" and s.get("tx")), None)
    if list_tx in logs:
        swept = [json.loads(l[11:]) for l in logs[list_tx] if l.startswith("EVENT_JSON:") and "swept_near" in l]
        to = [d.get("to") or d.get("payout_account") or d.get("receiver_id") for e in swept for d in (e["data"] if isinstance(e["data"], list) else [e["data"]])]
        check(seller in to, f"G3    the listing's sweep event paid the seller ({', '.join(str(x) for x in to) or 'no sweep event'})")

if runtime:
    print("\n== 4. Hosted Preflight runtime")
    try:
        base = runtime.rstrip("/")
        h = json.load(urllib.request.urlopen(base + "/v1/health", timeout=30))
        check(True, f"{runtime} up · model {h['model']}")
        # Monitoring: the daily CI run fails (and GitHub emails the owner) if the service can't answer or settle.
        check(bool(h.get("can_answer")) and bool(h.get("can_settle")), f"it can answer (NEAR AI key set: {h.get('can_answer')}) and settle on chain (key set: {h.get('can_settle')})")
        ai = h.get("ai") or {}
        bad_ai = ai.get("last_error_at") and (not ai.get("last_ok_at") or ai["last_error_at"] > ai["last_ok_at"]) and re.search(r"HTTP (401|402|403|429)", ai.get("last_error") or "")
        check(not bad_ai, "its last NEAR AI call wasn't refused for credit or auth" + (f" (last error: {ai.get('last_error')})" if bad_ai else f" (last ok: {ai.get('last_ok_at') or 'none since restart'})"))
        if h.get("settle_key"):
            ak = rpc(TESTNET, "query", {"request_type": "view_access_key", "finality": "final", "account_id": h["runtime_id"], "public_key": h["settle_key"]})
            perm = (ak or {}).get("permission", {})
            fc = perm.get("FunctionCall", {}) if isinstance(perm, dict) else {}
            left = int(fc.get("allowance") or 0) / 1e24
            check(bool(fc) and set(fc.get("method_names", [])) == {"settle_job", "refund_job"} and left >= 0.05,
                  f"settle key is a function-call key for settle_job/refund_job only, with {left:.3f} NEAR of gas allowance left (needs ≥ 0.05)")
        raw = urllib.request.urlopen(base + "/v1/config/raw", timeout=30).read()
        served = hashlib.sha256(raw).hexdigest()
        local = hashlib.sha256(open(os.path.join(ROOT, "runtime", "preflight.config.json"), "rb").read()).hexdigest()
        check(served == h["config_hash"] == local, f"sha256 of the config bytes it serves ({served[:12]}…) = what it reports = runtime/preflight.config.json here")
        check(act is not None and served == act["config_hash"], "…and = the fingerprint in the Deed's on-chain activation")
        check(h["runtime_id"] == (act or {}).get("runtime_id"), f"activation names this runtime ({h['runtime_id']})")
        if act and act.get("runtime_url"):
            check(act["runtime_url"].rstrip("/") == base, f"activation's on-chain runtime_url = {act['runtime_url']}")
    except Exception as e:
        check(False, f"runtime: {e}")

if DEP.get("deedCodeHash"):
    print("\n== 5. Deployed Deed contract")
    try:
        h = code_hash(TESTNET, DEP["deed"])
        check(h == DEP["deedCodeHash"], f"{DEP['deed']} code hash {h[:12]}… = recorded at deploy (deploy/testnet.json)")
    except Exception as e:
        check(False, f"deed code hash: {e}")

if runtime:
    # Independent check of NEAR AI's enclave claims, with a fresh nonce so the evidence can't be replayed:
    # the Intel TDX quote (verified by a public DCAP verifier) and the NVIDIA GPU evidence (verified by
    # NVIDIA's own attestation service) must both carry our nonce, and the TDX report data must bind the
    # model's signing address, the same address that signed the answers the runtime served.
    print("\n== 6. NEAR AI enclave attestation (fresh nonce, verified independently)")
    UA = {"content-type": "application/json", "user-agent": "deed-verify/1.0 (+https://github.com/codemagician1949/Deed)"}
    def post_ua(url, body):
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=UA)
        return json.load(urllib.request.urlopen(req, timeout=90))
    try:
        import secrets
        model = json.load(urllib.request.urlopen(runtime.rstrip("/") + "/v1/health", timeout=30))["model"]
        nonce = secrets.token_hex(32)
        rep_ai = json.load(urllib.request.urlopen(urllib.request.Request(
            f"https://cloud-api.near.ai/v1/attestation/report?model={urllib.parse.quote(model)}&signing_algo=ecdsa&nonce={nonce}", headers=UA), timeout=60))
        m = next(a for a in rep_ai["model_attestations"] if a.get("model_name") == model)
        addr = m["signing_address"].lower().removeprefix("0x")
        check(m.get("request_nonce") == nonce, f"report for {model} answers our nonce {nonce[:12]}…")
        tdx = post_ua("https://cloud-api.phala.network/api/v1/attestations/verify", {"hex": m["intel_quote"]})
        rd = str(tdx.get("quote", {}).get("body", {}).get("reportdata", "")).lower().removeprefix("0x")
        check(tdx.get("quote", {}).get("verified") is True, "Intel TDX quote verified (DCAP, Intel collateral, via Phala's public verifier)")
        check(rd == addr + "0" * 24 + nonce, f"TDX report data = signing address 0x{addr[:10]}… + our nonce (the key lives in that enclave, and the quote is fresh)")
        nv = post_ua("https://nras.attestation.nvidia.com/v3/attest/gpu", json.loads(m["nvidia_payload"]))
        claims = json.loads(base64.urlsafe_b64decode(nv[0][1].split(".")[1] + "=="))
        check(claims.get("x-nvidia-overall-att-result") is True and claims.get("eat_nonce") == nonce,
              f"NVIDIA GPU evidence verified by NVIDIA's attestation service ({len(nv[1]) if len(nv) > 1 else '?'} GPUs, our nonce)")
        jobs_pub = json.load(urllib.request.urlopen(runtime.rstrip("/") + f"/v1/jobs?name={name}", timeout=30))
        jobs_pub = jobs_pub.get("jobs", jobs_pub) if isinstance(jobs_pub, dict) else jobs_pub
        signers = {((j.get("answer") or {}).get("check") or {}).get("recovered", "").lower().removeprefix("0x") for j in jobs_pub if j.get("answer")}
        signers.discard("")
        check(addr in signers, f"the answers the runtime served were signed by this attested address (signer recorded with each answer: {', '.join('0x' + s[:8] + '…' for s in sorted(signers)) or 'none'})")
    except Exception as e:
        check(False, f"attestation: {e}")

print(f"\n{'ALL CHECKS PASS' if fails == 0 else str(fails) + ' FAILED'}")
sys.exit(fails)
