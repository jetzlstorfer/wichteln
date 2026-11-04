import { transaction, type DB } from './db';
import { addDays, viennaToday } from './util';

export interface RetentionConfig {
  /** Days after the Bescherung when wish lists, notes and messages are deleted. */
  purgeContentDays: number;
  /** Days after the Bescherung (or creation) when the whole round is deleted. */
  deleteGroupDays: number;
}

export const defaultRetention = (): RetentionConfig => ({
  purgeContentDays: Number(process.env.PURGE_CONTENT_DAYS ?? 60),
  deleteGroupDays: Number(process.env.DELETE_GROUP_DAYS ?? 400),
});

/**
 * Privacy housekeeping. Personal content is removed a while after Christmas; the
 * bare round (names + pairs) is kept a bit longer than a year so "Nächstes Jahr
 * wieder wichteln" can avoid last year's pairs.
 */
export function runMaintenance(db: DB, today = viennaToday(), cfg: RetentionConfig = defaultRetention()) {
  const purgeBefore = addDays(today, -cfg.purgeContentDays);
  const deleteBefore = addDays(today, -cfg.deleteGroupDays);

  const toPurge = db
    .prepare('SELECT id FROM groups WHERE exchange_date IS NOT NULL AND exchange_date < ? AND content_purged_at IS NULL')
    .all(purgeBefore) as { id: string }[];
  for (const { id } of toPurge) {
    transaction(db, () => {
      db.prepare('DELETE FROM messages WHERE group_id = ?').run(id);
      db.prepare('DELETE FROM wishes WHERE participant_id IN (SELECT id FROM participants WHERE group_id = ?)').run(id);
      db.prepare("UPDATE participants SET about = '' WHERE group_id = ?").run(id);
      db.prepare('UPDATE groups SET content_purged_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    });
  }

  const toDelete = db
    .prepare(
      `SELECT id FROM groups
       WHERE (exchange_date IS NOT NULL AND exchange_date < ?)
          OR (exchange_date IS NULL AND substr(created_at, 1, 10) < ?)`,
    )
    .all(deleteBefore, deleteBefore) as { id: string }[];
  for (const { id } of toDelete) {
    transaction(db, () => {
      db.prepare('UPDATE groups SET previous_group_id = NULL WHERE previous_group_id = ?').run(id);
      db.prepare('DELETE FROM groups WHERE id = ?').run(id);
    });
  }
  return { purged: toPurge.length, deleted: toDelete.length };
}
