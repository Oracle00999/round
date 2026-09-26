#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

if [ -x "$PWD/.tooling/cargo/bin/cargo" ]; then
  export CARGO_HOME="$PWD/.tooling/cargo" RUSTUP_HOME="$PWD/.tooling/rustup"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
# Prefer installed tools; the initial build session used isolated /tmp toolchains.
if ! command -v cargo >/dev/null 2>&1 && [ -x /tmp/round-cargo/bin/cargo ]; then
  export CARGO_HOME=/tmp/round-cargo RUSTUP_HOME=/tmp/round-rustup
  export PATH="/tmp/round-cargo/bin:$PATH"
fi
if ! command -v cargo-build-sbf >/dev/null 2>&1 && [ -x "$PWD/.tooling/solana-release/bin/cargo-build-sbf" ]; then
  export PATH="$PWD/.tooling/solana-release/bin:$PATH"
elif ! command -v cargo-build-sbf >/dev/null 2>&1 && [ -x /tmp/round-solana/solana-release/bin/cargo-build-sbf ]; then
  export PATH="/tmp/round-solana/solana-release/bin:$PATH"
fi

case "${1:-build}" in
  build) cargo-build-sbf --manifest-path programs/round/Cargo.toml ;;
  idl) cargo run --package round-idl ;;
  test) cargo test --package round ;;
  *) echo "Usage: sh scripts/contract.sh build|idl|test" >&2; exit 1 ;;
esac
