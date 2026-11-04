#!/usr/bin/env bash
# Upgrade the testnet Deed contract to v3 (job escrow, runtime URL in activations, seller paid in the sale
# transaction, version high-water mark). Deploy and `migrate` run in ONE transaction: if migrate panics,
# nothing changes. Every activation, listing and sale is kept.
#
# Usage: ROOT=deedhq.testnet deploy/upgrade-v3.sh [path/to/deed.wasm]
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=${ROOT:-deedhq.testnet}
DEED=deed.$ROOT
WASM=${1:-contract/target/near/deed/deed.wasm}
[ -f "$WASM" ] || (cd contract/deed && cargo near build non-reproducible-wasm --no-abi)
HASH=$(python3 -c "import hashlib,sys;d=hashlib.sha256(open(sys.argv[1],'rb').read()).digest();A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';n=int.from_bytes(d,'big');s=''
while n: n,r=divmod(n,58); s=A[r]+s
print(s)" "$WASM")
echo "Deploying $WASM ($HASH) to $DEED with migrate()…"
near contract deploy "$DEED" use-file "$WASM" with-init-call migrate json-args '{}' \
  prepaid-gas '300 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
python3 - "$HASH" <<'PY'
import json,sys
p="deploy/testnet.json"; d=json.load(open(p)); d["deedCodeHash"]=sys.argv[1]; d["deedVersion"]="v3"
open(p,"w").write(json.dumps(d,indent=2)+"\n")
PY
echo "Recorded deedCodeHash $HASH in deploy/testnet.json"
