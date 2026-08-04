import {open} from 'react-native-nitro-sqlite';
import type {NitroSQLiteConnection} from 'react-native-nitro-sqlite';

import type {SqlDb} from './types';

const DATABASE_NAME = 'paisaflow.db';

let instance: NitroSQLiteConnection | null = null;

/**
 * Singleton connection to the app database.
 * Lazily opened on first use; foreign keys are enforced for every statement.
 */
export function getDb(): SqlDb {
  if (!instance) {
    instance = open({name: DATABASE_NAME});
    instance.execute('PRAGMA foreign_keys = ON;');
  }
  return instance;
}

/** Close the connection and reset the singleton (dev/test hook). */
export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
