import { matchesWithWalletFee } from './walletFee';
import { transactionDiff } from './transactionDiff';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { UserFacingError } from '../services/errors';

/** MWA decodes by wire format: a legacy message returns Transaction even if
 * the request used a VersionedTransaction wrapper. Normalize before inspection. */
export function normalizeSignedTransaction(
  signed: Transaction | VersionedTransaction | Uint8Array | undefined,
  expected: VersionedTransaction,
): VersionedTransaction {
  if (!signed)
    throw new UserFacingError('Your wallet did not return a signed transaction. Please try again.');
  const normalized = VersionedTransaction.deserialize(
    'serialize' in signed ? signed.serialize() : signed,
  );
  if (
    !Buffer.from(normalized.message.serialize()).equals(
      Buffer.from(expected.message.serialize()),
    ) &&
    !matchesWithWalletFee(expected, normalized)
  ) {
    try {
      console.warn('ROUND_SIGNING_DIFF', JSON.stringify(transactionDiff(expected, normalized)));
    } catch {
      console.warn('ROUND_SIGNING_DIFF: could not decode returned instructions');
    }
    throw new UserFacingError(
      'The wallet returned a different transaction. Nothing was submitted. Please try again.',
    );
  }
  if (!normalized.signatures[0]?.some((byte) => byte !== 0))
    throw new UserFacingError(
      'The transaction was not signed. Open your wallet and approve the request.',
    );
  return normalized;
}
