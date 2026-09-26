# Build sequence

## Status — v0.2

Completed: mobile demo, compiled SBF program and generated interface, 26 automated tests, and a two-wallet lifecycle through the app client against a local validator. Devnet signing, account reads, invitations, and pending transaction recovery are implemented.

The contract and test mints are deployed on devnet. ROUND is installed and its dashboard renders on Seeker. Next: fund the connected test wallet and verify wallet handoff, payments, refunds, and recovery on the device.

## 1. Rules and mobile prototype

- Fixed contribution windows; no late/catch-up payments.
- Joining closes at start; no minimum membership to begin.
- Financial terms immutable from creation.
- Full return of each member's deposited token quantities after expiry.
- Distinguish completion from withdrawal.
- Runnable, explicitly labelled local demo.

## 2. Validate the onchain program

- Install Rust, Solana CLI/SBF toolchain, and Anchor 0.32.2.
- Compile the source and generate IDL.
- Local-validator tests using two mock classic SPL mints and several wallets.
- Check duplicate joins/payments, exact start/end boundaries, incorrect mints, substituted vaults, wrong owners, partial completion, zero-contribution refunds, repeat withdrawals, and independent member claims.
- Verify every transfer amount against token-account balances, not only emitted events.
- Add token account creation to the client so a missing destination account cannot prevent a claim.
- Handle unsolicited vault token transfers and account-rent reclamation explicitly before production.

## 3. Devnet integration

- Generate deployment keypair, sync program ID, fund devnet deployer, and deploy.
- Configure canonical test savings/bond mint addresses, clearly labelled as test assets.
- Typed program client based on generated IDL.
- MWA signing plus transaction confirmation and retry/reconciliation.
- UI reads confirmed accounts; never increment real balances optimistically from wallet approval alone.
- Invitation lookup across devices and direct withdrawal path independent of application backend.

## 4. Mobile completion

- Test physical Android wallet handoff, cancelled signing, insufficient token/SOL balances, network failure, app restart, and switching accounts.
- Schedule reminders after confirmed joins and reconcile after payments.
- Add SGT verification and `.skr` display with normal wallet fallback.
- Accessibility, loading/error states, icons, and store assets.

## 5. Submission

- Verify current CLOCK IN rules, accepted network, cutoff time, and deliverables.
- Signed APK (production signing key held outside the repo).
- Public source and reproducible setup instructions.
- Short demo with complete and incomplete members both receiving full refunds.
- Pitch deck describing the savings habit, group accountability, and custody model.

## Before mainnet

- Independent security review, explicit mint allowlist, upgrade authority policy, token issuer risks, account rent policy, and public fund-recovery instructions.
- No production claims based only on local unit tests or the current demo.
