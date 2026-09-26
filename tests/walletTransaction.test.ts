import { describe, expect, it } from 'vitest';
import {
  Keypair,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  SystemProgram,
} from '@solana/web3.js';
import { walletTransaction } from '../src/chain/walletTransaction';
import { normalizeSignedTransaction } from '../src/chain/signedTransaction';
import {
  createInstruction,
  joinInstructions,
  DEFAULT_PROGRAM_ID,
  roundAddress,
} from '../src/chain/instructions';

const payer = Keypair.fromSeed(new Uint8Array(32).fill(1));
const config = {
  programId: DEFAULT_PROGRAM_ID,
  savingsMint: Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey,
  bondMint: Keypair.fromSeed(new Uint8Array(32).fill(3)).publicKey,
};
const blockhash = Keypair.fromSeed(new Uint8Array(32).fill(4)).publicKey.toBase58();
const instructions = [
  ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
  createInstruction(config, payer.publicKey, 1n, {
    name: 'Seeker regression',
    amount: 1000000,
    bond: 0,
    periodSeconds: 30,
    periods: 2,
    startsAt: 2000,
    maxMembers: 8,
    emoji: '',
    color: '#fff',
  }),
  ...joinInstructions(config, roundAddress(payer.publicKey, 1n), payer.publicKey),
];
function walletRebuild(expected: VersionedTransaction) {
  const message = TransactionMessage.decompile(expected.message);
  const rebuilt = new Transaction({
    feePayer: message.payerKey,
    recentBlockhash: message.recentBlockhash,
  }).add(...message.instructions);
  rebuilt.sign(payer);
  return rebuilt;
}
describe('Seeker legacy account ordering', () => {
  it('reproduces the old mismatch for an actual create-and-join request', () => {
    const old = new VersionedTransaction(
      new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToLegacyMessage(),
    );
    expect(() => normalizeSignedTransaction(walletRebuild(old), old)).toThrow(
      'different transaction',
    );
  });
  it('keeps identical message bytes and a valid signature after wallet reconstruction', () => {
    const expected = walletTransaction(payer.publicKey, blockhash, instructions);
    const signed = walletRebuild(expected);
    expect(signed.verifySignatures()).toBe(true);
    const result = normalizeSignedTransaction(signed, expected);
    expect(Buffer.from(result.message.serialize())).toEqual(
      Buffer.from(expected.message.serialize()),
    );
    expect(Buffer.from(result.serialize())).toEqual(signed.serialize());
  });
  it('still rejects an added transfer and a replaced blockhash', () => {
    const expected = walletTransaction(payer.publicKey, blockhash, instructions);
    const extra = walletTransaction(payer.publicKey, blockhash, [
      ...instructions,
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: config.savingsMint,
        lamports: 1,
      }),
    ]);
    extra.sign([payer]);
    expect(() => normalizeSignedTransaction(extra, expected)).toThrow('different transaction');
    const stale = walletTransaction(payer.publicKey, config.bondMint.toBase58(), instructions);
    stale.sign([payer]);
    expect(() => normalizeSignedTransaction(stale, expected)).toThrow('different transaction');
  });
});

// Reproduce the device log: unchanged request plus one appended Compute Budget instruction.
it('rejects wallet-added priority fees, and accepts an explicitly priced request unchanged', () => {
  const expected = walletTransaction(payer.publicKey, blockhash, instructions);
  const fee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 });
  const walletAdded = walletTransaction(payer.publicKey, blockhash, [...instructions, fee]);
  walletAdded.sign([payer]);
  expect(() => normalizeSignedTransaction(walletAdded, expected)).toThrow('different transaction');
  const priced = walletTransaction(payer.publicKey, blockhash, [fee, ...instructions]);
  expect(() => normalizeSignedTransaction(walletRebuild(priced), priced)).not.toThrow();
});
