#!/usr/bin/env bash
# Build the contracts to WASM, then run unit + sandbox tests.
set -euo pipefail
cd "$(dirname "$0")"
[ -f ../deploy/mainnet-wasm/hos_wallet.wasm ] && [ -f ../deploy/mainnet-wasm/mpc_recovery.wasm ] || ../deploy/fetch-mainnet-wasm.sh
for c in deed mock-registry reports agent-vault; do (cd "$c" && cargo near build non-reproducible-wasm --no-abi); done

# The sandbox tests need a NEAR sandbox node. near-workspaces' own download/unpack step fails in some
# clean environments, so fetch the same pinned binary ourselves (with retries) and point
# NEAR_SANDBOX_BIN_PATH at it. Set NEAR_SANDBOX_BIN_PATH yourself to skip this.
SANDBOX_VERSION=2.14.0   # = near-sandbox 0.4.0's DEFAULT_NEAR_SANDBOX_VERSION (near-workspaces 0.24)
if [ -z "${NEAR_SANDBOX_BIN_PATH:-}" ]; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) PLATFORM=Linux-x86_64 ;;
    Linux-aarch64|Linux-arm64) PLATFORM=Linux-aarch64 ;;
    Darwin-arm64) PLATFORM=Darwin-arm64 ;;
    *) echo "No prebuilt NEAR sandbox for $(uname -s)-$(uname -m); set NEAR_SANDBOX_BIN_PATH." >&2; exit 1 ;;
  esac
  DIR="${XDG_CACHE_HOME:-$HOME/.cache}/near-sandbox/$SANDBOX_VERSION-$PLATFORM"
  if [ ! -x "$DIR/near-sandbox" ]; then
    mkdir -p "$DIR"
    URL="https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/$PLATFORM/$SANDBOX_VERSION/near-sandbox.tar.gz"
    echo "Fetching NEAR sandbox $SANDBOX_VERSION ($PLATFORM)…" >&2
    curl -fsSL --retry 5 --retry-delay 3 "$URL" -o "$DIR/near-sandbox.tar.gz"
    tar -xzf "$DIR/near-sandbox.tar.gz" -C "$DIR"
    BIN=$(find "$DIR" -type f -name near-sandbox | head -1)
    [ -n "$BIN" ] || { echo "near-sandbox not found in $URL" >&2; exit 1; }
    [ "$BIN" = "$DIR/near-sandbox" ] || mv "$BIN" "$DIR/near-sandbox"
    chmod +x "$DIR/near-sandbox"; rm -f "$DIR/near-sandbox.tar.gz"
  fi
  export NEAR_SANDBOX_BIN_PATH="$DIR/near-sandbox"
fi

cargo test -p deed -p reports -p agent-vault -- --test-threads=4
