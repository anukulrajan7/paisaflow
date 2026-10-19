/**
 * Web id generator: browsers ship crypto.getRandomValues natively, so the
 * react-native-get-random-values polyfill is not needed. `uuid` v4 uses it
 * under the hood; crypto.randomUUID is preferred when available.
 */
import {v4 as uuidv4} from 'uuid';

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return uuidv4();
}
