import { NativeModules, Platform } from 'react-native';
import { UserFacingError } from './errors';

export async function copyInviteLink(link: string): Promise<void> {
  try {
    if (Platform.OS === 'android' && NativeModules.RoundClipboard?.setString) {
      await NativeModules.RoundClipboard.setString(link);
    } else if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(link);
    } else {
      throw new Error('Clipboard unavailable');
    }
  } catch {
    throw new UserFacingError('Couldn’t copy the link. Please try again or use Share invite.');
  }
}
