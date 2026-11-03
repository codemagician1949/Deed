#!/usr/bin/env bash
# Build the web app with the hosted runtime URL and deploy it to Vercel as prebuilt static output.
# (The app imports ../deploy/testnet.json, so it is built here, not by Vercel from web/ alone.)
# Usage: RUNTIME_URL=https://<railway-host> web/deploy-vercel.sh [--prod]
set -euo pipefail
cd "$(dirname "$0")"
: "${RUNTIME_URL:?set RUNTIME_URL to the hosted Preflight runtime}"
VITE_RUNTIME_URL="$RUNTIME_URL" bun run build
rm -rf .vercel/output && mkdir -p .vercel/output/static
cp -R dist/. .vercel/output/static/
# Serve real files first (report JSONs, assets), then fall back to the SPA for routes like /deed/<name>.
cat > .vercel/output/config.json <<'JSON'
{ "version": 3, "routes": [ { "handle": "filesystem" }, { "src": "/(.*)", "dest": "/index.html" } ] }
JSON
vercel deploy --prebuilt --yes "$@"
