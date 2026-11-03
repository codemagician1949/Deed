#!/usr/bin/env bash
# Live sale on NEAR testnet + the seller's attack matrix. Writes verify/report-testnet.json
# with one entry per step: what was tried, what we expected, what happened, the tx hash and
# the on-chain error. Every attack row must FAIL on-chain for the run to pass.
#
# Prereqs: deploy/testnet.sh and deploy/seed-testnet.sh have run (kofi owns and activated the name).
# Usage:   ROOT=deedhq.testnet verify/testnet-sale.sh
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=${ROOT:-deedhq.testnet}
NET="network-config testnet"; SIGN="sign-with-legacy-keychain send"
RPC=${RPC:-https://rpc.testnet.fastnear.com}
REGISTRY=registry.$ROOT; DEED=deed.$ROOT; TLA=deedbot.$ROOT
SELLER=${SELLER:-kofi.$ROOT}; BUYER=${BUYER:-maya.$ROOT}
S_SHORT=${SELLER%%.*}; AGENT=$S_SHORT-agent.$ROOT; PARTNER=$S_SHORT-partner.$ROOT
LABEL=${LABEL:-preflight}; NAME=$LABEL.$TLA
PRICE_YOCTO=${PRICE_YOCTO:-1000000000000000000000000}   # 1 NEAR
EARN=${EARN:-0.1 NEAR}
CONFIG_HASH=${CONFIG_HASH:-8c5e8df1eb3fe3269550cd6a982b40991bbc7288303dd5a66cd90448f9e0f064}  # sha256 of runtime/preflight.config.json
REPORT=verify/report-testnet.json
LINES=$(mktemp)
FAILS=0

q() { for _ in 1 2 3 4 5 6 7 8; do out=$(curl -s "$RPC" -H 'content-type: application/json' -d "$1"); echo "$out" | grep -q '"result"\|"error":{"name"' && { echo "$out"; return; }; sleep 3; done; echo "$out"; }
view_raw() { q "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$(printf '%s' "$3" | base64)\"}}"; }
view() { view_raw "$@" | python3 -c 'import sys,json;r=json.load(sys.stdin).get("result",{});print(bytes(r["result"]).decode() if "result" in r else "")'; }
balance() { q "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["amount"])'; }
exists() { q "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" | grep -q '"amount"'; }

# record <row> <expect ok|fail> <description> <exit-code> <output> [regex the failure must match]
# An attack only PASSes if it failed for the expected reason, not for some unrelated error.
record() {
  local row=$1 expect=$2 desc=$3 code=$4 out=$5 want=${6:-}
  local tx err got verdict
  out=$(printf '%s' "$out" | sed $'s/\x1b\\[[0-9;]*m//g')
  tx=$(echo "$out" | grep -oE 'Transaction ID: [1-9A-HJ-NP-Za-km-z]+' | head -1 | awk '{print $3}')
  err=$(echo "$out" | grep -oE 'panicked: .{0,200}' | head -1 | sed -e 's/\\\\"/"/g' -e 's/\\"/"/g' | cut -c1-180)
  [ -z "$err" ] && err=$(echo "$out" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); e=d.get("result",{}).get("error") or d.get("error",{}).get("data") or ""
  print(str(e)[:200])
except Exception: pass' 2>/dev/null)
  [ -z "$err" ] && err=$(echo "$out" | grep -oE 'ExecutionError\([^)]{0,160}|"code\\?":\\?"[A-Za-z_]+' | head -1)
  if [ "$code" = 0 ] && ! echo "$out" | grep -q "panicked\|Failure\|ExecutionError"; then got=ok; else got=fail; fi
  if [ "$got" = "$expect" ]; then verdict=PASS; else verdict=FAIL; fi
  if [ "$verdict" = PASS ] && [ "$expect" = fail ] && [ -n "$want" ] && ! echo "$err $out" | grep -qiE "$want"; then
    verdict=FAIL; desc="$desc (failed, but not for the expected reason: /$want/)"
  fi
  [ "$verdict" = FAIL ] && FAILS=$((FAILS+1))
  printf '%s %-5s %-4s %s\n' "$verdict" "$row" "$got" "$desc"
  [ -n "$err" ] && [ "$got" = fail ] && printf '            on-chain: %s\n' "$err"
  python3 - "$row" "$expect" "$got" "$verdict" "$desc" "$tx" "$err" >> "$LINES" <<'PY'
import json,sys
row,expect,got,verdict,desc,tx,err=sys.argv[1:]
print(json.dumps({"row":row,"expect":expect,"got":got,"verdict":verdict,"what":desc,"tx":tx or None,"error":err or None}))
PY
}
tx() { # row expect desc signer contract method json deposit gas [want-regex]
  local out code
  out=$(near contract call-function as-transaction "$5" "$6" json-args "$7" prepaid-gas "${9:-300 Tgas}" attached-deposit "${8:-0 NEAR}" sign-as "$4" $NET $SIGN 2>&1); code=$?
  record "$1" "$2" "$3" "$code" "$out" "${10:-}"
}
finish() {
python3 - "$LINES" "$REPORT" "$NAME" "$FAILS" <<'PY'
import json,sys,datetime
lines,report,name,fails=sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4])
steps=[json.loads(l) for l in open(lines)]
json.dump({"network":"testnet","name":name,"ran_at":datetime.datetime.utcnow().isoformat()+"Z",
           "passed":fails==0,"failures":fails,"steps":steps},open(report,"w"),indent=2)
PY
echo; [ "$FAILS" = 0 ] && echo "ALL PASS — report: $REPORT" || echo "$FAILS FAILURE(S) — report: $REPORT"
exit "$FAILS"
}

add_ext() { echo "{\"request\":{\"internal\":[{\"op\":\"add_extension\",\"payload\":{\"account_id\":\"$1\"}}]}}"; }
send_req() { echo "{\"request\":{\"external\":[{\"receiver_id\":\"$1\",\"actions\":[{\"action\":\"transfer\",\"payload\":{\"amount\":\"$2\"}}]}]}}"; }
far_future() { python3 -c 'import time;print(int((time.time()+180*86400)*1e9))'; }
TENTH=100000000000000000000000; HUNDREDTH=10000000000000000000000

echo "== Setup: The seller's business ($NAME)"
OWNER=$(view "$REGISTRY" nft_token "{\"token_id\":\"$NAME\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["owner_id"])')
[ "$OWNER" = "$SELLER" ] || { echo "ERROR: $NAME is owned by $OWNER, not $SELLER. Run deploy/seed-testnet.sh (or pick another LABEL)."; exit 1; }
for a in "$AGENT" "$PARTNER"; do exists "$a" || near account create-account fund-myself "$a" "0.15 NEAR" autogenerate-new-keypair --signature-scheme ed25519 save-to-legacy-keychain sign-as "$ROOT" $NET $SIGN >/dev/null 2>&1; done
tx setup ok  "The seller adds their AI agent as an extension"        "$SELLER" "$NAME" w_execute_extension "$(add_ext "$AGENT")"   "1 yoctoNEAR" "60 Tgas"
tx setup ok  "The seller adds a second co-owner (a hidden back door)" "$SELLER" "$NAME" w_execute_extension "$(add_ext "$PARTNER")" "1 yoctoNEAR" "60 Tgas"
tx setup ok  "The seller grants their agent a capped spend (0.1 NEAR, to the seller only)" "$SELLER" "$NAME" hos_grant_spend \
  "{\"extension\":\"$AGENT\",\"receivers\":[\"$SELLER\"],\"budget_yocto\":\"$TENTH\",\"tokens\":[],\"items\":[],\"expires_at\":\"$(far_future)\"}" "1 yoctoNEAR" "60 Tgas"

echo "== Before the sale: everything works for the seller"
OUT=$(near tokens "$BUYER" send-near "$NAME" "$EARN" $NET $SIGN 2>&1); record earn ok "A customer pays $EARN into the name" $? "$OUT"
tx pre   ok  "The seller's agent spends within its grant"           "$AGENT" "$NAME" w_execute_extension "$(send_req "$SELLER" "$HUNDREDTH")" "1 yoctoNEAR" "80 Tgas"
AUTH_K="{\"path\":[],\"authorization\":$(python3 -c "import json;print(json.dumps(json.dumps({'payload':'sign in to deed','owner':'$SELLER','authorization':'x'})))")}"
AUTH_M="{\"path\":[],\"authorization\":$(python3 -c "import json;print(json.dumps(json.dumps({'payload':'sign in to deed','owner':'$BUYER','authorization':'x'})))")}"
AUTH_A="{\"path\":[],\"authorization\":$(python3 -c "import json;print(json.dumps(json.dumps({'payload':'sign in to deed','owner':'$AGENT','authorization':'x'})))")}"
r=$(view_raw "$NAME" w_resolve_auth "$AUTH_K"); echo "$r" | grep -q '"result":{"block' && ! echo "$r" | grep -q '"error"' ; record pre ok "The seller can sign in as the name (NEP-641)" $? "$r"
r=$(view_raw "$NAME" w_resolve_auth "$AUTH_A"); echo "$r" | grep -q '"result":{"block' && ! echo "$r" | grep -q '"error"' ; record A5 fail "The seller's agent tries to sign in as the name" $? "$r" "grantee|owner"

echo "== The seller lists for $(python3 -c "print($PRICE_YOCTO/1e24)") NEAR"
K0=$(balance "$SELLER")
tx list ok "The seller lists: the name moves into the escrow" "$SELLER" "$REGISTRY" nft_transfer_call \
  "{\"receiver_id\":\"$DEED\",\"token_id\":\"$NAME\",\"msg\":\"{\\\"price_yocto\\\":\\\"$PRICE_YOCTO\\\"}\"}" "1 yoctoNEAR"
sleep 3
K1=$(balance "$SELLER")
SWEPT=$(python3 -c "print(round(($K1-$K0)/1e24,4))")
PAYOUT=$(view "$NAME" hos_payout_account '{}' | tr -d '"')
[ "$(python3 -c "print(1 if $K1-$K0 > 5*10**22 else 0)")" = 1 ]; record B1 ok "The seller's earnings swept to the seller at listing (+$SWEPT NEAR net of fees)" $? ""
# B3: a customer pays while the name is listed (owned by the escrow). buy() re-points payout to the
# seller before the sale rotation, so that money must reach the seller at the sale, not the escrow.
OUT=$(near tokens "$ROOT" send-near "$NAME" "$EARN" $NET $SIGN 2>&1); record earn ok "A customer pays $EARN into the name while it is listed" $? "$OUT"
sleep 2; KB=$(balance "$SELLER")

echo "== The buyer buys"
NONCE=$(view "$DEED" get_listing "{\"token_id\":\"$NAME\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["nonce"])')
tx buy ok "The buyer pays exactly the price; the escrow hands them the name" "$BUYER" "$DEED" buy \
  "{\"token_id\":\"$NAME\",\"expected_price\":\"$PRICE_YOCTO\",\"listing_nonce\":\"$NONCE\"}" "$(python3 -c "print(f'{$PRICE_YOCTO/1e24} NEAR')")"
sleep 3
NEWOWNER=$(view "$REGISTRY" nft_token "{\"token_id\":\"$NAME\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["owner_id"])')
[ "$NEWOWNER" = "$BUYER" ]; record G5 ok "Registry says the buyer ($BUYER) owns the name" $? ""
KA=$(balance "$SELLER"); LISTED_IN=$(python3 -c "print(round(($KA-$KB)/1e24,4))")
[ "$(python3 -c "print(1 if $KA-$KB >= 9*10**22 else 0)")" = 1 ]; record B3 ok "Money paid in while listed reached the seller at the sale (+$LISTED_IN NEAR)" $? ""
[ "$NEWOWNER" = "$BUYER" ] || { echo "ERROR: the sale did not complete (owner is $NEWOWNER); stopping before the attack rows, which would be meaningless."; finish; }

echo "== The seller's side attacks (each must fail on-chain)"
tx A1 fail "The seller's agent tries to spend"                       "$AGENT"   "$NAME" w_execute_extension "$(send_req "$SELLER" "$HUNDREDTH")" "1 yoctoNEAR" "80 Tgas" "not enabled"
tx A2 fail "The seller's hidden co-owner tries to move money"        "$PARTNER" "$NAME" w_execute_extension "$(send_req "$PARTNER" "$HUNDREDTH")" "1 yoctoNEAR" "80 Tgas" "not enabled"
tx A2 fail "The seller tries to move money themselves"                  "$SELLER"  "$NAME" w_execute_extension "$(send_req "$SELLER" "$HUNDREDTH")" "1 yoctoNEAR" "80 Tgas" "not enabled"
tx A3 fail "The seller tries to re-grant their agent"                  "$SELLER"  "$NAME" hos_grant_spend \
  "{\"extension\":\"$AGENT\",\"receivers\":[\"$SELLER\"],\"budget_yocto\":\"1\",\"tokens\":[],\"items\":[],\"expires_at\":\"$(far_future)\"}" "1 yoctoNEAR" "60 Tgas" "unauthori|owner"
r=$(view_raw "$NAME" w_resolve_auth "$AUTH_K"); echo "$r" | grep -q '"result":{"block' && ! echo "$r" | grep -q '"error"' ; record A4 fail "The seller tries to sign in as the name" $? "$r" "owner"
r=$(view_raw "$NAME" w_resolve_auth "$AUTH_M"); echo "$r" | grep -q '"result":{"block' && ! echo "$r" | grep -q '"error"' ; record A4 ok "The buyer can sign in as the name" $? "$r"
tx A6 fail "The seller tries to sell the name again"                 "$SELLER" "$REGISTRY" transfer_sub_account "{\"tla_id\":\"$TLA\",\"name\":\"$LABEL\",\"new_owner\":\"$PARTNER\"}" "1 yoctoNEAR" "300 Tgas" "owner"
KEYS=$(q "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$NAME\"}}" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["result"]["keys"]))')
[ "$KEYS" = 0 ]; record A7 ok "The name has $KEYS access keys: nobody can sign as it" $? ""
tx D2 fail "The seller tries to switch the service back on"          "$SELLER" "$DEED" activate \
  "{\"token_id\":\"$NAME\",\"runtime_id\":\"$ROOT\",\"config_hash\":\"$CONFIG_HASH\",\"price_yocto\":\"1\",\"version\":99}" "0 NEAR" "100 Tgas" "only the current owner"
STATUS=$(view "$NAME" hos_agent_status "{\"extension\":\"$AGENT\"}")
echo "$STATUS" | python3 -c 'import sys,json;s=json.load(sys.stdin);sys.exit(0 if (not s["extension_enabled"] and s["grant"] is None) else 1)'; record G1 ok "hos_agent_status: agent disabled, grant gone" $? ""

echo "== The buyer switches it on"
tx D2 ok "The buyer activates the service under their name" "$BUYER" "$DEED" activate \
  "{\"token_id\":\"$NAME\",\"runtime_id\":\"$ROOT\",\"config_hash\":\"$CONFIG_HASH\",\"price_yocto\":\"50000000000000000000000\",\"version\":2}" "0 NEAR" "100 Tgas"

echo "== Safety window: The seller's money stays locked until House of Stake can no longer reverse the sale"
SALE=$(view "$DEED" get_latest_sale "{\"token_id\":\"$NAME\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
tx C5 fail "The seller tries to take the money inside the 5-minute window" "$SELLER" "$DEED" claim_proceeds "{\"sale_id\":\"$SALE\"}" "0 NEAR" "100 Tgas" "revert window still open"
echo "   waiting 5 minutes for the revert window to close…"
sleep 305
K2=$(balance "$SELLER")
tx C5 ok "After the window, anyone triggers payment" "$BUYER" "$DEED" claim_proceeds "{\"sale_id\":\"$SALE\"}" "0 NEAR" "100 Tgas"
sleep 3
K3=$(balance "$SELLER")
GOT=$(python3 -c "print(round(($K3-$K2)/1e24,4))")
[ "$(python3 -c "print(1 if $K3-$K2 == $PRICE_YOCTO - $PRICE_YOCTO//10000*250 else 0)")" = 1 ]; record G5 ok "The seller received exactly price minus 2.5% royalty ($GOT NEAR)" $? ""

finish
