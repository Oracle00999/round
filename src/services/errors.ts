/** Only messages deliberately written for users may pass through unchanged. */
export class UserFacingError extends Error {}

export function userMessage(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === -3 || /declin|reject|cancel|not authorized|authorization failed/i.test(raw))
    return 'The wallet request was not approved. You can try again when you’re ready.';
  if (/no wallet|wallet.*not found|ActivityNotFound|association.*(fail|timeout)/i.test(raw))
    return 'We couldn’t open your wallet. Install or unlock a compatible Solana wallet, then try connecting again.';
  if (/insufficient.*(lamport|fee|rent)|no record of a prior credit/i.test(raw))
    return 'Your wallet needs more SOL to pay the network fee. Add SOL, then try again.';
  if (/insufficient|0x1\b/i.test(raw))
    return 'There aren’t enough tokens for this payment. Check your available balance and add tokens before trying again.';
  if (/blockhash|expired/i.test(raw))
    return 'The wallet request took too long. Check the transaction status before trying again.';
  if (/429|too many requests|rate.limit/i.test(raw))
    return 'Solana is receiving many requests right now. Wait a moment, then refresh.';
  if (/network|fetch|timeout|timed out|ECONN|ENOTFOUND|socket|503|502/i.test(raw))
    return 'We couldn’t reach Solana. Check your internet connection, then refresh. If you already approved a payment, check its status before trying again.';
  if (/invalid public key|non-base58/i.test(raw))
    return 'That wallet address or invitation is not valid. Copy the full address or link and try again.';
  return 'We couldn’t complete that request. Please try again. If you already approved a payment, check its status first.';
}

export function simulationMessage(logs: string[] | null | undefined, failure: unknown): string {
  const detail = (logs ?? []).join(' ');
  const rules: [RegExp, string][] = [
    [
      /AlreadyPaid|period has already been paid/i,
      'You already contributed for this period. Your next payment opens in the next period.',
    ],
    [/JoiningClosed|Joining closes/i, 'This ROUND has started, so new members can no longer join.'],
    [
      /NotStarted|has not started/i,
      'Contributions open when this ROUND starts. Check its start time and come back then.',
    ],
    [
      /AlreadyWithdrawn|already been returned/i,
      'Your savings have already been returned to your wallet. Refresh to see the latest balance.',
    ],
    [
      /\bLocked\b|remain locked/i,
      'Your savings are still locked. You can withdraw when this ROUND ends.',
    ],
    [/\bEnded\b|ROUND has ended/i, 'This ROUND has ended. You can now withdraw your savings.'],
    [/ROUND is full/i, 'This ROUND has no spaces left. Ask your group to start another ROUND.'],
    [/InvalidRules|overflow/i, 'Check the contribution amount and schedule, then try again.'],
    [
      /already in use/i,
      'This action may already be complete. Refresh your ROUND before trying again.',
    ],
  ];
  for (const [pattern, message] of rules) if (pattern.test(detail)) return message;
  if (/insufficient/i.test(detail)) return userMessage(new Error(detail));
  if (
    /InsufficientFundsForRent|InsufficientFundsForFee|AccountNotFound/.test(JSON.stringify(failure))
  )
    return 'Your wallet needs more SOL for network fees and account setup. Add SOL, then try again.';
  return 'This payment cannot go through yet. Check your available tokens and the ROUND’s payment window, then refresh.';
}
