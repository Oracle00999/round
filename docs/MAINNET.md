# Mainnet deployment preparation

## Current status

**Mainnet work is paused by user request. Presentation and active builds use devnet. Do not fund, deploy or transfer upgrade authority under the earlier mainnet plan without a new user instruction.**

Mainnet-capable client and deployment tooling are prepared. The program is **not deployed on mainnet**. No real-money transaction has been sent. The installed devnet build remains usable until mainnet deployment is funded and verified.

Supported wallet for this release: Solana Mobile Seed Vault Wallet on Seeker, through Mobile Wallet Adapter. Other wallets are not part of the current device test matrix.

## Network boundaries

- Mainnet build: `EXPO_PUBLIC_SOLANA_NETWORK=mainnet-beta` plus `.env.mainnet.example` values.
- RPC genesis is checked before signing. The program must be executable.
- Official USDC and SKR addresses are pinned in `src/chain/network.ts`; both were checked on mainnet as classic SPL mints with six decimals.
- Invites carry the network and reject a different build's network.
- Pending transactions use separate storage keys per network.
- Seeker-adjusted priority fees are allowed only up to 100,000 lamports (0.0001 SOL). All other signed message bytes must match.
- Keep the devnet profile for verification; do not treat devnet balances or receipts as mainnet balances.

Official token references:
- https://www.circle.com/multi-chain-usdc/solana
- https://solanamobile.com/skr

## Source review and validation

Reviewed create/join/contribute/withdraw account constraints, arithmetic, time checks, PDA authority, owner signatures, wallet message validation, pending persistence and network isolation. This is an implementation review, not a claim of an independent audit.

57 tests pass, including 11 tests executing the actual SBF binary:
- Complete and incomplete members independently recover their recorded savings and bonds.
- Exact start/period/end boundaries, duplicate joins/payments/withdrawals, full groups.
- Owner, destination, mint and vault substitutions are rejected.
- Failed token payments and failed atomic create/join leave no partial state.
- Amount multiplication overflow and identical mints are rejected.
- Client network/mint checks, signature-message checks, fee caps, pending-status reconciliation, Android Buffer decoding and notifications.

Phone verification already completed on devnet: Seeker signing, creation and loading the saved ROUND. Multi-account phone lifecycle and delivery of the newly added notification types still require end-to-end confirmation. Mainnet signing is not yet verified.

## Deployment

User-selected final upgrade authority: `6nGiHUq68Hwm77UVwkfgsViiyo2poy3vtvQXJEhEAyji` (first Seeker account).

Run `npm run mainnet:preflight` to regenerate `.local/mainnet-preflight.json`. It verifies mainnet genesis and mint metadata, checks the program ID, hashes the binary and estimates rent. It creates dedicated local deployer/buffer keys if absent; it never imports or reads the user's Seeker seed.

Current binary: 329,400 bytes. Preflight reported 1.67506396 SOL program rent and 1.6741902 SOL temporary buffer rent. Conservative funding allowance is 3.36 SOL including both and a 0.01 SOL reserve. This is not a claim that all that SOL is spent as fees; deployment can reuse/recover temporary buffer funding. Recheck immediately before deployment.

`npm run mainnet:deploy` uses only the dedicated mainnet deployer and explicit RPC, authority, buffer and program key. It refuses an existing deployment so upgrades require separate review. The program allocation is capped at the existing binary size.

After deployment:
1. Verify executable program, deployed binary against the reviewed hash, and program-data authority.
2. Transfer upgrade authority to the user-selected Seeker account and verify the resulting on-chain authority. Future upgrades then need that wallet's signature. Do not revoke authority irreversibly without explicit instruction.
3. Retain only required rent/fees; review and return unused deployer/buffer funds to the user's specified address.
4. Install the mainnet APK and verify wallet network, token balances and a small two-account lifecycle with user-approved signatures.

## Known behavior and remaining release work

- Withdraw returns recorded savings and bonds. Vault/member/ROUND accounts remain allocated, so account rent is not currently reclaimed. Unsolicited token transfers directly into vaults are not included in recorded balances and cannot be recovered through the current withdrawal instruction. Users should deposit only through ROUND.
- USDC has an issuer-controlled freeze authority. The app cannot override issuer freezes.
- The program accepts arbitrary classic SPL mints when called directly. The ROUND app pins official mainnet assets and rejects invitations for other assets.
- Local scheduled notifications depend on Android permissions and scheduling; they are not a server push service and do not report transactions made elsewhere while the app is offline.
- Current Android artifacts use the development signing setup. A backed-up production signing identity and store metadata are needed before dApp Store publication.
- Upgrade authority starts as the dedicated local deployer until the explicit Seeker handover above. Do not describe it as immutable.
