import { WALLET_CHAIN } from '../chain/network';
import { walletTransaction } from '../chain/walletTransaction';
import { normalizeSignedTransaction } from '../chain/signedTransaction';
import { UserFacingError, simulationMessage } from './errors';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import {
  Connection,
  PublicKey,
  ComputeBudgetProgram,
  type TransactionInstruction,
} from '@solana/web3.js';
import { utils } from '@coral-xyz/anchor';
import {
  PendingConfirmationError,
  transactionState,
  type PendingTransaction,
} from '../chain/confirmation';

export async function connectWallet(): Promise<string> {
  if (Platform.OS !== 'android')
    throw new UserFacingError('Open ROUND on your Android phone to connect your wallet.');
  const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol');
  return transact(async (wallet) => {
    const result = await wallet.authorize({ chain: WALLET_CHAIN, identity: { name: 'ROUND' } });
    const account = result.accounts[0];
    if (!account) throw new UserFacingError('No wallet account was selected.');
    return new PublicKey(Buffer.from(account.address, 'base64')).toBase58();
  });
}

export async function sendInstructions(
  connection: Connection,
  owner: string,
  instructions: TransactionInstruction[],
  label: string,
  remember: (pending: PendingTransaction | null) => Promise<void>,
  onStatus: (message: string) => void,
): Promise<string> {
  if (Platform.OS !== 'android')
    throw new UserFacingError('Open the Android app to sign transactions.');
  const payer = new PublicKey(owner);
  onStatus('Checking transaction…');
  const latest = await connection.getLatestBlockhashAndContext('confirmed');
  const transaction = walletTransaction(payer, latest.value.blockhash, [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    // Declare the priority fee before signing; wallets may add it when absent.
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
    ...instructions,
  ]);
  const simulation = await connection.simulateTransaction(transaction, {
    commitment: 'confirmed',
    sigVerify: false,
  });
  if (simulation.value.err) {
    throw new UserFacingError(simulationMessage(simulation.value.logs, simulation.value.err));
  }
  onStatus('Approve in your wallet…');
  const { transact } = await import('@solana-mobile/mobile-wallet-adapter-protocol');
  const signed = await transact(async (wallet) => {
    const result = await wallet.authorize({ chain: WALLET_CHAIN, identity: { name: 'ROUND' } });
    const selected = result.accounts[0];
    if (!selected || !new PublicKey(Buffer.from(selected.address, 'base64')).equals(payer))
      throw new UserFacingError(
        'Your wallet selected a different account. Reconnect before continuing.',
      );
    const resultSigned = await wallet.signTransactions({
      payloads: [Buffer.from(transaction.serialize()).toString('base64')],
    });
    const payload = resultSigned.signed_payloads[0];
    return normalizeSignedTransaction(
      payload ? Buffer.from(payload, 'base64') : undefined,
      transaction,
    );
  });
  const signature = utils.bytes.bs58.encode(Buffer.from(signed.signatures[0]));
  const pending: PendingTransaction = {
    signature,
    ...latest.value,
    owner,
    label,
    createdAt: Date.now(),
  };
  // Persist before broadcasting, so an app restart cannot forget an in-flight payment.
  await remember(pending);
  onStatus('Confirming on Solana…');
  try {
    await connection.sendRawTransaction(signed.serialize(), {
      preflightCommitment: 'confirmed',
      minContextSlot: latest.context.slot,
      maxRetries: 3,
    });
  } catch {
    // RPC timeouts can happen after acceptance. Resolve the known signature below.
  }
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      const state = await transactionState(connection, pending);
      if (state === 'confirmed') {
        await remember(null);
        return signature;
      }
      if (state === 'failed' || state === 'expired') {
        await remember(null);
        throw new UserFacingError(
          state === 'failed'
            ? 'The transaction failed on Solana. Refresh your balances before trying again.'
            : 'The transaction expired without confirmation. You can try again.',
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith('The transaction failed') ||
          error.message.startsWith('The transaction expired'))
      )
        throw error;
      // Temporary RPC errors keep the transaction pending, not falsely failed.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new PendingConfirmationError(pending);
}
