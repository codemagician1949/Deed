#!/usr/bin/env bash
# Give a Preflight runtime the one on-chain power it needs: settling and refunding its own jobs.
# Creates a FUNCTION-CALL access key on the runtime account, limited to settle_job and refund_job on the
# Deed contract, with no deposit allowed and a small gas allowance. A leaked key can't move funds, list
# or buy Deeds, or call anything else. The secret goes into the git-ignored .env as RUNTIME_KEY (never
# printed); set the same value as RUNTIME_KEY on the hosted runtime.
#
# Usage: ROOT=deedhq.testnet deploy/runtime-key.sh
#        second runtime: RUNTIME_ID=deed-ops2.testnet KEY_VAR=RUNTIME2_KEY deploy/runtime-key.sh
#   (needs near-cli-rs with the account's full key in the legacy keychain)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=${ROOT:-deedhq.testnet}
RUNTIME_ID=${RUNTIME_ID:-$ROOT}
DEED=${DEED:-deed.$ROOT}
ALLOWANCE=${ALLOWANCE:-0.5 NEAR}
KEY_VAR=${KEY_VAR:-RUNTIME_KEY}   # the .env variable to write, e.g. RUNTIME2_KEY for a second runtime

# Generate the keypair locally (ed25519); the secret only ever goes to .env.
read -r PUB SECRET < <(cd runtime && bun -e '
import { ed25519 } from "@noble/curves/ed25519.js"
import { b58encode } from "./src/signer"
const seed = ed25519.utils.randomSecretKey(); const pub = ed25519.getPublicKey(seed)
const full = new Uint8Array(64); full.set(seed); full.set(pub, 32)
console.log("ed25519:" + b58encode(pub), "ed25519:" + b58encode(full))')

near account add-key "$RUNTIME_ID" grant-function-call-access \
  --allowance "$ALLOWANCE" --contract-account-id "$DEED" --function-names 'settle_job, refund_job' \
  use-manually-provided-public-key "$PUB" network-config testnet sign-with-legacy-keychain send >/dev/null

touch .env
grep -v "^$KEY_VAR=" .env > .env.tmp || true
echo "$KEY_VAR=$SECRET" >> .env.tmp && mv .env.tmp .env
echo "Added function-call key $PUB to $RUNTIME_ID (settle_job, refund_job on $DEED; allowance $ALLOWANCE)."
echo "$KEY_VAR written to .env. Set it as RUNTIME_KEY on the hosted runtime too, e.g.: railway variables --set \"RUNTIME_KEY=\$(grep ^$KEY_VAR= .env | cut -d= -f2-)\""
