import type {QueryResult, SQLiteValue} from 'react-native-nitro-sqlite';

import type {SqlDb, SqlExecutor} from '../connection/types';

/**
 * In-memory fake of the nitro-sqlite API surface used by this app.
 *
 * It is NOT a general SQL engine — it interprets exactly the small,
 * consistent SQL subset emitted by our migrations, seeds and repositories:
 *
 * - CREATE TABLE (column + table-level PRIMARY KEY detection; other
 *   constraints parsed but not enforced, except PK uniqueness for INSERT)
 * - CREATE INDEX / PRAGMA → no-op
 * - INSERT [OR IGNORE | OR REPLACE] INTO t (cols) VALUES (?, …)
 * - UPDATE t SET col = ? | NULL | literal, … WHERE <conds>
 * - DELETE FROM t WHERE <conds>
 * - SELECT <cols|*> FROM t [WHERE <conds>] [ORDER BY col [ASC|DESC], …]
 *   [LIMIT ?|-1] [OFFSET ?]
 *
 * WHERE conditions: AND-combined `col = ?`, `!=`, `>`, `>=`, `<`, `<=`,
 * `IS [NOT] NULL`, `IN (…)`, `LIKE ? ESCAPE '\'` (case-insensitive like
 * SQLite's default). All repositories build queries in this subset — that is
 * deliberate, so unit tests exercise the real repository code paths.
 *
 * `transaction()` snapshots all tables and rolls back on error.
 */

type Row = Record<string, SQLiteValue>;

interface TableDef {
  name: string;
  primaryKey: string[];
  rows: Row[];
}

export interface FakeDb extends SqlDb {
  /** Test helper: direct access to a table's rows. */
  getRows(tableName: string): Row[];
}

export function createFakeDb(): FakeDb {
  return new FakeDbImpl();
}

function makeResult(rows: Row[], rowsAffected = 0): QueryResult {
  return {
    rowsAffected,
    results: rows,
    rows: {
      _array: rows,
      length: rows.length,
      item: (index: number) => rows[index],
    },
  } as unknown as QueryResult;
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(input: string): string[] {  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
    }
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') {
    parts.push(current.trim());
  }
  return parts;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Deep-enough clone for rollback snapshots: rows hold only primitives. */
function cloneTables(tables: Map<string, TableDef>): Map<string, TableDef> {
  const clone = new Map<string, TableDef>();
  for (const [name, def] of tables) {
    clone.set(name, {
      name: def.name,
      primaryKey: [...def.primaryKey],
      rows: def.rows.map(row => ({...row})),
    });
  }
  return clone;
}

/** SQLite LIKE semantics: % and _ wildcards, optional escape char, ASCII case-insensitive. */
function likeToRegExp(pattern: string, escapeChar: string | null): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (escapeChar && ch === escapeChar && i + 1 < pattern.length) {
      source += escapeRegExp(pattern[i + 1]);
      i += 1;
    } else if (ch === '%') {
      source += '.*';
    } else if (ch === '_') {
      source += '.';
    } else {
      source += escapeRegExp(ch);
    }
  }
  return new RegExp(`^${source}$`, 'i');
}

/** Consumes SQL parameter values in textual order. */
class ParamCursor {
  private index = 0;
  constructor(private readonly params: SQLiteValue[]) {}
  next(): SQLiteValue {
    if (this.index >= this.params.length) {
      throw new Error('fakeDb: not enough SQL parameters supplied');
    }
    const value = this.params[this.index];
    this.index += 1;
    return value;
  }
}

/** Parse a value token: `?`, integer literal, 'string literal', or NULL. */
function parseValueToken(token: string, cursor: ParamCursor): SQLiteValue {
  const trimmed = token.trim();
  if (trimmed === '?') {
    return cursor.next();
  }
  if (/^NULL$/i.test(trimmed)) {
    return null;
  }
  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }
  const stringMatch = trimmed.match(/^'((?:[^']|'')*)'$/);
  if (stringMatch) {
    return stringMatch[1].replace(/''/g, "'");
  }
  throw new Error(`fakeDb: unsupported value token '${trimmed}'`);
}

type Condition = (row: Row) => boolean;

function parseConditions(where: string, cursor: ParamCursor): Condition {
  const conditions = where.split(' AND ').map(part => part.trim());
  const predicates = conditions.map((condition): Condition => {
    let match = condition.match(/^(\w+) IS (NOT )?NULL$/i);
    if (match) {
      const [, column, not] = match;
      return row => (not ? row[column] != null : row[column] == null);
    }

    match = condition.match(/^(\w+) IN \((.+)\)$/i);
    if (match) {
      const [, column, list] = match;
      const values = splitTopLevel(list).map(token =>
        parseValueToken(token, cursor),
      );
      return row => values.some(value => value === row[column]);
    }

    match = condition.match(/^(\w+) LIKE (\?) ESCAPE '\\'$/i);
    if (match) {
      const [, column] = match;
      const pattern = parseValueToken(match[2], cursor);
      if (typeof pattern !== 'string') {
        throw new Error('fakeDb: LIKE pattern must be a string parameter');
      }
      const regex = likeToRegExp(pattern, '\\');
      return row =>
        typeof row[column] === 'string' && regex.test(row[column] as string);
    }

    match = condition.match(/^(\w+) (>=|<=|!=|=|>|<) (.+)$/);
    if (match) {
      const [, column, operator, token] = match;
      const expected = parseValueToken(token, cursor);
      return row => {
        const actual = row[column];
        if (actual == null || expected == null) {
          return false;
        }
        switch (operator) {
          case '=':
            return actual === expected;
          case '!=':
            return actual !== expected;
          case '>':
            return actual > expected;
          case '>=':
            return actual >= expected;
          case '<':
            return actual < expected;
          case '<=':
            return actual <= expected;
          default:
            return false;
        }
      };
    }

    throw new Error(`fakeDb: unsupported WHERE condition '${condition}'`);
  });

  return row => predicates.every(predicate => predicate(row));
}

interface OrderKey {
  column: string;
  descending: boolean;
}

function parseOrderBy(orderBy: string): OrderKey[] {
  return orderBy.split(',').map(part => {
    const match = part.trim().match(/^(\w+)( ASC| DESC)?$/i);
    if (!match) {
      throw new Error(`fakeDb: unsupported ORDER BY term '${part}'`);
    }
    return {
      column: match[1],
      descending: match[2]?.trim().toUpperCase() === 'DESC',
    };
  });
}

function compareValues(a: SQLiteValue, b: SQLiteValue): number {
  // SQLite sorts NULLs first in ascending order.
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return -1;
  }
  if (b == null) {
    return 1;
  }
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

class FakeDbImpl implements FakeDb {
  private tables = new Map<string, TableDef>();

  async executeAsync(
    sql: string,
    params: SQLiteValue[] = [],
  ): Promise<QueryResult> {
    return this.execute(sql, params);
  }

  execute(sql: string, params: SQLiteValue[] = []): QueryResult {
    const normalized = sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
    if (/^PRAGMA /i.test(normalized)) {
      return makeResult([]);
    }
    if (/^CREATE TABLE /i.test(normalized)) {
      return this.executeCreateTable(normalized);
    }
    if (/^CREATE (UNIQUE )?INDEX /i.test(normalized)) {
      return makeResult([]);
    }
    if (/^INSERT /i.test(normalized)) {
      return this.executeInsert(normalized, params);
    }
    if (/^UPDATE /i.test(normalized)) {
      return this.executeUpdate(normalized, params);
    }
    if (/^DELETE /i.test(normalized)) {
      return this.executeDelete(normalized, params);
    }
    if (/^SELECT /i.test(normalized)) {
      return this.executeSelect(normalized, params);
    }
    throw new Error(`fakeDb: unsupported statement: ${normalized}`);
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const snapshot = cloneTables(this.tables);
    try {
      return await fn(this);
    } catch (error) {
      this.tables = snapshot;
      throw error;
    }
  }

  getRows(tableName: string): Row[] {
    return this.table(tableName).rows;
  }

  private table(name: string): TableDef {
    const table = this.tables.get(name);
    if (!table) {
      throw new Error(`fakeDb: no such table '${name}'`);
    }
    return table;
  }

  private executeCreateTable(sql: string): QueryResult {
    const match = sql.match(
      /^CREATE TABLE (IF NOT EXISTS )?(\w+) ?\((.*)\)$/i,
    );
    if (!match) {
      throw new Error(`fakeDb: cannot parse CREATE TABLE: ${sql}`);
    }
    const [, ifNotExists, name, body] = match;
    if (this.tables.has(name)) {
      if (ifNotExists) {
        return makeResult([]);
      }
      throw new Error(`fakeDb: table '${name}' already exists`);
    }
    const primaryKey: string[] = [];
    for (const part of splitTopLevel(body)) {
      const upper = part.toUpperCase();
      if (upper.startsWith('PRIMARY KEY')) {
        const cols = part
          .slice(part.indexOf('(') + 1, part.lastIndexOf(')'))
          .split(',')
          .map(col => col.trim());
        primaryKey.push(...cols);
      } else if (
        upper.startsWith('FOREIGN KEY') ||
        upper.startsWith('CHECK') ||
        upper.startsWith('UNIQUE')
      ) {
        // Table-level constraints are not enforced by the fake (except PKs).
      } else {
        const column = part.match(/^(\w+)/);
        if (column && /\bPRIMARY KEY\b/i.test(part)) {
          primaryKey.push(column[1]);
        }
      }
    }
    this.tables.set(name, {name, primaryKey, rows: []});
    return makeResult([]);
  }

  private executeInsert(sql: string, params: SQLiteValue[]): QueryResult {
    const match = sql.match(
      /^INSERT (OR IGNORE |OR REPLACE )?INTO (\w+) \(([^)]*)\) VALUES \((.*)\)$/i,
    );
    if (!match) {
      throw new Error(`fakeDb: cannot parse INSERT: ${sql}`);
    }
    const [, modeRaw, name, columnList, valueList] = match;
    const mode = modeRaw?.trim().toUpperCase();
    const table = this.table(name);
    const columns = columnList.split(',').map(col => col.trim());
    const cursor = new ParamCursor(params);
    const values = splitTopLevel(valueList).map(token =>
      parseValueToken(token, cursor),
    );
    if (columns.length !== values.length) {
      throw new Error(`fakeDb: INSERT column/value count mismatch for '${name}'`);
    }

    const row: Row = {};
    columns.forEach((column, index) => {
      row[column] = values[index];
    });

    if (table.primaryKey.length > 0) {
      const duplicateIndex = table.rows.findIndex(existing =>
        table.primaryKey.every(column => existing[column] === row[column]),
      );
      if (duplicateIndex >= 0) {
        if (mode === 'OR IGNORE') {
          return makeResult([], 0);
        }
        if (mode === 'OR REPLACE') {
          table.rows.splice(duplicateIndex, 1);
        } else {
          throw new Error(`fakeDb: UNIQUE constraint failed on '${name}'`);
        }
      }
    }
    table.rows.push(row);
    return makeResult([], 1);
  }

  private executeUpdate(sql: string, params: SQLiteValue[]): QueryResult {
    const match = sql.match(/^UPDATE (\w+) SET (.+?) WHERE (.+)$/i);
    if (!match) {
      throw new Error(`fakeDb: cannot parse UPDATE: ${sql}`);
    }
    const [, name, assignments, where] = match;
    const table = this.table(name);
    const cursor = new ParamCursor(params);
    const setters = splitTopLevel(assignments).map(assignment => {
      const parsed = assignment.match(/^(\w+) = (.+)$/);
      if (!parsed) {
        throw new Error(`fakeDb: cannot parse SET assignment '${assignment}'`);
      }
      return {
        column: parsed[1],
        value: parseValueToken(parsed[2], cursor),
      };
    });
    const condition = parseConditions(where, cursor);

    let affected = 0;
    for (const row of table.rows) {
      if (condition(row)) {
        for (const setter of setters) {
          row[setter.column] = setter.value;
        }
        affected += 1;
      }
    }
    return makeResult([], affected);
  }

  private executeDelete(sql: string, params: SQLiteValue[]): QueryResult {
    const match = sql.match(/^DELETE FROM (\w+)(?: WHERE (.+))?$/i);
    if (!match) {
      throw new Error(`fakeDb: cannot parse DELETE: ${sql}`);
    }
    const [, name, where] = match;
    const table = this.table(name);
    const cursor = new ParamCursor(params);
    const condition = where ? parseConditions(where, cursor) : () => true;
    const before = table.rows.length;
    table.rows = table.rows.filter(row => !condition(row));
    return makeResult([], before - table.rows.length);
  }

  private executeSelect(sql: string, params: SQLiteValue[]): QueryResult {
    const match = sql.match(/^SELECT (.+?) FROM (\w+)(.*)$/i);
    if (!match) {
      throw new Error(`fakeDb: cannot parse SELECT: ${sql}`);
    }
    const [, selectList, name, restRaw] = match;
    const table = this.table(name);
    let rest = restRaw.trim();

    let offsetToken: string | null = null;
    let limitToken: string | null = null;
    let orderBy: string | null = null;
    let where: string | null = null;

    const offsetMatch = rest.match(/(?:^| )OFFSET (\?|-?\d+)$/i);
    if (offsetMatch) {
      offsetToken = offsetMatch[1];
      rest = rest.slice(0, offsetMatch.index).trim();
    }
    const limitMatch = rest.match(/(?:^| )LIMIT (\?|-?\d+)$/i);
    if (limitMatch) {
      limitToken = limitMatch[1];
      rest = rest.slice(0, limitMatch.index).trim();
    }
    const orderMatch = rest.match(/(?:^| )ORDER BY (.+)$/i);
    if (orderMatch) {
      orderBy = orderMatch[1];
      rest = rest.slice(0, orderMatch.index).trim();
    }
    const whereMatch = rest.match(/^(?:WHERE (.+))?$/i);
    if (whereMatch) {
      where = whereMatch[1];
    } else if (rest !== '') {
      throw new Error(`fakeDb: unsupported SELECT clause '${rest}'`);
    }

    // Params bind in textual order: WHERE, then LIMIT, then OFFSET.
    const cursor = new ParamCursor(params);
    const condition = where ? parseConditions(where, cursor) : () => true;
    let rows = table.rows.filter(condition).map(row => ({...row}));

    if (orderBy) {
      const keys = parseOrderBy(orderBy);
      rows.sort((a, b) => {
        for (const key of keys) {
          const order = compareValues(a[key.column], b[key.column]);
          if (order !== 0) {
            return key.descending ? -order : order;
          }
        }
        return 0;
      });
    }

    const limit =
      limitToken == null ? null : Number(parseValueToken(limitToken, cursor));
    const offset =
      offsetToken == null ? 0 : Number(parseValueToken(offsetToken, cursor));
    if (offset > 0) {
      rows = rows.slice(offset);
    }
    if (limit != null && limit >= 0) {
      rows = rows.slice(0, limit);
    }

    if (selectList.trim() !== '*') {
      const projections = splitTopLevel(selectList).map(item => {
        const parsed = item.match(/^(\w+)(?: AS (\w+))?$/i);
        if (!parsed) {
          throw new Error(`fakeDb: unsupported SELECT term '${item}'`);
        }
        return {column: parsed[1], alias: parsed[2] ?? parsed[1]};
      });
      rows = rows.map(row => {
        const projected: Row = {};
        for (const {column, alias} of projections) {
          projected[alias] = row[column];
        }
        return projected;
      });
    }

    return makeResult(rows, 0);
  }
}
