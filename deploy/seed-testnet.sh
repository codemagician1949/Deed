#!/usr/bin/env bash
# Seed the testnet deployment: a demo seller (kofi) and buyer (maya), kofi rents
# preflight.<tla> and switches the service on. Safe to re-run (skips finished steps).
# Usage: ROOT=deedhq.testnet deploy/seed-testnet.sh
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=${ROOT:-deedhq.testnet}
NET="network-config testnet"; S="sign-with-legacy-keychain send"
RPC=${RPC:-https://rpc.testnet.fastnear.com}
TLA=deedbot.$ROOT; DEED=deed.$ROOT; REGISTRY=registry.$ROOT
SELLER=kofi.$ROOT; BUYER=maya.$ROOT; LABEL=${LABEL:-preflight}; NAME=$LABEL.$TLA
CONFIG_HASH=${CONFIG_HASH:-678ff1f485b71771a96ae1eb93f268e674e3704c2340b15d64a43add83122d95}  # sha256 of runtime/preflight.config.json

q() { for _ in 1 2 3 4 5 6; do out=$(curl -s "$RPC" -H 'content-type: application/json' -d "$1"); echo "$out" | grep -q '"result"' && { echo "$out"; return; }; sleep 3; done; echo "$out"; }
view() { q "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$(printf '%s' "$3" | base64)\"}}" \
  | python3 -c 'import sys,json;r=json.load(sys.stdin).get("result",{});print(bytes(r["result"]).decode() if "result" in r else "")'; }
exists() { q "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" | grep -q '"amount"'; }

for a in "$SELLER:1.6 NEAR" "$BUYER:2.6 NEAR"; do n=${a%%:*}
  exists "$n" && echo "$n exists" || near account create-account fund-myself "$n" "${a#*:}" autogenerate-new-keypair --signature-scheme ed25519 save-to-legacy-keychain sign-as "$ROOT" $NET $S >/dev/null 2>&1
done

if [ "$(view "$REGISTRY" nft_token "{\"token_id\":\"$NAME\"}")" = "null" ]; then
  T=$(view "$REGISTRY" get_rent_price "{\"tla_id\":\"$TLA\",\"name\":\"$LABEL\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["total_yocto"])')
  DEP=$(python3 -c "print(f'{($T + 10**23)/1e24:.6f} NEAR')")
  echo "renting $NAME for $DEP"
  near contract call-function as-transaction "$REGISTRY" rent_sub_account json-args "{\"tla_id\":\"$TLA\",\"name\":\"$LABEL\"}" \
    prepaid-gas '300 Tgas' attached-deposit "$DEP" sign-as "$SELLER" $NET $S >/dev/null 2>&1
  sleep 3
fi
echo "owner: $(view "$REGISTRY" nft_token "{\"token_id\":\"$NAME\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["owner_id"])')"

if [ "$(view "$DEED" get_activation "{\"token_id\":\"$NAME\"}")" = "null" ]; then
  near contract call-function as-transaction "$DEED" activate json-args "{\"token_id\":\"$NAME\",\"runtime_id\":\"$ROOT\",\"config_hash\":\"$CONFIG_HASH\",\"price_yocto\":\"50000000000000000000000\",\"version\":1}" \
    prepaid-gas '100 Tgas' attached-deposit '0 NEAR' sign-as "$SELLER" $NET $S >/dev/null 2>&1
  sleep 2
fi
echo "activation: $(view "$DEED" get_activation "{\"token_id\":\"$NAME\"}")"
