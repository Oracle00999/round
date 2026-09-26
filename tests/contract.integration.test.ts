import { BN } from '@coral-xyz/anchor';
import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { address, getTransactionDecoder, lamports } from '@solana/kit';
import { LiteSVM, FailedTransactionMetadata } from 'litesvm';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  AccountLayout,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  coder,
  DEFAULT_PROGRAM_ID,
  createInstruction,
  contributeInstruction,
  instruction,
  joinInstructions,
  memberAccounts,
  memberAddresses,
  roundAddress,
  withdrawInstructions,
  type ChainConfig,
} from '../src/chain/instructions';
import { type CreateInput } from '../src/domain/round';

const binary = 'target/deploy/round.so';
if (!existsSync(binary)) throw new Error('Build the contract first: npm run contract:build');

describe('ROUND program — actual SBF token transfers', () => {
  let svm: LiteSVM;
  let alice: Keypair, bob: Keypair, stranger: Keypair;
  let config: ChainConfig;
  let round: PublicKey;
  const input: CreateInput = {
    name: 'Savings test',
    amount: 20_000_000,
    bond: 100_000_000,
    periodSeconds: 60,
    periods: 3,
    startsAt: 1000,
    maxMembers: 2,
    color: '#fff',
    emoji: '↗',
  };
  const asAddress = (key: PublicKey) => address(key.toBase58());

  function send(payer: Keypair, instructions: TransactionInstruction[], signers: Keypair[] = []) {
    svm.expireBlockhash();
    const transaction = new Transaction({
      feePayer: payer.publicKey,
      recentBlockhash: svm.latestBlockhash(),
    }).add(...instructions);
    transaction.sign(payer, ...signers);
    return svm.sendTransaction(getTransactionDecoder().decode(transaction.serialize()));
  }
  function ok(payer: Keypair, instructions: TransactionInstruction[], signers: Keypair[] = []) {
    const result = send(payer, instructions, signers);
    if (result instanceof FailedTransactionMetadata)
      throw new Error(result.toString() + '\n' + result.meta().logs().join('\n'));
    return result;
  }
  function fails(payer: Keypair, instructions: TransactionInstruction[], message?: string) {
    const result = send(payer, instructions);
    expect(result).toBeInstanceOf(FailedTransactionMetadata);
    if (message && result instanceof FailedTransactionMetadata)
      expect(result.meta().logs().join('\n')).toContain(message);
  }
  function time(timestamp: number) {
    const clock = svm.getClock();
    clock.unixTimestamp = BigInt(timestamp);
    svm.setClock(clock);
  }
  function data(key: PublicKey) {
    const account = svm.getAccount(asAddress(key));
    if (!account.exists) throw new Error('Missing account');
    return Buffer.from(account.data);
  }
  function balance(key: PublicKey) {
    const account = svm.getAccount(asAddress(key));
    return account.exists ? AccountLayout.decode(Buffer.from(account.data)).amount : 0n;
  }
  function member(owner: Keypair) {
    return coder.accounts.decode('Member', data(memberAddresses(round, owner.publicKey).member));
  }
  function createMint() {
    const mint = Keypair.generate();
    ok(
      alice,
      [
        SystemProgram.createAccount({
          fromPubkey: alice.publicKey,
          newAccountPubkey: mint.publicKey,
          space: MINT_SIZE,
          lamports: Number(svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE))),
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(mint.publicKey, 6, alice.publicKey, null),
      ],
      [mint],
    );
    return mint.publicKey;
  }
  function fund(owner: Keypair, mint: PublicKey, amount = 1_000_000_000n) {
    const ata = getAssociatedTokenAddressSync(mint, owner.publicKey);
    ok(alice, [
      createAssociatedTokenAccountIdempotentInstruction(
        alice.publicKey,
        ata,
        owner.publicKey,
        mint,
      ),
      createMintToInstruction(mint, ata, alice.publicKey, amount),
    ]);
  }
  function create(rules = input, nonce = 1n) {
    round = roundAddress(alice.publicKey, nonce);
    ok(alice, [createInstruction(config, alice.publicKey, nonce, rules)]);
  }
  function join(owner: Keypair) {
    ok(owner, joinInstructions(config, round, owner.publicKey));
  }
  function pay(owner: Keypair) {
    ok(owner, [contributeInstruction(config, round, owner.publicKey)]);
  }
  function claim(owner: Keypair) {
    ok(owner, withdrawInstructions(config, round, owner.publicKey));
  }

  beforeEach(() => {
    svm = new LiteSVM();
    svm.addProgramFromFile(address(DEFAULT_PROGRAM_ID.toBase58()), binary);
    alice = Keypair.generate();
    bob = Keypair.generate();
    stranger = Keypair.generate();
    for (const key of [alice, bob, stranger])
      svm.airdrop(asAddress(key.publicKey), lamports(10_000_000_000n));
    time(900);
    config = { programId: DEFAULT_PROGRAM_ID, savingsMint: createMint(), bondMint: createMint() };
    for (const key of [alice, bob, stranger]) {
      fund(key, config.savingsMint);
      fund(key, config.bondMint);
    }
  });

  it('returns complete and incomplete savings and bonds independently, in full', () => {
    create();
    join(alice);
    join(bob);
    const a = memberAccounts(config, round, alice.publicKey),
      b = memberAccounts(config, round, bob.publicKey);
    expect(balance(a.bond_vault)).toBe(100_000_000n);
    expect(balance(a.owner_bond)).toBe(900_000_000n);
    time(1000);
    pay(alice);
    pay(bob);
    time(1060);
    pay(alice);
    time(1120);
    pay(alice);
    expect(balance(a.savings_vault)).toBe(60_000_000n);
    expect(balance(b.savings_vault)).toBe(20_000_000n);
    time(1179);
    fails(bob, withdrawInstructions(config, round, bob.publicKey), 'Locked');
    time(1180);
    claim(bob); // No creator settlement or other-member action required.
    expect(balance(b.owner_savings)).toBe(1_000_000_000n);
    expect(balance(b.owner_bond)).toBe(1_000_000_000n);
    expect(balance(b.savings_vault)).toBe(0n);
    expect(balance(a.savings_vault)).toBe(60_000_000n);
    expect(member(bob).paid_mask.toNumber()).toBe(1);
    expect(member(bob).withdrawn).toBe(true);
    claim(alice);
    expect(balance(a.owner_savings)).toBe(1_000_000_000n);
    expect(balance(a.owner_bond)).toBe(1_000_000_000n);
    expect(member(alice).paid_mask.toNumber()).toBe(7);
    fails(alice, withdrawInstructions(config, round, alice.publicKey), 'AlreadyWithdrawn');
  });

  it('enforces period boundaries and rejects duplicate contributions without moving tokens', () => {
    create();
    join(alice);
    const a = memberAccounts(config, round, alice.publicKey);
    time(999);
    fails(alice, [contributeInstruction(config, round, alice.publicKey)], 'NotStarted');
    time(1000);
    pay(alice);
    time(1059);
    fails(alice, [contributeInstruction(config, round, alice.publicKey)], 'AlreadyPaid');
    expect(balance(a.savings_vault)).toBe(20_000_000n);
    time(1060);
    pay(alice);
    time(1180);
    fails(alice, [contributeInstruction(config, round, alice.publicKey)], 'Ended');
    expect(balance(a.savings_vault)).toBe(40_000_000n);
  });

  it('rejects duplicate joins, full groups, and joins at the start boundary', () => {
    create();
    join(alice);
    fails(alice, joinInstructions(config, round, alice.publicKey));
    join(bob);
    fails(stranger, joinInstructions(config, round, stranger.publicKey), 'Full');
    create(input, 2n);
    time(1000);
    fails(bob, joinInstructions(config, round, bob.publicKey), 'JoiningClosed');
  });

  it('rejects substituted owner, destination, vault, and mint accounts', () => {
    create();
    join(alice);
    join(bob);
    time(1000);
    pay(alice);
    const a = memberAccounts(config, round, alice.publicKey),
      b = memberAccounts(config, round, bob.publicKey);
    fails(bob, [instruction('contribute', { ...a, owner: bob.publicKey }, {})]);
    fails(bob, [instruction('contribute', { ...b, savings_vault: a.savings_vault }, {})]);
    fails(bob, [
      instruction(
        'contribute',
        { ...b, savings_mint: config.bondMint, owner_savings: b.owner_bond },
        {},
      ),
    ]);
    time(1180);
    fails(bob, [instruction('withdraw', { ...a, owner: bob.publicKey }, {})]);
    fails(alice, [instruction('withdraw', { ...a, owner_savings: b.owner_savings }, {})]);
    expect(balance(a.savings_vault)).toBe(20_000_000n);
    expect(member(alice).withdrawn).toBe(false);
  });

  it('returns a bond even when no savings contribution was made', () => {
    create();
    join(bob);
    time(1180);
    claim(bob);
    const b = memberAccounts(config, round, bob.publicKey);
    expect(balance(b.owner_bond)).toBe(1_000_000_000n);
    expect(member(bob).deposited.toNumber()).toBe(0);
    expect(member(bob).paid_mask.toNumber()).toBe(0);
  });

  it('rejects empty withdrawals without marking the member withdrawn', () => {
    create({ ...input, bond: 0 });
    const newcomer = Keypair.generate();
    svm.airdrop(asAddress(newcomer.publicKey), lamports(5_000_000_000n));
    join(newcomer);
    time(1180);
    fails(newcomer, withdrawInstructions(config, round, newcomer.publicKey), 'NothingToWithdraw');
    expect(member(newcomer).withdrawn).toBe(false);
  });

  it('returns USDC without a bond or pre-existing bond token account', () => {
    create({ ...input, bond: 0 });
    const newcomer = Keypair.generate();
    svm.airdrop(asAddress(newcomer.publicKey), lamports(5_000_000_000n));
    fund(newcomer, config.savingsMint);
    join(newcomer);
    time(1000);
    pay(newcomer);
    time(1180);
    claim(newcomer);
    const accounts = memberAccounts(config, round, newcomer.publicKey);
    expect(balance(accounts.owner_savings)).toBe(1_000_000_000n);
    expect(balance(accounts.savings_vault)).toBe(0n);
    expect(member(newcomer).withdrawn).toBe(true);
  });

  it('rolls back a failed insufficient-funds contribution', () => {
    create();
    const newcomer = Keypair.generate();
    svm.airdrop(asAddress(newcomer.publicKey), lamports(5_000_000_000n));
    fund(newcomer, config.bondMint);
    fund(newcomer, config.savingsMint, 1n);
    join(newcomer);
    time(1000);
    fails(newcomer, [contributeInstruction(config, round, newcomer.publicKey)]);
    expect(member(newcomer).deposited.toNumber()).toBe(0);
    expect(member(newcomer).paid_mask.toNumber()).toBe(0);
  });

  it('supports 30-second periods with exact payment and withdrawal boundaries', () => {
    create({ ...input, periodSeconds: 30, periods: 2 });
    join(alice);
    time(1000);
    pay(alice);
    time(1029);
    fails(alice, [contributeInstruction(config, round, alice.publicKey)], 'AlreadyPaid');
    time(1030);
    pay(alice);
    time(1059);
    fails(alice, withdrawInstructions(config, round, alice.publicKey), 'Locked');
    time(1060);
    claim(alice);
    expect(member(alice).withdrawn).toBe(true);
    expect(member(alice).deposited.toNumber()).toBe(40_000_000);
  });

  it('rejects invalid schedule and amount rules onchain', () => {
    for (const override of [
      { periods: 0 },
      { periods: 53 },
      { amount: 0 },
      { startsAt: 900 },
      { periodSeconds: 29 },
      { maxMembers: 1 },
    ]) {
      fails(
        alice,
        [createInstruction(config, alice.publicKey, 3n, { ...input, ...override })],
        'InvalidRules',
      );
    }
  });
  it('rolls back create and join together when the bond cannot be paid', () => {
    const owner = Keypair.generate();
    svm.airdrop(asAddress(owner.publicKey), lamports(5_000_000_000n));
    const id = roundAddress(owner.publicKey, 9n);
    fails(owner, [
      createInstruction(config, owner.publicKey, 9n, input),
      ...joinInstructions(config, id, owner.publicKey),
    ]);
    expect(svm.getAccount(asAddress(id)).exists).toBe(false);
    expect(svm.getAccount(asAddress(memberAddresses(id, owner.publicKey).member)).exists).toBe(
      false,
    );
  });

  it('rejects amount overflow and identical savings/bond mints', () => {
    const args = {
      name: 'Overflow',
      amount: new BN('18446744073709551615'),
      bond_amount: new BN(0),
      period_seconds: new BN(60),
      periods: 2,
      starts_at: new BN(1000),
      max_members: 2,
    };
    fails(
      alice,
      [
        instruction(
          'create_round',
          {
            creator: alice.publicKey,
            round: roundAddress(alice.publicKey, 10n),
            savings_mint: config.savingsMint,
            bond_mint: config.bondMint,
            system_program: SystemProgram.programId,
          },
          { nonce: new BN(10), args },
        ),
      ],
      'Overflow',
    );
    fails(
      alice,
      [createInstruction({ ...config, bondMint: config.savingsMint }, alice.publicKey, 11n, input)],
      'InvalidMint',
    );
  });
});
