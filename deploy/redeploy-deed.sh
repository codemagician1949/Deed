#!/usr/bin/env bash
# Redeploy the Deed contract code WITHOUT a migration, for changes that add methods but keep the stored
# state layout (e.g. v3 -> v3.1 added the get_version_floor view). Records the new code hash in
# deploy/testnet.json so verify/check-testnet.py checks the deployed bytecode against it.
#
# Usage: ROOT=deedhq.testnet VERSION=v3.1 deploy/redeploy-deed.sh [path/to/deed.wasm]
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=${ROOT:-deedhq.testnet}
DEED=deed.$ROOT
VERSION=${VERSION:-v3.1}
WASM=${1:-contract/target/near/deed/deed.wasm}
[ -f "$WASM" ] || (cd contract/deed && cargo near build non-reproducible-wasm --no-abi)
HASH=$(python3 -c "import hashlib,sys;d=hashlib.sha256(open(sys.argv[1],'rb').read()).digest();A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';n=int.from_bytes(d,'big');s=''
while n: n,r=divmod(n,58); s=A[r]+s
print(s)" "$WASM")
echo "Deploying $WASM ($HASH) to $DEED (no migration)…"
near contract deploy "$DEED" use-file "$WASM" without-init-call network-config testnet sign-with-legacy-keychain send
python3 - "$HASH" "$VERSION" <<'PY'
import json,sys
p="deploy/testnet.json"; d=json.load(open(p)); d["deedCodeHash"]=sys.argv[1]; d["deedVersion"]=sys.argv[2]
open(p,"w").write(json.dumps(d,indent=2)+"\n")
PY
echo "Recorded deedCodeHash $HASH ($VERSION) in deploy/testnet.json"
