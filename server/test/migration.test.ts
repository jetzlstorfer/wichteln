import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { createApp } from '../src/app';
import { MIGRATIONS, openDatabase } from '../src/db';

it('revokes unverified legacy links without deleting family data and applies the upgrade only once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wichteln-migration-'));
  const file = join(dir, 'legacy.db');
  try {
    const legacy = new DatabaseSync(file);
    try {
      legacy.exec(MIGRATIONS[0]);
      legacy.exec('PRAGMA user_version = 1');
      legacy.prepare(
        `INSERT INTO groups (id, admin_token, invite_code, name, organizer_name, organizer_participant_id, drawn_at, created_at, updated_at)
         VALUES ('family', 'legacy-admin-token', 'legacy-invite-code', 'Familie', 'Mama', 'mama', ?, ?, ?)`,
      ).run('2026-11-04', '2026-11-04', '2026-11-04');
      for (const [id, name, source] of [['mama', 'Mama', 'self'], ['lisa', 'Lisa', 'self'], ['oma', 'Oma', 'organizer']]) {
        legacy.prepare(
          'INSERT INTO participants (id, group_id, name, token, token_source, claimed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(id, 'family', name, `legacy-${id}-token`, source, '2026-11-04', '2026-11-04');
      }
      legacy.exec(`
        INSERT INTO wishes (id, participant_id, text, created_at) VALUES ('wish', 'lisa', 'Buch', '2026-11-04');
        INSERT INTO assignments (giver_id, group_id, receiver_id) VALUES
          ('mama', 'family', 'lisa'), ('lisa', 'family', 'oma'), ('oma', 'family', 'mama');
        INSERT INTO messages (id, group_id, giver_id, receiver_id, from_giver, body, created_at)
          VALUES ('message', 'family', 'mama', 'lisa', 1, 'Welche Farbe?', '2026-11-04');
      `);
    } finally {
      legacy.close();
    }

    for (let open = 0; open < 2; open++) {
      const db = openDatabase(file);
      try {
        const app = createApp(db, { disableRateLimits: true });
        for (const name of ['lisa', 'oma']) {
          expect((await app.request(`/api/me/legacy-${name}-token`)).status).toBe(404);
          expect(db.prepare('SELECT token, verified_at FROM participants WHERE id = ?').get(name))
            .toMatchObject({ token: null, verified_at: null });
        }
        expect((await app.request('/api/me/legacy-mama-token')).status).toBe(200);
        expect((await app.request('/api/admin/legacy-admin-token/participants/lisa/link', { method: 'POST' })).status).toBe(404);
        expect(db.prepare('SELECT text FROM wishes WHERE id = ?').get('wish')).toMatchObject({ text: 'Buch' });
        expect(db.prepare('SELECT count(*) AS n FROM assignments').get()).toMatchObject({ n: 3 });
        expect(db.prepare('SELECT count(*) AS n FROM messages').get()).toMatchObject({ n: 1 });
        expect(db.prepare('SELECT count(*) AS n FROM participants').get()).toMatchObject({ n: 3 });
      } finally {
        db.close();
      }
    }
  } finally {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${file}${suffix}`, { force: true });
    rmdirSync(dir);
  }
});
