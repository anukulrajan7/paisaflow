import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

/**
 * Typed bridge over the native SmsReader module
 * (android/app/src/main/java/com/paisaflow/sms/). All parsing is on-device;
 * this file only asks Android for raw inbox rows. On iOS, in jest, or when
 * the native module is missing, every call degrades gracefully.
 */

export interface InboxSms {
  id: string;
  address: string;
  body: string;
  /** epoch ms */
  date: number;
}

interface SmsReaderNativeModule {
  getSmsInbox(maxCount: number): Promise<InboxSms[]>;
}

const SMS_PERMISSION = 'android.permission.READ_SMS';

function nativeModule(): SmsReaderNativeModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  const module = NativeModules.SmsReader as SmsReaderNativeModule | undefined;
  return module ?? null;
}

/** True when the app can read the SMS inbox right now. */
export async function hasSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    return await PermissionsAndroid.check(SMS_PERMISSION);
  } catch {
    return false;
  }
}

/**
 * Ask for READ_SMS at runtime. Returns true when granted. Callers should show
 * an explanation screen BEFORE invoking this (Play policy + user trust).
 */
export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    const result = await PermissionsAndroid.request(SMS_PERMISSION, {
      title: 'Allow PaisaFlow to read SMS',
      message:
        'PaisaFlow reads bank and UPI transaction alerts to suggest expenses. ' +
        'Parsing happens entirely on this device — messages are never uploaded.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** True when the native reader module is linked (Android release builds). */
export function isSmsReaderAvailable(): boolean {
  return nativeModule() != null;
}

/**
 * Newest `maxCount` inbox messages. Returns [] when the module or permission
 * is unavailable instead of throwing.
 */
export async function getSmsInbox(maxCount = 50): Promise<InboxSms[]> {
  const module = nativeModule();
  if (!module) {
    return [];
  }
  if (!(await hasSmsPermission())) {
    return [];
  }
  try {
    const messages = await module.getSmsInbox(maxCount);
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
}
