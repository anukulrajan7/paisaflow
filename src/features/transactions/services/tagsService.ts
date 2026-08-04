import {getDb} from '../../../database/connection/connection';
import {queryRows} from '../../../database/connection/helpers';
import {newId} from '../../../utils/id';

const MAX_TAGS_PER_TRANSACTION = 10;

/**
 * Parse a comma-separated tags input into clean tag names:
 * trimmed, internal whitespace collapsed, case-insensitively deduped,
 * capped at a sensible per-transaction limit.
 */
export function parseTagsInput(input: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of input.split(',')) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(name);
  }
  return tags.slice(0, MAX_TAGS_PER_TRANSACTION);
}

/** Tag names linked to a transaction, alphabetical. */
export async function getTagsForTransaction(
  transactionId: string,
): Promise<string[]> {
  const rows = await queryRows<{name: string}>(
    getDb(),
    `SELECT t.name AS name FROM tags t
     JOIN transaction_tags tt ON tt.tag_id = t.id
     WHERE tt.transaction_id = ?
     ORDER BY t.name ASC`,
    [transactionId],
  );
  return rows.map(row => row.name);
}

/**
 * Replace the transaction's tag links with the given names.
 * Tag rows are upserted by name; links are rebuilt atomically.
 */
export async function setTagsForTransaction(
  transactionId: string,
  names: string[],
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.transaction(async tx => {
    await tx.executeAsync(
      'DELETE FROM transaction_tags WHERE transaction_id = ?',
      [transactionId],
    );
    for (const name of names) {
      await tx.executeAsync(
        'INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (?, ?, ?)',
        [newId(), name, now],
      );
      await tx.executeAsync(
        `INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id)
         VALUES (?, (SELECT id FROM tags WHERE name = ?))`,
        [transactionId, name],
      );
    }
  });
}
