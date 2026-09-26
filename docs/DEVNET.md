# Devnet deployment and Seeker testing

## Current state

- Program address: `H2TwAXbeHpFadykMkrjpfEnhTTapTQ9gWiXs31tKh3Gw`
- Devnet deployer: `AG5nzvx1bJsLvcipLv3LYXN3GmCrGKVftz5vhEKpUit1`
- Test savings mint: `9hs54XjytGj6RdAN2ewJzBKVL5uYortqwVj2voXEXMhL`
- Test commitment mint: `FnHrMfwBS5uqg1uaJTL7GUZhmr3XGyRPbPteEFPx2Lb1`
- The program and both test mints were deployed on devnet on 20 September 2026.
- These are live custom test mints, not real USDC or SKR.

## Finish deployment

1. Fund the deployer above using the official [Solana faucet](https://faucet.solana.com/) with **devnet SOL only**. Around 5 devnet SOL gives room for the program buffer, account rent, and test-token setup; inspect actual balance and deployment output.
2. Run `npm run devnet:status`.
3. Run `npm run devnet:deploy` to deploy the exact tested binary using the saved program keypair.
4. Run `npm run devnet:init` to create the two test mints and write `.env`.
5. Run `npm run devnet:status` again. Program and both mints must exist.
6. Rebuild the APK if public environment values changed.

Scripts pin deployment to devnet and use `.local/devnet-deployer.json`, not a globally configured wallet. The program upgrade authority remains this test deployer. Do not discard `.local/round-program-keypair.json` or regenerate a program ID during an existing deployment.

## When the Seeker is connected

1. Install the v0.3 APK with `adb install -r artifacts/round-v0.3.1-arm64.apk`.
2. Use a devnet-capable wallet. The app requests `solana:devnet` through MWA.
3. Connect in **You**, copy its public address, and run `npm run devnet:fund -- <address>`.
4. Give the wallet a little devnet SOL for fees and account rent using the faucet.
5. The app connects directly to devnet. Check that only your confirmed balances and rounds appear.
6. Create a short ROUND, share the invitation with another test wallet, and approve joining.
7. Contribute once. Confirm wallet balances fall and locked savings rise only after confirmation.
8. Cancel one wallet prompt, disconnect the network once, and relaunch the app with a pending transaction. Verify no duplicate payment is submitted.
9. Let one wallet miss a period. At expiry, both wallets must withdraw their own full deposited amounts and all SKR commitment tokens.
10. Check reminders and invitation deep links on the device.

## Local RPC check (no public faucet needed)

Start a local validator with the compiled program:

```sh
.tooling/solana-release/bin/solana-test-validator \
  --ledger .local/rpc-smoke-ledger \
  --rpc-port 18999 --faucet-port 19001 \
  --dynamic-port-range 19002-19030 --bind-address 127.0.0.1 \
  --bpf-program H2TwAXbeHpFadykMkrjpfEnhTTapTQ9gWiXs31tKh3Gw target/deploy/round.so
npm run test:rpc
```

The smoke test creates two fresh wallets and test mints, uses the same instruction builders and RPC client as the app, and waits through a real 60-second contribution window. It does not exercise Android wallet signing.

## Test coverage

- SBF execution: all contributions versus partial/no contributions, full SKR return, duplicate payments/joins, capacity, start/end boundaries, zero-bond joins, insufficient-funds rollback, wrong owner/mint/vault/destination, repeated withdrawal.
- Client logic: pending signatures, expiry/confirmation races, failed execution, processed transactions after expiry, and RPC outages.
- Invitations: network separation and rejection of foreign/malformed links.
- Local RPC: atomic create + join, second-wallet lookup/join, confirmed balances, early withdrawal rejection, and independent refunds.

Remaining: Seeker wallet signing and transaction lifecycle checks, SGT/.skr integration, and independent security review before any mainnet use. The app has been installed and its dashboard startup verified on Seeker.

### Presentation timing and notifications

New short rounds use two 30-second periods after a one-minute joining window. Existing rounds keep their original schedule. Enable reminders in each ROUND on Android; contribution openings and unlock time are scheduled locally. The profile includes a five-second test notification. Allow notification permission when prompted. Foreground display is enabled; Android settings can delay delivery. Browser notifications and remote push messages are not implemented. Device delivery remains to be checked when Seeker reconnects.
