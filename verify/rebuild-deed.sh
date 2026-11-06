#!/usr/bin/env bash
# Rebuild the deployed Deed contract from source and compare it with the code on chain.
#
# The contract's NEP-330 metadata (`contract_source_metadata`) names the exact git commit, the build
# image (pinned by digest) and the build command. This script reads them from the live contract,
# builds that commit in that image with `cargo near build reproducible-wasm`, and checks that the
# sha256 of the result equals the code hash NEAR reports for deed.deedhq.testnet.
#
# Needs: git, Docker (amd64 images; on Apple Silicon use Colima/Docker Desktop with Rosetta), cargo-near.
# Usage: verify/rebuild-deed.sh [deed-account]        (~5 min)
#        on macOS with Colima: TMPDIR=$HOME/.cache verify/rebuild-deed.sh   (the container only sees $HOME)
set -euo pipefail
cd "$(dirname "$0")/.."
DEED=${1:-$(python3 -c "import json;print(json.load(open('deploy/testnet.json'))['deed'])")}
RPC=${RPC:-https://rpc.testnet.fastnear.com}
q() { curl -s "$RPC" -H 'content-type: application/json' -d "$1"; }

META=$(q "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$DEED\",\"method_name\":\"contract_source_metadata\",\"args_base64\":\"e30=\"}}" \
  | python3 -c 'import sys,json;print(bytes(json.load(sys.stdin)["result"]["result"]).decode())')
REV=$(echo "$META" | python3 -c 'import sys,json,re;m=json.load(sys.stdin);print(re.search(r"rev=([0-9a-f]{40})", m["build_info"]["source_code_snapshot"]).group(1))')
ONCHAIN=$(q "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$DEED\"}}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["code_hash"])')
echo "$DEED: code hash $ONCHAIN, built from commit $REV"
echo "$META" | python3 -c 'import sys,json;b=json.load(sys.stdin)["build_info"];print("  image  ", b["build_environment"]);print("  command", " ".join(b["build_command"]))'

# The build container must see this folder: on macOS (Colima/Docker Desktop) only $HOME is shared.
BASE=${TMPDIR:-$HOME/.cache}; mkdir -p "$BASE"
WORK=$(mktemp -d "$BASE/deed-rebuild.XXXXXX"); chmod 777 "$WORK"
trap 'rm -rf "$WORK"' EXIT
git clone -q https://github.com/codemagician1949/Deed "$WORK/src"
git -C "$WORK/src" checkout -q "$REV"
(cd "$WORK/src/contract/deed" && cargo near build reproducible-wasm >/dev/null)
BUILT=$(python3 -c "import hashlib,sys;d=hashlib.sha256(open(sys.argv[1],'rb').read()).digest();A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';n=int.from_bytes(d,'big');s=''
while n: n,r=divmod(n,58); s=A[r]+s
print(s)" "$WORK/src/contract/target/near/deed/deed.wasm")
echo "rebuilt from source: $BUILT"
if [ "$BUILT" = "$ONCHAIN" ]; then echo "PASS the deployed Deed contract is exactly commit $REV"; else echo "FAIL rebuilt hash differs from the code on chain"; exit 1; fi
