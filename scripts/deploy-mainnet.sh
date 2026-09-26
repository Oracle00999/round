#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export PATH="$PWD/.tooling/solana-release/bin:$PATH"
# Explicit mainnet endpoint and a dedicated key; never use the devnet deployer.
node --import tsx scripts/mainnet-preflight.ts
node --input-type=module -e '
import {readFileSync} from "node:fs";
const report=JSON.parse(readFileSync(".local/mainnet-preflight.json","utf8"));
if(report.deployed) throw Error("Program already exists: review any upgrade separately.");
if(report.balanceSOL < report.conservativeFundingSOL) throw Error("Mainnet deployment wallet is not funded to the preflight estimate.");
'
ROUND_PROGRAM_BYTES=$(wc -c < target/deploy/round.so | tr -d ' ')
solana program deploy target/deploy/round.so \
  --url "${ROUND_MAINNET_RPC_URL:-https://api.mainnet-beta.solana.com}" \
  --keypair .local/mainnet-deployer.json \
  --upgrade-authority .local/mainnet-deployer.json \
  --buffer .local/mainnet-buffer.json \
  --program-id .local/round-program-keypair.json \
  --max-len "$ROUND_PROGRAM_BYTES"
