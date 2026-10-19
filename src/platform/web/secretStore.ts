/**
 * Browser stand-in for react-native-keychain.
 *
 * Secrets are AES-GCM encrypted with a non-extractable CryptoKey that lives
 * in IndexedDB (structured clone keeps it non-extractable), so the plaintext
 * never sits in storage. Be honest about the limit: unlike the Android
 * Keystore, any script running on this origin can ask the key to decrypt.
 * The UI says so wherever a secret is entered (see platform flags).
 *
 * Errors are swallowed into generic messages; secret values are never logged.
 */
import {idbDelete, idbGet, idbSet} from './idb';

const KEY_RECORD = '__aes_key__';

interface EncryptedRecord {
  iv: Uint8Array;
  data: ArrayBuffer;
}

let keyPromise: Promise<CryptoKey> | null = null;

function subtle(): SubtleCrypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Web Crypto needs a secure context (https or localhost).
    throw new Error('Secure storage is unavailable in this context.');
  }
  return crypto.subtle;
}

async function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = await idbGet<CryptoKey>('secrets', KEY_RECORD);
      if (existing) {
        return existing;
      }
      const key = await subtle().generateKey(
        {name: 'AES-GCM', length: 256},
        false,
        ['encrypt', 'decrypt'],
      );
      await idbSet('secrets', KEY_RECORD, key);
      return key;
    })().catch(error => {
      keyPromise = null;
      throw error;
    });
  }
  return keyPromise;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Copy into a plain ArrayBuffer (Web Crypto wants BufferSource, not a view over SharedArrayBuffer). */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Encrypt and persist a secret under `name`. */
export async function setSecret(name: string, value: string): Promise<void> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle().encrypt({name: 'AES-GCM', iv}, key, toBuffer(encoder.encode(value)));
  const record: EncryptedRecord = {iv, data};
  await idbSet('secrets', name, record);
}

/** Decrypt a stored secret, or null when absent/unreadable. */
export async function getSecret(name: string): Promise<string | null> {
  try {
    const record = await idbGet<EncryptedRecord>('secrets', name);
    if (!record) {
      return null;
    }
    const key = await getKey();
    const plain = await subtle().decrypt({name: 'AES-GCM', iv: toBuffer(record.iv)}, key, record.data);
    return decoder.decode(plain) || null;
  } catch {
    return null;
  }
}

/** Remove a stored secret (no-op when absent). */
export async function deleteSecret(name: string): Promise<void> {
  try {
    await idbDelete('secrets', name);
  } catch {
    // Treat as already removed.
  }
}

/** Constant-time comparison of two equal-length byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/** PBKDF2-SHA256 of `input` with `salt` (used for PIN hashing). */
export async function deriveHash(input: string, salt: Uint8Array, iterations = 150_000): Promise<Uint8Array> {
  const material = await subtle().importKey('raw', toBuffer(encoder.encode(input)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    {name: 'PBKDF2', hash: 'SHA-256', salt: toBuffer(salt), iterations},
    material,
    256,
  );
  return new Uint8Array(bits);
}
