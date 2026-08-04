import {migration001} from './001_initial';
import {migration002} from './002_detected_expenses';
import type {Migration} from './migrationRunner';

/**
 * All migrations, append-only. To change the schema, add a new migration
 * with the next version number — never edit an applied one.
 */
export const MIGRATIONS: Migration[] = [migration001, migration002];

export {runMigrations} from './migrationRunner';
export type {Migration} from './migrationRunner';
