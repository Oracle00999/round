#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! command -v solana >/dev/null 2>&1 && [ -x "$PWD/.tooling/solana-release/bin/solana" ]; then
  export PATH="$PWD/.tooling/solana-release/bin:$PATH"
elif ! command -v solana >/dev/null 2>&1 && [ -x /tmp/round-solana/solana-release/bin/solana ]; then
  export PATH="/tmp/round-solana/solana-release/bin:$PATH"
fi
test -f target/deploy/round.so || { echo "Run npm run contract:build first." >&2; exit 1; }
test -f .local/devnet-deployer.json || { echo "Run npm run devnet:prepare first." >&2; exit 1; }
test -f .local/round-program-keypair.json || { echo "Program deployment keypair is missing." >&2; exit 1; }
# Fixed devnet endpoint. No default CLI configuration or mainnet wallet is used.
solana program deploy target/deploy/round.so \
  --url https://api.devnet.solana.com \
  --keypair .local/devnet-deployer.json \
  --program-id .local/round-program-keypair.json
