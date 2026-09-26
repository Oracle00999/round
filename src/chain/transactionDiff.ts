import { ComputeBudgetInstruction, ComputeBudgetProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';

/** Diagnostic metadata only: no signatures, account addresses, or instruction payloads. */
export function transactionDiff(expected: VersionedTransaction, actual: VersionedTransaction) {
  const a = TransactionMessage.decompile(expected.message);
  const b = TransactionMessage.decompile(actual.message);
  return {
    versionChanged: expected.version !== actual.version,
    payerChanged: !a.payerKey.equals(b.payerKey),
    blockhashChanged: a.recentBlockhash !== b.recentBlockhash,
    expectedInstructions: a.instructions.length,
    returnedInstructions: b.instructions.length,
    instructions: Array.from(
      { length: Math.max(a.instructions.length, b.instructions.length) },
      (_, index) => {
        const x = a.instructions[index],
          y = b.instructions[index];
        return {
          index,
          returnedComputeType: y?.programId.equals(ComputeBudgetProgram.programId)
            ? ComputeBudgetInstruction.decodeInstructionType(y) : undefined,
          expectedProgram: x?.programId.toBase58(),
          returnedProgram: y?.programId.toBase58(),
          dataChanged: !x || !y || !Buffer.from(x.data).equals(Buffer.from(y.data)),
          accountsChanged:
            !x ||
            !y ||
            x.keys.length !== y.keys.length ||
            x.keys.some(
              (key, i) =>
                !key.pubkey.equals(y.keys[i].pubkey) ||
                key.isSigner !== y.keys[i].isSigner ||
                key.isWritable !== y.keys[i].isWritable,
            ),
        };
      },
    ),
  };
}
