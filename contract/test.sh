#!/usr/bin/env bash
# Build the contracts to WASM, then run unit + sandbox tests.
set -euo pipefail
cd "$(dirname "$0")"
for c in deed mock-registry; do (cd "$c" && cargo near build non-reproducible-wasm --no-abi); done
cargo test -p deed -- --test-threads=4
