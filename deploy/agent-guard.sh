#!/usr/bin/env bash
# Deploy the counterparty-check pieces on testnet (team accounts):
#   reports.<root>        shared blocklist (bond 0.1 NEAR per report)
#   agent-vault.<root>    an agent's wallet; owner = $OWNER; cap 0.5 NEAR per payment, 1 NEAR per day;
#                         trusts watchdog.<root>, or any 3 distinct reporters
#   watchdog.<root>       the reporter the vault trusts (run by the team)
#   drainer-demo.<root>   a STAGED bad actor: victim-demo.<root> sends it most of its balance in a fake
#                         "claim airdrop" transfer, and the watchdog reports it with that tx as evidence
# The agent gets one key: a function-call key on agent-vault, limited to `pay`, small gas allowance,
# written to .env as AGENT_KEY (never printed).
#
# Usage: deploy/agent-guard.sh   (near-cli-rs with deedhq.testnet and $OWNER in the legacy keychain;
#        build the wasm first: contract/test.sh, or cargo near build reproducible-wasm in contract/reports
#        and contract/agent-vault)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=${ROOT:-deedhq.testnet}
OWNER=${OWNER:-amara-deed.testnet}
REPORTS=reports.$ROOT VAULT=agent-vault.$ROOT WATCH=watchdog.$ROOT DRAINER=drainer-demo.$ROOT VICTIM=victim-demo.$ROOT
NEAR="near"
net=(network-config testnet)
yocto() { python3 -c "from decimal import Decimal; print(int(Decimal('$1') * 10**24))"; }  # exact, no float

mk() { # account, funding
  if $NEAR account view-account-summary "$1" "${net[@]}" now >/dev/null 2>&1; then echo "exists: $1"; return; fi
  $NEAR account create-account fund-myself "$1" "$2" autogenerate-new-keypair save-to-legacy-keychain sign-as "$ROOT" "${net[@]}" sign-with-legacy-keychain send >/dev/null
  echo "created: $1"
}
mk "$REPORTS" '2 NEAR'; mk "$VAULT" '3 NEAR'; mk "$WATCH" '0.6 NEAR'; mk "$DRAINER" '0.1 NEAR'; mk "$VICTIM" '0.6 NEAR'; mk "new-vendor-demo.$ROOT" '0.1 NEAR'

$NEAR contract deploy "$REPORTS" use-file contract/target/near/reports/reports.wasm \
  with-init-call new json-args "{\"bond_yocto\":\"$(yocto 0.1)\"}" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  "${net[@]}" sign-with-legacy-keychain send >/dev/null && echo "deployed reports on $REPORTS"
$NEAR contract deploy "$VAULT" use-file contract/target/near/agent_vault/agent_vault.wasm \
  with-init-call new json-args "{\"owner\":\"$OWNER\",\"reports\":\"$REPORTS\",\"per_payment_cap\":\"$(yocto 0.5)\",\"daily_budget\":\"$(yocto 1)\",\"trusted_reporters\":[\"$WATCH\"],\"min_reporters\":3}" \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' "${net[@]}" sign-with-legacy-keychain send >/dev/null && echo "deployed agent-vault on $VAULT (owner $OWNER)"

# The agent's only key.
read -r PUB SECRET < <(cd runtime && bun -e '
import { ed25519 } from "@noble/curves/ed25519.js"
import { b58encode } from "./src/signer"
const seed = ed25519.utils.randomSecretKey(); const pub = ed25519.getPublicKey(seed)
const full = new Uint8Array(64); full.set(seed); full.set(pub, 32)
console.log("ed25519:" + b58encode(pub), "ed25519:" + b58encode(full))')
$NEAR account add-key "$VAULT" grant-function-call-access --allowance '0.25 NEAR' --contract-account-id "$VAULT" --function-names 'pay' \
  use-manually-provided-public-key "$PUB" "${net[@]}" sign-with-legacy-keychain send >/dev/null
touch .env; grep -v '^AGENT_KEY=' .env > .env.tmp || true; echo "AGENT_KEY=$SECRET" >> .env.tmp && mv .env.tmp .env
echo "agent key $PUB: function-call access on $VAULT, method pay only, 0.25 NEAR gas allowance (AGENT_KEY in .env)"

# Staged evidence: the "victim" sends the drainer most of its balance (a fake airdrop claim).
# Set EVID to reuse an earlier staged drain tx on a re-run.
EVID=${EVID:-$($NEAR tokens "$VICTIM" send-near "$DRAINER" '0.45 NEAR' "${net[@]}" sign-with-legacy-keychain send 2>&1 | grep -oE 'Transaction ID: [1-9A-HJ-NP-Za-km-z]+' | awk '{print $3}')}
echo "staged drain tx: $EVID"
$NEAR contract call-function as-transaction "$REPORTS" report json-args \
  "{\"account_id\":\"$DRAINER\",\"reason\":\"STAGED DEMO: took 0.45 NEAR from $VICTIM via a fake airdrop claim\",\"evidence\":\"tx:$EVID\"}" \
  prepaid-gas '30 Tgas' attached-deposit '0.1 NEAR' sign-as "$WATCH" "${net[@]}" sign-with-legacy-keychain send >/dev/null
echo "watchdog reported $DRAINER with evidence tx:$EVID"
