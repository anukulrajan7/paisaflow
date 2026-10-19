/**
 * Web implementation of app-lock PIN storage.
 *
 * The PIN is never stored, even encrypted: we keep a PBKDF2-SHA256 hash with
 * a random salt (inside the encrypted secret store) and verify by
 * re-deriving. The lock is a privacy curtain against shoulder-surfing and
 * shared machines — it does not encrypt the database, which the browser
 * profile owner can always read. The settings screen says so on web.
 */
import {
  deleteSecret,
  deriveHash,
  getSecret,
  setSecret,
  timingSafeEqual,
} from '../../platform/web/secretStore';
import {validatePin} from './applockCommon';

export {
  APP_LOCK_ENABLED_KEY,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  isAppLockEnabled,
  setAppLockEnabled,
  validatePin,
} from './applockCommon';

const APPLOCK_SECRET = 'paisaflow.applock.pin';

interface StoredPin {
  salt: string;
  hash: string;
  iterations: number;
}

const ITERATIONS = 150_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function readStored(): Promise<StoredPin | null> {
  const raw = await getSecret(APPLOCK_SECRET);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as StoredPin).salt === 'string' &&
      typeof (parsed as StoredPin).hash === 'string' &&
      typeof (parsed as StoredPin).iterations === 'number'
    ) {
      return parsed as StoredPin;
    }
  } catch {
    // Corrupt record — treat as no PIN.
  }
  return null;
}

export async function setAppLockPin(pin: string): Promise<void> {
  const error = validatePin(pin);
  if (error) {
    throw new Error(error);
  }
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await deriveHash(pin, salt, ITERATIONS);
    const record: StoredPin = {
      salt: toBase64(salt),
      hash: toBase64(hash),
      iterations: ITERATIONS,
    };
    await setSecret(APPLOCK_SECRET, JSON.stringify(record));
  } catch {
    throw new Error('Could not save the PIN securely. Please try again.');
  }
}

export async function verifyAppLockPin(pin: string): Promise<boolean> {
  try {
    const stored = await readStored();
    if (!stored) {
      return false;
    }
    const candidate = await deriveHash(pin, fromBase64(stored.salt), stored.iterations);
    return timingSafeEqual(candidate, fromBase64(stored.hash));
  } catch {
    return false;
  }
}

export async function hasAppLockPin(): Promise<boolean> {
  return (await readStored()) !== null;
}

export async function deleteAppLockPin(): Promise<void> {
  await deleteSecret(APPLOCK_SECRET);
}
