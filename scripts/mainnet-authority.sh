#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export PATH="$PWD/.tooling/solana-release/bin:$PATH"
node --import tsx scripts/mainnet-preflight.ts
node --input-type=module -e 'import {readFileSync} from "node:fs"; const report=JSON.parse(readFileSync(".local/mainnet-preflight.json","utf8"));if(!report.deployed)throw Error("Deploy and verify ROUND before authority handover.");'
# User selected this Seeker account on 2026-09-23. Its private key stays on the phone.
solana program set-upgrade-authority H2TwAXbeHpFadykMkrjpfEnhTTapTQ9gWiXs31tKh3Gw \
  --url "${ROUND_MAINNET_RPC_URL:-https://api.mainnet-beta.solana.com}" \
  --keypair .local/mainnet-deployer.json \
  --upgrade-authority .local/mainnet-deployer.json \
  --new-upgrade-authority 6nGiHUq68Hwm77UVwkfgsViiyo2poy3vtvQXJEhEAyji \
  --skip-new-upgrade-authority-signer-check
