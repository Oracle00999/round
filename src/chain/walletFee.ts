import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import { UserFacingError } from '../services/errors';

export const MAX_WALLET_PRIORITY_FEE_LAMPORTS = 100_000n;

/** Seeker rewrites SetComputeUnitPrice. Permit only those eight price bytes
 * in a legacy request that already declares one price and one CU limit.
 * Compare everything else byte-for-byte; never mutate the signed response. */
export function matchesWithWalletFee(
  expected: VersionedTransaction,
  returned: VersionedTransaction,
): boolean {
  if (expected.version !== 'legacy' || returned.version !== 'legacy') return false;
  const a = TransactionMessage.decompile(expected.message).instructions;
  const b = TransactionMessage.decompile(returned.message).instructions;
  if (a.length !== b.length) return false;
  const prices = a.flatMap((ix, i) =>
    ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 3 ? [i] : [],
  );
  const limits = a.filter(
    (ix) => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 2,
  );
  if (prices.length !== 1 || limits.length !== 1) return false;
  const index = prices[0],
    original = a[index],
    actual = b[index];
  if (
    !actual.programId.equals(ComputeBudgetProgram.programId) ||
    actual.data.length !== 9 ||
    actual.data[0] !== 3 ||
    actual.keys.length ||
    original.keys.length
  )
    return false;
  const price = ComputeBudgetInstruction.decodeSetComputeUnitPrice(actual).microLamports;
  const units = ComputeBudgetInstruction.decodeSetComputeUnitLimit(limits[0]).units;
  // Modify only a comparison copy. Submission uses the untouched signed bytes.
  const comparison = VersionedTransaction.deserialize(returned.serialize());
  if (comparison.message.version !== 'legacy' || expected.message.version !== 'legacy')
    return false;
  comparison.message.instructions[index].data = expected.message.instructions[index].data;
  if (
    !Buffer.from(comparison.message.serialize()).equals(Buffer.from(expected.message.serialize()))
  )
    return false;
  const fee = (BigInt(price) * BigInt(units) + 999_999n) / 1_000_000n;
  if (fee > MAX_WALLET_PRIORITY_FEE_LAMPORTS) {
    throw new UserFacingError(
      'Your wallet requested a priority fee above ROUND’s 0.0001 SOL limit. Nothing was submitted. Lower the wallet fee and try again.',
    );
  }
  return true;
}
