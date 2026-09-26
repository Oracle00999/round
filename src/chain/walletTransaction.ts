import {
  PublicKey,
  Transaction,
  VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';

/** Use the legacy compiler's canonical account order, matching wallets that
 * reconstruct legacy instructions before signing. Keep exact message checks. */
export function walletTransaction(
  payer: PublicKey,
  blockhash: string,
  instructions: TransactionInstruction[],
) {
  const legacy = new Transaction({ feePayer: payer, recentBlockhash: blockhash }).add(
    ...instructions,
  );
  return new VersionedTransaction(legacy.compileMessage());
}
