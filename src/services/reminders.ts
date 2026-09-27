import { UserFacingError } from './errors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NETWORK } from '../chain/network';
import { NativeModules, Platform } from 'react-native';
import { Round } from '../domain/round';
import { reminderPlan } from '../domain/reminders';

const CHANNEL = 'savings-reminders-v2';

export async function initializeNotifications() {
  if (Platform.OS !== 'android') return;
  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Savings reminders',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

async function notificationPermission() {
  if (Platform.OS !== 'android')
    throw new UserFacingError(
      'Notifications are available in the ROUND Android app. Open ROUND on your phone to enable them.',
    );
  await initializeNotifications();
  const Notifications = await import('expo-notifications');
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted)
    throw new UserFacingError('Allow ROUND notifications in your phone settings, then try again.');
  return Notifications;
}

export async function sendTestNotification() {
  const Notifications = await notificationPermission();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'ROUND reminders are ready',
      body: 'We’ll remind you when a contribution opens and when your savings unlock.',
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: CHANNEL,
    },
  });
}

export async function openReminderSettings() {
  if (Platform.OS !== 'android' || !NativeModules.ReminderTiming)
    throw new UserFacingError('Update ROUND on your Android phone to enable precise reminders.');
  await NativeModules.ReminderTiming.openSettings();
}

const scheduling = new Map<string, Promise<number>>();
export function scheduleReminders(round: Round): Promise<number> {
  const existing = scheduling.get(round.id);
  if (existing) return existing;
  const work = scheduleRoundReminders(round).finally(() => scheduling.delete(round.id));
  scheduling.set(round.id, work);
  return work;
}
async function scheduleRoundReminders(round: Round): Promise<number> {
  const Notifications = await notificationPermission();
  if (!NativeModules.ReminderTiming || !(await NativeModules.ReminderTiming.canSchedule()))
    throw new UserFacingError(
      'Allow precise reminders in Reminder timing settings, then return and tap Enable reminders.',
    );
  const startKey = `round:${NETWORK}:start-alert:${round.id}`;
  const startScheduled = await AsyncStorage.getItem(startKey);
  const now = Math.floor(Date.now() / 1000);
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of existing)
    if (
      item.content.data?.roundId === round.id &&
      item.content.data?.kind !== 'receipt' &&
      (item.content.title !== 'Your ROUND has started' || round.startsAt > now)
    )
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
  const plan = reminderPlan(round, Math.floor(Date.now() / 1000));
  let count = 0;
  for (const item of plan) {
    const isStart = item.title === 'Your ROUND has started';
    if (isStart && startScheduled && round.startsAt <= now) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `round:${NETWORK}:${round.id}:${isStart ? 'start' : item.at}`,
      content: {
        title: item.title,
        body: item.body,
        sound: 'default',
        data: { roundId: round.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(item.at * 1000),
        channelId: CHANNEL,
      },
    });
    count++;
    if (isStart) await AsyncStorage.setItem(startKey, 'scheduled');
  }
  return count;
}

export type ConfirmedAction = 'create' | 'join' | 'contribute' | 'withdraw';
export async function notifyConfirmed(action: ConfirmedAction, roundId: string, signature: string) {
  if (Platform.OS !== 'android') return;
  const Notifications = await notificationPermission();
  const messages = {
    create: [
      'Your ROUND is created',
      'You have joined. We’ll remind you when the first contribution opens.',
    ],
    join: [
      'You joined the ROUND',
      'Your place is confirmed. We’ll remind you when contributions open.',
    ],
    contribute: [
      'Contribution successful',
      'Your USDC contribution is confirmed on Solana and saved in your ROUND.',
    ],
    withdraw: [
      'Withdrawal successful',
      'Your savings and any commitment lock have been returned to your wallet.',
    ],
  };
  const [title, body] = messages[action];
  await Notifications.scheduleNotificationAsync({
    identifier: `confirmed:${signature}`,
    content: { title, body, sound: 'default', data: { roundId, signature, kind: 'receipt' } },
    // Receipts are immediate; do not consume a timed-alarm slot before the start alert.
    trigger: { channelId: CHANNEL },
  });
}
