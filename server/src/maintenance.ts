import type { Storage } from './storage';
import { addDays, newId, viennaToday } from './util';

export interface RetentionConfig {
  purgeContentDays: number;
  deleteGroupDays: number;
}

export const defaultRetention = (): RetentionConfig => ({
  purgeContentDays: Number(process.env.PURGE_CONTENT_DAYS ?? 60),
  deleteGroupDays: Number(process.env.DELETE_GROUP_DAYS ?? 400),
});

export async function runMaintenance(storage: Storage, today = viennaToday(), cfg = defaultRetention()) {
  if (!Number.isInteger(cfg.purgeContentDays) || cfg.purgeContentDays < 0 ||
      !Number.isInteger(cfg.deleteGroupDays) || cfg.deleteGroupDays < 0) {
    throw new Error('Retention days must be non-negative integers');
  }
  const purgeBefore = addDays(today, -cfg.purgeContentDays);
  const deleteBefore = addDays(today, -cfg.deleteGroupDays);
  let purged = 0;
  let deleted = 0;
  for await (const candidate of storage.rounds()) {
    try {
      const result = await storage.transact(candidate.group.id, (round) => {
        const g = round.group;
        if ((g.exchange_date ?? g.created_at.slice(0, 10)) < deleteBefore) {
          g.deleted = true;
          return 'deleted';
        }
        if (g.exchange_date && g.exchange_date < purgeBefore && !g.content_purged_at) {
          g.content_purged_at = new Date().toISOString();
          g.content_version = newId();
          round.messages = []; round.wishes = [];
          for (const p of round.participants) p.about = '';
          return 'purged';
        }
        return 'unchanged';
      });
      if (result === 'deleted') deleted++;
      else if (result === 'purged') purged++;
    } catch (error) {
      // Another job or the organizer may already have removed this round.
      if (!(error instanceof Error && 'code' in error && error.code === 'not-found')) throw error;
    }
  }
  await storage.sweep();
  return { purged, deleted };
}
