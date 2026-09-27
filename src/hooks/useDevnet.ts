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
  const [roundsOwner, setRoundsOwner] = useState<string | null>(null);
  const [fetchingOwner, setFetchingOwner] = useState<string | null>(null);
  const [dataOwner, setDataOwner] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [pending, setPending] = useState<PendingTransaction | null>(null);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [refreshNotice, setRefreshNotice] = useState('');
  const loadedOwner = useRef<string | null>(null);
  const refreshing = useRef<Promise<void> | null>(null);
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
    if (refreshing.current) {
      await refreshing.current;
      // A wallet switch must fetch its own data after an older request finishes.
      if (loadedOwner.current === wallet) return;
    }
    if (!client || !wallet)
      throw new UserFacingError('Connect a wallet and configure the deployment first.');
    const owner = wallet;
    setFetchingOwner(owner);
    const work = (async () => {
      await client.verifyDeployment(false);
      const results = await Promise.allSettled([
        client.myRounds(new PublicKey(owner)).then((items) => {
          if (walletRef.current !== owner) return;
          setRoundsOwner(owner);
          setRounds((previous) => [
            ...items,
            ...previous.filter(
              (r) =>
                !items.some((item) => item.id === r.id) &&
                !r.members.some((m) => m.wallet === owner),
            ),
          ]);
          setDataOwner(owner);
        }),
        client.balances(new PublicKey(owner)).then((funds) => {
          if (walletRef.current === owner) {
            setBalances(funds);
            setDataOwner(owner);
          }
        }),
        client.chainTime().then((clock) => {
          if (walletRef.current === owner) setOffset(clock - Math.floor(Date.now() / 1000));
        }),
      ]);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      if (walletRef.current !== owner) return;
      loadedOwner.current = owner;
      setStale(false);
      setError('');
      setRefreshNotice('');
    })();
    refreshing.current = work;
    try {
      await work;
    } finally {
      if (refreshing.current === work) {
        refreshing.current = null;
        setFetchingOwner(null);
      }
    }
  }, [client, wallet]);

  useEffect(() => {
    loadedOwner.current = null;
    setRefreshNotice('');
    setRounds([]);
    setRoundsOwner(null);
    setDataOwner(null);
    setBalances(null);
    setStale(true);
    setLastSignature(null);
  }, [wallet]);

  useEffect(() => {
    if (!enabled || !client || !wallet) return;
    let cancelled = false;
    let active = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    let updating = false;
    let failures = 0;
    let nextAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      if (!cancelled && active) timer = setTimeout(update, delay);
    };
    const update = async () => {
      if (cancelled || !active || updating) return;
      if (gate.current || Date.now() < nextAt) {
        schedule(Math.max(1000, nextAt - Date.now()));
        return;
      }
      updating = true;
      try {
        await refresh();
        failures = 0;
      } catch (e) {
        failures++;
        if (!cancelled && walletRef.current === wallet) {
          setStale(true);
          console.warn('ROUND_REFRESH_ERROR', userMessage(e));
          if (loadedOwner.current === wallet) {
            setRefreshNotice(
              'Showing your last loaded balances and rounds. Refresh is delayed; we’ll retry automatically.',
            );
          } else {
            setError(userMessage(e));
          }
        }
      } finally {
        updating = false;
        const delay = Math.min(120_000, 30_000 * 2 ** failures);
        nextAt = Date.now() + delay;
        schedule(delay);
      }
    };
    void update();
    const subscription = AppState.addEventListener('change', (state) => {
      active = state === 'active';
      if (active) void update();
      else clearTimeout(timer);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.remove();
    };
  }, [enabled, client, wallet, refresh]);

  async function run<T>(action: () => Promise<T>): Promise<T> {
    if (gate.current) throw new UserFacingError('Another wallet action is in progress.');
    gate.current = true;
    setBusy(true);
    setError('');
    try {
      // Finish any existing read before submitting or refreshing after a payment.
      await refreshing.current?.catch(() => {});
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
    result: { signature: string; id: string; round?: Round },
    action: ConfirmedAction,
  ) {
    setLastSignature(result.signature);
    setStale(true);
    let notificationWarning = '';
    try {
      await notifyConfirmed(action, result.id, result.signature);
      if ((action === 'create' || action === 'join') && client && wallet) {
        await scheduleReminders(result.round ?? (await client.fetchRound(result.id, wallet)));
      }
    } catch {
      notificationWarning =
        'Transaction confirmed. To enable timely alerts, allow notifications and precise reminders in Reminder timing settings, then tap Enable reminders inside your ROUND.';
    }
    try {
      await refresh();
    } catch {
      setError(
        'Transaction confirmed. Balances could not be refreshed yet; refresh before continuing.',
      );
    }
    return { ...result, notificationWarning };
  }

  return {
    configured: !!client,
    roundsLoading: !!wallet && fetchingOwner === wallet && roundsOwner !== wallet,
    roundsUnavailable: !!wallet && roundsOwner !== wallet,
    balancesLoading: !!wallet && fetchingOwner === wallet && (dataOwner !== wallet || !balances),
    rounds: dataOwner === wallet ? rounds : [],
    balances: dataOwner === wallet ? balances : null,
    pending,
    busy,
    status,
    error,
    refreshNotice,
    offset,
    lastSignature,
    readinessMessage: !wallet
      ? 'Connect your wallet in Home or You before submitting.'
      : !client
        ? 'ROUND is not configured. Please update the app.'
        : !restored
          ? 'Checking your last transaction…'
          : pending
            ? 'Check your pending transaction before sending another payment.'
            : busy
              ? status || 'Finishing your wallet request…'
              : stale || dataOwner !== wallet
                ? error ||
                  refreshNotice ||
                  'Loading your balances and rounds. You can fill in this form while we finish.'
                : '',
    canTransact:
      !!client && !!wallet && dataOwner === wallet && restored && !pending && !busy && !stale,
    refresh: () =>
      run(async () => {
        if (!client) throw new UserFacingError('The network is not configured.');
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
