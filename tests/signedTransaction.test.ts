import { describe, expect, it } from 'vitest';
import {
  Keypair,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { normalizeSignedTransaction } from '../src/chain/signedTransaction';
const payer = Keypair.generate();
function request(version: 'legacy' | 'v0' = 'legacy', amount = 1) {
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: amount,
      }),
    ],
  });
  return new VersionedTransaction(
    version === 'legacy' ? message.compileToLegacyMessage() : message.compileToV0Message(),
  );
}
describe('wallet signed transaction compatibility', () => {
  it('handles MWA returning a legacy Transaction after signing a VersionedTransaction wrapper', () => {
    const expected = request();
    const returned = Transaction.from(expected.serialize());
    returned.sign(payer);
    const normalized = normalizeSignedTransaction(returned, expected);
    expect(Buffer.from(normalized.signatures[0])).toEqual(returned.signature);
    expect(Buffer.from(normalized.serialize())).toEqual(returned.serialize());
  });
  it('preserves the raw signed payload returned by the wallet', () => {
    const expected = request();
    const signed = VersionedTransaction.deserialize(expected.serialize());
    signed.sign([payer]);
    const bytes = signed.serialize();
    expect(normalizeSignedTransaction(bytes, expected).serialize()).toEqual(bytes);
  });
  it('also handles signed v0 transactions', () => {
    const expected = request('v0');
    const signed = VersionedTransaction.deserialize(expected.serialize());
    signed.sign([payer]);
    expect(normalizeSignedTransaction(signed, expected).signatures[0]).toEqual(
      signed.signatures[0],
    );
  });
  it('rejects changed messages and missing signatures', () => {
    const expected = request();
    const changed = request();
    changed.sign([payer]);
    expect(() => normalizeSignedTransaction(changed, expected)).toThrow('different transaction');
    expect(() => normalizeSignedTransaction(expected, expected)).toThrow('not signed');
    expect(() => normalizeSignedTransaction(undefined, expected)).toThrow('did not return');
  });
});
