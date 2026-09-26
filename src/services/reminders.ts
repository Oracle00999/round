import { UserFacingError } from './errors';
import { Platform } from 'react-native';
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

export async function scheduleReminders(round: Round): Promise<number> {
  const Notifications = await notificationPermission();
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of existing)
    if (item.content.data?.roundId === round.id && item.content.data?.kind !== 'receipt')
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
  const plan = reminderPlan(round, Math.floor(Date.now() / 1000));
  for (const item of plan) {
    await Notifications.scheduleNotificationAsync({
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
  }
  return plan.length;
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
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      channelId: CHANNEL,
    },
  });
}
