#!/usr/bin/env bash
# Build the contracts to WASM, then run unit + sandbox tests.
set -euo pipefail
cd "$(dirname "$0")"
[ -f ../deploy/mainnet-wasm/hos_wallet.wasm ] && [ -f ../deploy/mainnet-wasm/mpc_recovery.wasm ] || ../deploy/fetch-mainnet-wasm.sh
for c in deed mock-registry; do (cd "$c" && cargo near build non-reproducible-wasm --no-abi); done
cargo test -p deed -- --test-threads=4
