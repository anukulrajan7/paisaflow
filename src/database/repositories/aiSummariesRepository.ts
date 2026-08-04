import type {SqlDb} from '../connection/types';
import {queryFirst} from '../connection/helpers';
import type {AiSummaryRow} from '../types/rows';
import {newId} from '../../utils/id';
import type {AiSummariesRepository} from './interfaces';
import {mapAiSummaryRow} from './mappers';

const COLUMNS =
  'id, period_type, period_start, period_end, input_hash, model, summary_json, created_at';

export function createAiSummariesRepository(db: SqlDb): AiSummariesRepository {
  return {
    async createSummary(input) {
      const id = newId();
      const now = Date.now();
      await db.executeAsync(
        `INSERT INTO ai_summaries
          (id, period_type, period_start, period_end, input_hash, model, summary_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.periodType,
          input.periodStart,
          input.periodEnd,
          input.inputHash,
          input.model,
          input.summaryJson,
          now,
        ],
      );
      return {...input, id, createdAt: now};
    },

    async findByInputHash(inputHash) {
      const row = await queryFirst<AiSummaryRow>(
        db,
        `SELECT ${COLUMNS} FROM ai_summaries WHERE input_hash = ? ORDER BY created_at DESC`,
        [inputHash],
      );
      return row ? mapAiSummaryRow(row) : null;
    },

    async findLatestForPeriod(periodType, periodStart, periodEnd) {
      const row = await queryFirst<AiSummaryRow>(
        db,
        `SELECT ${COLUMNS} FROM ai_summaries
         WHERE period_type = ? AND period_start = ? AND period_end = ?
         ORDER BY created_at DESC`,
        [periodType, periodStart, periodEnd],
      );
      return row ? mapAiSummaryRow(row) : null;
    },
  };
}
