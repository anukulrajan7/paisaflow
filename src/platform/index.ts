import {Platform} from 'react-native';

/**
 * Platform capability flags. Screens use these to hide entry points that
 * depend on native modules (SMS inbox, keychain, cloud sync) instead of
 * sprinkling `Platform.OS` checks — keeps the "why" in one place.
 */
export const isWeb = Platform.OS === 'web';
export const isAndroid = Platform.OS === 'android';

/** SMS inbox scanning needs the Android native reader module. */
export const supportsSmsInbox = isAndroid;

/** Cloud sync is intentionally disabled in web builds (no bundled keys). */
export const supportsCloudSync = !isWeb;

/** Secrets live in the OS keystore natively; in the browser they are
 *  AES-GCM encrypted in IndexedDB, which any script on this origin can read. */
export const hasHardwareBackedSecrets = !isWeb;

/** Scheduled reminders only fire while a web tab stays open. */
export const supportsBackgroundReminders = !isWeb;
