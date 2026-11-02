#!/usr/bin/env bash
# Download the exact House of Stake bytecode running on NEAR mainnet (read-only RPC).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p mainnet-wasm
R=${MAINNET_RPC:-https://rpc.mainnet.fastnear.com}
q() { curl -sS --max-time 60 "$R" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":$1}"; }
save() { python3 -c "import sys,json,base64;r=json.load(sys.stdin)['result'];open(sys.argv[1],'wb').write(base64.b64decode(r['code_base64']));print(sys.argv[1],r['hash'])" "$1"; }
q '{"request_type":"view_code","finality":"final","account_id":"registry.hos"}' | save mainnet-wasm/tla_registry.wasm
q '{"request_type":"view_code","finality":"final","account_id":"ext.hos"}'      | save mainnet-wasm/hos_extension.wasm
q '{"request_type":"view_code","finality":"final","account_id":"bot"}'          | save mainnet-wasm/registrar.wasm
q '{"request_type":"view_global_contract_code_by_account_id","finality":"final","account_id":"impl.hos"}' | save mainnet-wasm/hos_wallet.wasm
q '{"request_type":"view_code","finality":"final","account_id":"impl.hos"}' | save mainnet-wasm/wallet_impl_deployer.wasm
q '{"request_type":"view_code","finality":"final","account_id":"rec.hos"}' | save mainnet-wasm/mpc_recovery.wasm
