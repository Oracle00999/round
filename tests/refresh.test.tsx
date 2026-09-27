// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  client: { verifyDeployment: vi.fn(), myRounds: vi.fn(), balances: vi.fn(), chainTime: vi.fn() },
  change: null as null | ((state: string) => void),
}));
vi.mock('../src/chain/client', () => ({ configuredClient: () => mock.client }));
vi.mock('../src/services/wallet', () => ({ sendInstructions: vi.fn() }));
vi.mock('../src/services/reminders', () => ({
  notifyConfirmed: vi.fn(),
  scheduleReminders: vi.fn(),
}));
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, f: (s: string) => void) => {
      mock.change = f;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn().mockResolvedValue(null) },
}));
import { useDevnet } from '../src/hooks/useDevnet';
let state: ReturnType<typeof useDevnet>;
let root: ReturnType<typeof createRoot>;
function App() {
  state = useDevnet('6nGiHUq68Hwm77UVwkfgsViiyo2poy3vtvQXJEhEAyji', true);
  return null;
}
async function mount() {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mock.client.verifyDeployment.mockResolvedValue(undefined);
  mock.client.balances.mockResolvedValue({ sol: 1, savings: 3, bond: 0 });
  mock.client.chainTime.mockResolvedValue(Math.floor(Date.now() / 1000));
  root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(<App />);
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('shows balances while history loads and does not overlap refreshes on resume', async () => {
  vi.useFakeTimers();
  let finish!: (value: []) => void;
  mock.client.myRounds.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await mount();
  expect(state.roundsLoading).toBe(true);
  expect(state.balancesLoading).toBe(false);
  expect(state.balances?.savings).toBe(3);
  expect(state.canTransact).toBe(false);
  expect(state.readinessMessage).not.toBe('');
  await act(async () => {
    mock.change?.('active');
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(mock.client.myRounds).toHaveBeenCalledTimes(1);
  await act(async () => finish([]));
  expect(state.canTransact).toBe(true);
  expect(state.roundsLoading).toBe(false);
  expect(state.roundsUnavailable).toBe(false);
  await act(async () => {
    mock.change?.('background');
    await vi.advanceTimersByTimeAsync(120_000);
  });
  expect(mock.client.myRounds).toHaveBeenCalledTimes(1);
});
it('retains loaded data on a failed refresh and blocks spending until refreshed', async () => {
  vi.useFakeTimers();
  mock.client.myRounds.mockResolvedValue([]);
  await mount();
  mock.client.myRounds.mockRejectedValue(new Error('429 Too many requests'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(state.balances?.savings).toBe(3);
  expect(state.roundsLoading).toBe(false);
  expect(state.roundsUnavailable).toBe(false);
  expect(state.refreshNotice).toContain('retry automatically');
  expect(state.error).toBe('');
  expect(state.canTransact).toBe(false);
  expect(state.readinessMessage).not.toBe('');
  await act(async () => {
    mock.change?.('active');
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(mock.client.myRounds).toHaveBeenCalledTimes(2);
});

it('stops initial skeletons on failure and shows them again during a retry', async () => {
  vi.useFakeTimers();
  mock.client.myRounds.mockRejectedValueOnce(new Error('Network request failed'));
  await mount();
  expect(state.roundsLoading).toBe(false);
  expect(state.roundsUnavailable).toBe(true);
  expect(state.error).not.toBe('');
  let finish!: (value: []) => void;
  mock.client.myRounds.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(state.roundsLoading).toBe(true);
  await act(async () => finish([]));
  expect(state.roundsLoading).toBe(false);
  expect(state.roundsUnavailable).toBe(false);
});
it('keeps existing content visible during background requests', async () => {
  vi.useFakeTimers();
  mock.client.myRounds.mockResolvedValue([]);
  await mount();
  let finish!: (value: []) => void;
  mock.client.myRounds.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(state.roundsLoading).toBe(false);
  expect(state.roundsUnavailable).toBe(false);
  await act(async () => finish([]));
});
