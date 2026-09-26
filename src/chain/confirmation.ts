import { UserFacingError } from '../services/errors';
export type PendingTransaction = {
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
  owner: string;
  label: string;
  createdAt: number;
};
export class PendingConfirmationError extends UserFacingError {
  constructor(readonly pending: PendingTransaction) {
    super(
      'The transaction was signed, but its result is not confirmed yet. Check its status before trying again.',
    );
  }
}
export type TransactionState = 'confirmed' | 'failed' | 'expired' | 'pending';
type StatusRpc = {
  getSignatureStatuses: (
    signatures: string[],
    config: { searchTransactionHistory: boolean },
  ) => Promise<{ value: ({ err: unknown; confirmationStatus?: string | null } | null)[] }>;
  getBlockHeight: (commitment: 'confirmed') => Promise<number>;
};

export async function transactionState(
  rpc: StatusRpc,
  pending: PendingTransaction,
): Promise<TransactionState> {
  const { value } = await rpc.getSignatureStatuses([pending.signature], {
    searchTransactionHistory: true,
  });
  const status = value[0];
  if (status?.err) return 'failed';
  if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized')
    return 'confirmed';
  // A processed transaction can still confirm after blockhash expiry. Never retry it yet.
  if (status) return 'pending';
  if ((await rpc.getBlockHeight('confirmed')) > pending.lastValidBlockHeight) {
    // Recheck history after observing expiry so a just-confirmed tx is not treated as dropped.
    const recheck = (
      await rpc.getSignatureStatuses([pending.signature], { searchTransactionHistory: true })
    ).value[0];
    if (recheck?.err) return 'failed';
    if (recheck?.confirmationStatus === 'confirmed' || recheck?.confirmationStatus === 'finalized')
      return 'confirmed';
    return recheck ? 'pending' : 'expired';
  }
  return 'pending';
}
