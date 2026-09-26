import { describe, expect, it } from 'vitest';
import {
  ComputeBudgetProgram,
  Keypair,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { walletTransaction } from '../src/chain/walletTransaction';
import { normalizeSignedTransaction } from '../src/chain/signedTransaction';
const payer = Keypair.generate();
const recipient = Keypair.generate().publicKey;
const hash = Keypair.generate().publicKey.toBase58();
const limit = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
const fee = (microLamports: bigint) => ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
const transfer = SystemProgram.transfer({
  fromPubkey: payer.publicKey,
  toPubkey: recipient,
  lamports: 1,
});
function tx(instructions: TransactionInstruction[], blockhash = hash, owner = payer) {
  const result = walletTransaction(owner.publicKey, blockhash, instructions);
  result.sign([owner]);
  return result;
}
const expected = tx([limit, fee(0n), transfer]);
describe('Seeker priority fee adjustment', () => {
  it('accepts a fee-only rewrite and preserves the valid signed wire payload', () => {
    const returned = tx([limit, fee(250_000n), transfer]);
    const bytes = returned.serialize();
    const result = normalizeSignedTransaction(bytes, expected);
    expect(result.serialize()).toEqual(bytes);
    expect(Transaction.from(result.serialize()).verifySignatures()).toBe(true);
    expect(expected.message.serialize()).not.toEqual(result.message.serialize());
  });
  it('rejects fees even one rounded lamport above the cap', () => {
    expect(() =>
      normalizeSignedTransaction(tx([limit, fee(250_001n), transfer]), expected),
    ).toThrow('priority fee above');
    expect(() =>
      normalizeSignedTransaction(tx([limit, fee(2n ** 64n - 1n), transfer]), expected),
    ).toThrow('priority fee above');
  });
  it('rejects instruction, amount, account, blockhash, payer and compute-limit changes alongside fee changes', () => {
    const changedAmount = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: 2,
    });
    const changedRecipient = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    });
    const changedLimit = ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 });
    for (const candidate of [
      tx([limit, fee(1n), changedAmount]),
      tx([limit, fee(1n), changedRecipient]),
      tx([changedLimit, fee(1n), transfer]),
      tx([limit, fee(1n), transfer, transfer]),
      tx([limit, fee(1n), transfer], recipient.toBase58()),
      tx([limit, fee(1n)]),
      tx([limit, fee(1n), fee(1n), transfer]),
    ])
      expect(() => normalizeSignedTransaction(candidate, expected)).toThrow(
        'different transaction',
      );
    const other = Keypair.generate();
    const otherTransfer = SystemProgram.transfer({
      fromPubkey: other.publicKey,
      toPubkey: recipient,
      lamports: 1,
    });
    expect(() =>
      normalizeSignedTransaction(tx([limit, fee(1n), otherTransfer], hash, other), expected),
    ).toThrow('different transaction');
  });
  it('rejects extra accounts attached to the fee instruction', () => {
    const altered = fee(1n);
    altered.keys.push({ pubkey: recipient, isSigner: false, isWritable: true });
    expect(() => normalizeSignedTransaction(tx([limit, altered, transfer]), expected)).toThrow(
      'different transaction',
    );
  });
});
