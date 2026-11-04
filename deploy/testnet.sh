#!/usr/bin/env bash
# Deploy Deed on NEAR testnet.
#
# Top Level Accounts (House of Stake) has no testnet deployment, so this script deploys a
# replica from the EXACT mainnet bytecode (deploy/mainnet-wasm/, fetched by fetch-mainnet-wasm.sh)
# under team-owned testnet accounts, then deploys our `deed` contract on top.
# It is NOT House of Stake's deployment; the README says so.
#
# Needs: near-cli-rs, a funded ROOT account in ~/.near-credentials (legacy keychain), jq.
# Usage:  ROOT=deedhq.testnet deploy/testnet.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ROOT=${ROOT:-deedhq.testnet}
NET="network-config testnet"
SIGN="sign-with-legacy-keychain send"
WASM=deploy/mainnet-wasm
DEED_WASM=contract/target/near/deed/deed.wasm
RPC=${RPC:-https://rpc.testnet.fastnear.com}

COUNCIL=$ROOT                       # admin / treasury / council of the replica
REGISTRY=registry.$ROOT
EXT=ext.$ROOT                       # lease authority (mainnet: ext.hos)
RECOVERY=rec.$ROOT                  # recovery contract (mainnet: rec.hos); rotations notify it
IMPL=impl.$ROOT                     # global wallet code (mainnet: impl.hos)
TLA=deedbot.$ROOT                   # our "TLA": names are <label>.deedbot.<root>
DEED=deed.$ROOT                     # our contract
CREATOR=$ROOT                       # royalty receiver (template creator)
ROYALTY_BPS=${ROYALTY_BPS:-250}
# 1 NEAR = $100 for the replica's price oracle, so test rents cost cents.
NEAR_USD_MICRO=${NEAR_USD_MICRO:-100000000}

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
die() { printf '\033[31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }

rpc() {
  curl -sS --max-time 30 "$RPC" -H 'content-type: application/json' -d "$1"
}
exists() {
  rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" \
    | jq -e '.result' >/dev/null
}
code_hash() {
  rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" \
    | jq -r '.result.code_hash // empty'
}
balance_near() {
  rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" \
    | jq -r '(.result.amount // "0") | tonumber / 1e24 | floor'
}
local_hash() { python3 -c "import hashlib,sys;import base64
d=hashlib.sha256(open(sys.argv[1],'rb').read()).digest()
A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';n=int.from_bytes(d,'big');s=''
while n: n,r=divmod(n,58); s=A[r]+s
print(s)" "$1"; }

subaccount() { # name, initial balance
  if exists "$1"; then echo "  $1 exists"; return; fi
  near account create-account fund-myself "$1" "$2" autogenerate-new-keypair save-to-legacy-keychain \
    sign-as "$ROOT" $NET $SIGN >/dev/null
  echo "  created $1 with $2"
}
call() { # signer, contract, method, json, deposit
  near contract call-function as-transaction "$2" "$3" json-args "$4" \
    prepaid-gas '300 Tgas' attached-deposit "${5:-0 NEAR}" sign-as "$1" $NET $SIGN >/dev/null
}

# ---------------------------------------------------------------------------
command -v near >/dev/null || die "near-cli-rs not found (cargo install near-cli-rs)"
command -v jq >/dev/null || die "jq not found (brew install jq)"
[ -f "$WASM/tla_registry.wasm" ] || die "missing $WASM; run deploy/fetch-mainnet-wasm.sh first"
[ -f "$DEED_WASM" ] || die "missing $DEED_WASM; run contract/test.sh first"
exists "$ROOT" || die "$ROOT does not exist on testnet"

NEED=65
HAVE=$(balance_near "$ROOT")
if ! exists "$IMPL" && [ "$HAVE" -lt "$NEED" ]; then
  die "$ROOT has $HAVE NEAR; a fresh deploy needs about $NEED NEAR (the global wallet code alone is ~43.3 NEAR: 433 KB x 0.0001 NEAR/byte).
       Send testnet NEAR to $ROOT and re-run. The script is safe to re-run; it skips finished steps."
fi

say "Checking that local bytecode matches mainnet"
for pair in "tla_registry:DVMYAu7exGKWQdngmtvUDC4rvBfZzSK1kt1AkzaewsPY" "hos_extension:3rkMpK42jVjrqi9kukVCbUyeX1bqqAa4AJ6gvSdtL6Zz" \
            "registrar:DavYBFdXPsa9qa6QEyiaUxodV6pax2y8Sp3XoriCNj3t" "hos_wallet:6d1FsQEpwVpgxALg4kCffXX45qujTL41bQSpWEHFoQ4o" \
            "mpc_recovery:HgacdGnQfkZ68W43VuqL9uZbY5JUXL2Gt9hrTWYU3eXw"; do
  f=${pair%%:*}; want=${pair#*:}; got=$(local_hash "$WASM/$f.wasm")
  [ "$got" = "$want" ] || die "$f.wasm hash $got != mainnet $want"
  echo "  $f.wasm  $got  (= mainnet)"
done

say "Accounts"
subaccount "$REGISTRY" "7.6 NEAR"
subaccount "$EXT" "3.4 NEAR"
subaccount "$RECOVERY" "3.2 NEAR"
subaccount "$IMPL" "44 NEAR"
subaccount "$TLA" "2.3 NEAR"
subaccount "$DEED" "2.9 NEAR"

say "Global wallet code at $IMPL (mainnet: impl.hos)"
if [ "$(code_hash "$IMPL")" = "" ] || [ "$(code_hash "$IMPL")" = "11111111111111111111111111111111" ]; then
  near contract deploy-as-global use-file "$WASM/hos_wallet.wasm" as-global-account-id "$IMPL" $NET $SIGN >/dev/null || true
fi
echo "  published (global, by account id)"

say "Extension (lease authority) at $EXT"
if [ "$(code_hash "$EXT")" != "3rkMpK42jVjrqi9kukVCbUyeX1bqqAa4AJ6gvSdtL6Zz" ]; then
  near contract deploy "$EXT" use-file "$WASM/hos_extension.wasm" with-init-call new \
    json-args "{\"admin\":\"$COUNCIL\",\"registry\":\"$REGISTRY\",\"recovery\":\"$RECOVERY\",\"treasury\":\"$COUNCIL\",\"council\":\"$COUNCIL\"}" \
    prepaid-gas '300 Tgas' attached-deposit '0 NEAR' $NET $SIGN >/dev/null
fi
echo "  $(code_hash "$EXT")"

say "Recovery at $RECOVERY (mainnet: rec.hos)"
if [ "$(code_hash "$RECOVERY")" != "HgacdGnQfkZ68W43VuqL9uZbY5JUXL2Gt9hrTWYU3eXw" ]; then
  # Two random watcher public keys whose private keys nobody holds: recovery can never run on this replica.
  # Recovery is not part of Deed; the contract only has to exist because rotations notify it.
  rk() { python3 -c "import os;A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';n=int.from_bytes(os.urandom(32),'big');s=''
while n: n,r=divmod(n,58); s=A[r]+s
print('ed25519:'+s)"; }
  W1=$(rk); W2=$(rk)
  near contract deploy "$RECOVERY" use-file "$WASM/mpc_recovery.wasm" with-init-call new \
    json-args "{\"owner\":\"$COUNCIL\",\"signer\":\"$COUNCIL\",\"transfer_authority\":\"$EXT\",\"watchers\":[\"$W1\",\"$W2\"],\"threshold\":2}" \
    prepaid-gas '300 Tgas' attached-deposit '0 NEAR' $NET $SIGN >/dev/null
fi
echo "  $(code_hash "$RECOVERY")"

say "Registrar for the TLA $TLA"
if [ "$(code_hash "$TLA")" != "DavYBFdXPsa9qa6QEyiaUxodV6pax2y8Sp3XoriCNj3t" ]; then
  near contract deploy "$TLA" use-file "$WASM/registrar.wasm" with-init-call new \
    json-args "{\"config\":{\"registry\":\"$REGISTRY\",\"council\":\"$COUNCIL\",\"wallet_impl\":\"$IMPL\",\"hos_extension\":\"$EXT\",\"recovery\":\"$RECOVERY\",\"chain_id\":\"testnet\",\"min_balance\":\"100000000000000000000000\",\"wallet_timeout_secs\":3600}}" \
    prepaid-gas '300 Tgas' attached-deposit '0 NEAR' $NET $SIGN >/dev/null
fi
echo "  $(code_hash "$TLA")"

say "Registry at $REGISTRY (mainnet: registry.hos)"
if [ "$(code_hash "$REGISTRY")" != "DVMYAu7exGKWQdngmtvUDC4rvBfZzSK1kt1AkzaewsPY" ]; then
  near contract deploy "$REGISTRY" use-file "$WASM/tla_registry.wasm" with-init-call new \
    json-args "{\"admin\":\"$COUNCIL\",\"hos_extension\":\"$EXT\",\"grace_period_ns\":\"1209600000000000\",\"treasury\":\"$COUNCIL\",\"council\":\"$COUNCIL\",\"lease_term_ns\":null}" \
    prepaid-gas '300 Tgas' attached-deposit '0 NEAR' $NET $SIGN >/dev/null
  call "$COUNCIL" "$REGISTRY" admin_set_initial_rate "{\"rate\":\"$NEAR_USD_MICRO\"}" '1 yoctoNEAR'
  call "$COUNCIL" "$REGISTRY" register_tla "{\"tla_id\":\"$TLA\",\"tla_type\":\"Open\",\"premium_category\":\"Standard\",\"licensee\":null}" '1 yoctoNEAR'
  call "$COUNCIL" "$REGISTRY" activate_open_tla "{\"tla_id\":\"$TLA\"}" '1 yoctoNEAR'
  # The registrar refuses wallets funded below its min_balance (0.1 NEAR); raise the creation deposit to 0.2 NEAR.
  # Testnet has no live NEAR/USD feed for the replica (on mainnet an oracle refreshes it within 6 h), so the
  # rate may be up to 30 days old here; otherwise rents fail with rate_stale. The council is the price oracle.
  FEE=$(near contract call-function as-read-only "$REGISTRY" get_fee_config json-args '{}' $NET now 2>/dev/null | sed -n '/^{/,/^}/p' \
        | jq -c '.account_creation_deposit_yocto = "200000000000000000000000" | .max_rate_age_ns = "2592000000000000"')
  call "$COUNCIL" "$REGISTRY" update_fee_config "{\"config\":$FEE}" '1 yoctoNEAR'
fi
echo "  $(code_hash "$REGISTRY")"

say "Deed contract at $DEED"
DEED_HASH=$(local_hash "$DEED_WASM")
if [ "$(code_hash "$DEED")" != "$DEED_HASH" ]; then
  if [ "$(code_hash "$DEED")" = "11111111111111111111111111111111" ]; then
    near contract deploy "$DEED" use-file "$DEED_WASM" with-init-call new \
      json-args "{\"registry\":\"$REGISTRY\",\"royalty_account\":\"$CREATOR\",\"royalty_bps\":$ROYALTY_BPS,\"revert_window_ns\":null}" \
      prepaid-gas '100 Tgas' attached-deposit '0 NEAR' $NET $SIGN >/dev/null
  else
    near contract deploy "$DEED" use-file "$DEED_WASM" without-init-call $NET $SIGN >/dev/null
  fi
fi
echo "  $(code_hash "$DEED")"

say "Writing deploy/testnet.json"
cat > deploy/testnet.json <<EOF
{
  "network": "testnet",
  "rpc": "$RPC",
  "root": "$ROOT",
  "registry": "$REGISTRY",
  "extension": "$EXT",
  "recovery": "$RECOVERY",
  "walletImpl": "$IMPL",
  "tla": "$TLA",
  "deed": "$DEED",
  "royaltyAccount": "$CREATOR",
  "royaltyBps": $ROYALTY_BPS,
  "mainnetCodeHashes": {
    "registry.hos": "DVMYAu7exGKWQdngmtvUDC4rvBfZzSK1kt1AkzaewsPY",
    "ext.hos": "3rkMpK42jVjrqi9kukVCbUyeX1bqqAa4AJ6gvSdtL6Zz",
    "registrar (gpub.hos)": "DavYBFdXPsa9qa6QEyiaUxodV6pax2y8Sp3XoriCNj3t",
    "impl.hos (hos-wallet)": "6d1FsQEpwVpgxALg4kCffXX45qujTL41bQSpWEHFoQ4o",
    "rec.hos (mpc-recovery)": "HgacdGnQfkZ68W43VuqL9uZbY5JUXL2Gt9hrTWYU3eXw"
  },
  "deedCodeHash": "$DEED_HASH"
}
EOF
cat deploy/testnet.json
say "Done. Next: deploy/seed-testnet.sh rents demo names and runs a first sale."
