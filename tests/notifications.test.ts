import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  getAllScheduledNotificationsAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-notifications', () => ({
  ...mock,
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DATE: 'date' },
}));
import { notifyConfirmed, scheduleReminders } from '../src/services/reminders';
beforeEach(() => {
  vi.clearAllMocks();
  mock.requestPermissionsAsync.mockResolvedValue({ granted: true });
  mock.getAllScheduledNotificationsAsync.mockResolvedValue([]);
});
it('sends a contribution receipt tagged with the confirmed signature', async () => {
  await notifyConfirmed('contribute', 'round', 'signature');
  expect(mock.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      identifier: 'confirmed:signature',
      content: expect.objectContaining({
        title: 'Contribution successful',
        data: { roundId: 'round', signature: 'signature', kind: 'receipt' },
      }),
    }),
  );
});
it('does not schedule notifications when permission is denied', async () => {
  mock.requestPermissionsAsync.mockResolvedValue({ granted: false });
  await expect(notifyConfirmed('withdraw', 'round', 'sig')).rejects.toThrow(
    'Allow ROUND notifications',
  );
  expect(mock.scheduleNotificationAsync).not.toHaveBeenCalled();
});
it('schedules start, next payment and unlock without cancelling a pending receipt', async () => {
  mock.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: 'old', content: { data: { roundId: 'round' } } },
    { identifier: 'receipt', content: { data: { roundId: 'round', kind: 'receipt' } } },
  ]);
  const count = await scheduleReminders({
    id: 'round',
    name: 'Phone',
    startsAt: Math.floor(Date.now() / 1000) + 60,
    periodSeconds: 30,
    periods: 2,
  } as any);
  expect(count).toBe(3);
  expect(mock.cancelScheduledNotificationAsync.mock.calls).toEqual([['old']]);
  expect(mock.scheduleNotificationAsync.mock.calls.map(([x]) => x.content.title)).toEqual([
    'Your ROUND has started',
    'Your next contribution is open',
    'Your ROUND has finished',
  ]);
});
