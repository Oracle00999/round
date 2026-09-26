# ROUND

Save together. Stay committed. Finish the ROUND.

Android-first group savings: each member saves their own USDC, contributions stay locked until a fixed end time, and incomplete participation never forfeits deposited savings or the optional SKR lock.

## Current implementation

- Three-screen first-launch introduction with Next, Back, Skip, and saved completion. The Home screen’s “How ROUND works” button reopens it without resetting the wallet session.

- Expo / React Native application with dashboard, create form, group progress, contribution periods, history, and withdrawal screens.
- Devnet-only savings with wallet onboarding, confirmed balances, and real contribution windows. No simulated transactions or seeded savings.
- Mobile Wallet Adapter signing for creation, joining, contributions, and withdrawals on devnet.
- A Rust-generated contract interface, program/mint validation, confirmed account reads, cross-wallet invitation lookup, and automatic creation of missing token accounts.
- Pending transaction persistence and signature reconciliation: RPC timeouts never trigger automatic duplicate payments.
- QR invitations, Android sharing, network-labelled `round://join/<id>?network=devnet` links, and locally scheduled reminders.
- A compiled Anchor SBF program with immutable rules, member-specific vaults, one payment per period, and independent full refunds at expiry.
- Savings-rule, invitation, confirmation-recovery, and real SBF transaction tests.

The program passes 9 LiteSVM transaction tests using actual SPL token transfers. The app's RPC client also passes a full two-wallet lifecycle against a local validator: create/join, contribute, reject an early withdrawal, wait for expiry, and refund complete/incomplete members independently. The full automated suite currently has 42 passing tests.

**The program and both test-token mints are deployed on devnet.** The app verifies the deployment before enabling financial actions. Mainnet is disabled. Seeker wallet handoff, device notifications, SGT verification, and `.skr` resolution remain unverified or pending. Both configured devnet assets are custom test tokens with no monetary value; they are not issuer-backed USDC or mainnet SKR.

## Run the preview

```sh
npm install
npm run web
```

The browser preview shows the same wallet onboarding and UI as Android. It does not simulate wallet transactions. Mobile Wallet Adapter and reminders require an Android development build, not Expo Go.

```sh
npm run android
```

Required: Android SDK, Java, connected Android device or emulator, and an MWA-compatible wallet for the connection flow.

## Build an installable APK

The current test build is `artifacts/round-v0.4.6-devnet-arm64.apk`. APKs are excluded from source control.

Use Java 17 and set `ANDROID_HOME` to your SDK location:

```sh
npm run android:prebuild -- --no-install
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2
```

Output: `android/app/build/outputs/apk/release/app-release.apk`. The generated Expo project uses its development signing key for this build; use a dedicated release signing key before publishing. The arm64 APK targets physical devices such as Seeker, not x86 emulators.

## Checks

```sh
npm run typecheck
npm run contract:build
npm run contract:idl
npm test
npm run build
```

The contract commands require Rust and the Solana SBF toolchain. `npm test` intentionally fails if `target/deploy/round.so` is absent; it does not silently skip financial tests. `npm run contract:idl` uses Anchor's IDL builder directly. `cargo test -p round` runs additional host checks. Project-local Solana tools live in ignored `.tooling/`; no shell profile changes are required.

## Devnet setup

See [docs/DEVNET.md](docs/DEVNET.md) for exact deployment and funding steps. Deployment keys are in ignored `.local/` and are never bundled into the app. `.env` contains public configuration only. Preserve the keys between deployments.

```sh
npm run devnet:prepare
npm run devnet:status
# Fund the displayed address with devnet SOL, then:
npm run devnet:deploy
npm run devnet:init
npm run devnet:fund -- <seeker-wallet-public-address>
```

The Seeker wallet also needs a little devnet SOL for fees/account rent. In the Android app, use **Connect wallet** (or **You → Connect Android wallet**). Creating a 30-second test ROUND leaves one minute for invitations before contributions start.

## Device testing

Connect a devnet-capable Android wallet, create a 30-second ROUND, approve the agreement, and wait for its start. Contribute once, check a second payment is blocked, then withdraw after expiry. Test cancelled wallet prompts, insufficient tokens, offline refresh, and app restart with a pending payment. Clock shortcuts preview future screens with transactions disabled. Short ROUND presets use real 30-second devnet periods; no local contributions are available.

Errors pass through a user-message boundary: known validation errors provide corrective steps; unknown native/RPC exceptions never appear verbatim. Run `npm run build && npm run test:web` to check the exported app renders without seeded balances or demo controls.

## Program layout

`programs/round/src/lib.rs` defines:

- `create_round`: fixes name, mints, amount, schedule, capacity, and optional commitment amount.
- `join_round`: creates a member record and separate savings/bond vaults; transfers the bond if required.
- `contribute`: transfers one exact installment and marks the current period as paid.
- `withdraw`: returns the member's full recorded balances after the end time, independently of completion or other members.

The program uses classic SPL tokens, not Token-2022. Mints are immutable per ROUND. The client verifies the program address, expected cluster genesis hash, and both configured mint addresses before requesting signatures. Its display currently supports 6-decimal test tokens. The generated program address is `H2TwAXbeHpFadykMkrjpfEnhTTapTQ9gWiXs31tKh3Gw`.

The initial contract has no rule-editing, early-withdrawal, slashing, or admin-drain instruction. Upgrade authority remains a separate deployment consideration. Vault/account rent is separate from token contributions. Zero-bond rounds still create a bond vault; the client automatically creates the owner's bond token account if absent. Vault rent reclamation and unsolicited extra token transfers are not yet handled; those do not change the recorded contribution refund.

## Remaining milestones

See [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) for implementation order and acceptance criteria.

### Presentation timing and notifications

New short rounds use two 30-second periods after a one-minute joining window. Existing rounds keep their original schedule. Enable reminders in each ROUND on Android; contribution openings and unlock time are scheduled locally. The profile includes a five-second test notification. Allow notification permission when prompted. Foreground display is enabled; Android settings can delay delivery. Browser notifications and remote push messages are not implemented. Device delivery remains to be checked when Seeker reconnects.
