import { NETWORK } from '../chain/network';
import { notifyConfirmed, scheduleReminders, type ConfirmedAction } from '../services/reminders';
import { UserFacingError, userMessage } from '../services/errors';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PublicKey } from '@solana/web3.js';
import { configuredClient, type WalletBalances } from '../chain/client';
import { transactionState, type PendingTransaction } from '../chain/confirmation';
import { type CreateInput, type Round } from '../domain/round';
import { sendInstructions } from '../services/wallet';

const PENDING_KEY = `round:${NETWORK}:pending:v1`;
export function useDevnet(wallet: string | null, enabled: boolean) {
  const client = useMemo(() => configuredClient(), []);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [dataOwner, setDataOwner] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [pending, setPending] = useState<PendingTransaction | null>(null);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [stale, setStale] = useState(true);
  const [offset, setOffset] = useState(0);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const gate = useRef(false);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const pendingRef = useRef<PendingTransaction | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PENDING_KEY)
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw) as PendingTransaction;
          if (!saved.signature || !saved.owner || !Number.isSafeInteger(saved.lastValidBlockHeight))
            throw new UserFacingError('Invalid pending transaction');
          pendingRef.current = saved;
          setPending(saved);
        }
        setRestored(true);
      })
      .catch(() =>
        setError(
          'Unable to read the last transaction. Restart the app before sending another payment.',
        ),
      );
  }, []);

  const remember = useCallback(async (value: PendingTransaction | null) => {
    if (value) await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else await AsyncStorage.removeItem(PENDING_KEY);
    pendingRef.current = value;
    setPending(value);
  }, []);

  const refresh = useCallback(async () => {
    if (!client || !wallet)
      throw new UserFacingError('Connect a wallet and configure the deployment first.');
    const owner = wallet;
    const [items, funds, clock] = await Promise.all([
      client.myRounds(new PublicKey(owner)),
      client.balances(new PublicKey(owner)),
      client.chainTime(),
    ]);
    if (walletRef.current !== owner) return;
    setRounds((previous) => [
      ...items,
      ...previous.filter(
        (r) =>
          !items.some((item) => item.id === r.id) && !r.members.some((m) => m.wallet === owner),
      ),
    ]);
    setDataOwner(owner);
    setBalances(funds);
    setOffset(clock - Math.floor(Date.now() / 1000));
    setStale(false);
    setError('');
  }, [client, wallet]);

  useEffect(() => {
    setRounds([]);
    setDataOwner(null);
    setBalances(null);
    setStale(true);
    setLastSignature(null);
  }, [wallet]);

  useEffect(() => {
    if (!enabled || !client || !wallet) return;
    let cancelled = false;
    const update = async () => {
      if (gate.current || cancelled) return;
      try {
        await client.verifyDeployment();
        if (!cancelled) await refresh();
      } catch (e) {
        if (!cancelled) {
          setStale(true);
          console.warn('ROUND_REFRESH_ERROR', e instanceof Error ? e.stack : String(e));
          setError(userMessage(e));
        }
      }
    };
    void update();
    const timer = setInterval(update, 20_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void update();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [enabled, client, wallet, refresh]);

  async function run<T>(action: () => Promise<T>): Promise<T> {
    if (gate.current) throw new UserFacingError('Another wallet action is in progress.');
    gate.current = true;
    setBusy(true);
    setError('');
    try {
      return await action();
    } finally {
      gate.current = false;
      setBusy(false);
      setStatus('');
    }
  }
  const assertReady = () => {
    if (!client || !wallet || !restored)
      throw new UserFacingError('Connect your wallet and wait for the network to load.');
    if (pendingRef.current)
      throw new UserFacingError('Check the pending transaction before submitting another one.');
    if (stale)
      throw new UserFacingError(
        'Refresh confirmed balances before submitting another transaction.',
      );
    return { client, owner: new PublicKey(wallet) };
  };
  const submit = async (instructions: Parameters<typeof sendInstructions>[2], label: string) => {
    if (!client || !wallet) throw new UserFacingError('Wallet unavailable.');
    return sendInstructions(client.connection, wallet, instructions, label, remember, setStatus);
  };
  async function afterConfirmed(
    result: { signature: string; id: string },
    action: ConfirmedAction,
  ) {
    setLastSignature(result.signature);
    setStale(true);
    try {
      await refresh();
    } catch {
      setError(
        'Transaction confirmed. Balances could not be refreshed yet; refresh before continuing.',
      );
    }
    let notificationWarning = '';
    try {
      await notifyConfirmed(action, result.id, result.signature);
      if ((action === 'create' || action === 'join') && client && wallet) {
        await scheduleReminders(await client.fetchRound(result.id, wallet));
      }
    } catch {
      notificationWarning =
        'Your transaction succeeded, but phone alerts could not be enabled. Allow ROUND notifications in phone settings, then tap Enable reminders inside your ROUND.';
    }
    return { ...result, notificationWarning };
  }

  return {
    configured: !!client,
    rounds: dataOwner === wallet ? rounds : [],
    balances: dataOwner === wallet ? balances : null,
    pending,
    busy,
    status,
    error,
    offset,
    lastSignature,
    canTransact:
      !!client && !!wallet && dataOwner === wallet && restored && !pending && !busy && !stale,
    refresh: () =>
      run(async () => {
        if (!client) throw new UserFacingError('The network is not configured.');
        await client.verifyDeployment();
        await refresh();
      }),
    create: (input: CreateInput) =>
      run(async () => {
        const { client, owner } = assertReady();
        return afterConfirmed(await client.create(owner, input, submit), 'create');
      }),
    act: (id: string, action: 'join' | 'contribute' | 'withdraw') =>
      run(async () => {
        const { client, owner } = assertReady();
        return afterConfirmed(await client.act(id, owner, action, submit), action);
      }),
    lookup: (id: string) =>
      run(async () => {
        if (!client || !wallet) throw new UserFacingError('Connect your Seeker wallet first.');
        await client.verifyDeployment();
        const item = await client.fetchRound(id, wallet);
        setDataOwner(wallet);
        setRounds((previous) => [item, ...previous.filter((r) => r.id !== item.id)]);
        return item;
      }),
    reconcile: () =>
      run(async () => {
        if (!client || !pendingRef.current) return 'none' as const;
        await client.verifyDeployment();
        const saved = pendingRef.current;
        const state = await transactionState(client.connection, saved);
        if (state === 'pending') return state;
        if (state === 'confirmed') setLastSignature(saved.signature);
        await remember(null);
        setStale(true);
        if (wallet) await refresh();
        return state;
      }),
  };
}
