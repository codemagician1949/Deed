#!/usr/bin/env bash
# Build the contracts to WASM, then run unit + sandbox tests.
set -euo pipefail
cd "$(dirname "$0")"
[ -f ../deploy/mainnet-wasm/hos_wallet.wasm ] && [ -f ../deploy/mainnet-wasm/mpc_recovery.wasm ] || ../deploy/fetch-mainnet-wasm.sh
for c in deed mock-registry; do (cd "$c" && cargo near build non-reproducible-wasm --no-abi); done
# near-workspaces downloads a NEAR sandbox binary on first run. If that download stalls or is blocked,
# fetch near-sandbox for your platform once and point NEAR_SANDBOX_BIN_PATH at it; it is then reused.
if ! cargo test -p deed -- --test-threads=4 2>&1 | tee /tmp/deed-test.log; then
  if grep -qiE "sandbox|download|timed out" /tmp/deed-test.log && [ -z "${NEAR_SANDBOX_BIN_PATH:-}" ]; then
    echo >&2
    echo "The NEAR sandbox binary could not be downloaded. Fallback: download near-sandbox for your platform" >&2
    echo "(https://github.com/near/near-sandbox/releases, or a previous ~/.near/near-sandbox-*/near-sandbox)," >&2
    echo "then run: NEAR_SANDBOX_BIN_PATH=/path/to/near-sandbox contract/test.sh" >&2
  fi
  exit 1
fi
