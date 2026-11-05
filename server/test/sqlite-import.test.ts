import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { TableClient, TableServiceClient } from '@azure/data-tables';
import { openDatabase } from '../src/db';
import { importSqlite } from '../src/sqlite-import';
import { MemoryStorage, TableStorage, type Storage } from '../src/storage';
import { newId } from '../src/util';
import { createApp } from '../src/app';
import type { MeView } from '../../shared/types';

let directory: string;
let file: string;
let storage: Storage;
let names: string[] = [];
const connection = process.env.AZURITE_CONNECTION_STRING ?? 'UseDevelopmentStorage=true';
beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'wichteln-import-test-'));
  file = path.join(directory, 'source.db');
  const db = openDatabase(file);
  db.exec(`
    INSERT INTO groups (id, admin_token, invite_code, name, organizer_name, organizer_participant_id, drawn_at, created_at, updated_at)
      VALUES ('family', 'source-admin-token', 'source-invite-code', 'Family', 'A', 'a', '2026-11-05', '2026-11-05', '2026-11-05');
    INSERT INTO participants (id, group_id, name, token, token_source, claimed_at, created_at) VALUES
      ('a', 'family', 'A', 'source-person-a', 'self', '2026-11-05', '2026-11-05'),
      ('b', 'family', 'B', 'source-person-b', 'self', '2026-11-05', '2026-11-05'),
      ('c', 'family', 'C', 'source-person-c', 'self', '2026-11-05', '2026-11-05');
    INSERT INTO wishes (id, participant_id, text, created_at) VALUES ('wish', 'b', 'Book', '2026-11-05');
    INSERT INTO assignments (giver_id, group_id, receiver_id) VALUES ('a', 'family', 'b'), ('b', 'family', 'c'), ('c', 'family', 'a');
    INSERT INTO messages (id, group_id, giver_id, receiver_id, from_giver, body, created_at)
      VALUES ('message', 'family', 'a', 'b', 1, 'Which book?', '2026-11-05');
  `);
  db.close();
  if (process.env.TEST_TABLE_STORAGE === 'true') {
    const suffix = newId().replace(/[-_]/g, '');
    names = [`Rounds${suffix}`, `Links${suffix}`, `Rates${suffix}`];
    const service = TableServiceClient.fromConnectionString(connection, { allowInsecureConnection: true });
    for (const name of names) await service.createTable(name);
    storage = new TableStorage(
      TableClient.fromConnectionString(connection, names[0], { allowInsecureConnection: true }),
      TableClient.fromConnectionString(connection, names[1], { allowInsecureConnection: true }),
      TableClient.fromConnectionString(connection, names[2], { allowInsecureConnection: true }),
    );
  } else storage = new MemoryStorage();
});
afterEach(async () => {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${file}${suffix}`, { force: true });
  rmSync(directory, { recursive: true });
  if (names.length) {
    const service = TableServiceClient.fromConnectionString(connection, { allowInsecureConnection: true });
    for (const name of names) await service.deleteTable(name);
  }
});

it('preflights without writes, preserves source bytes and links, and refuses to overwrite imported data', async () => {
  const source = readFileSync(file);
  expect(await importSqlite(file, storage)).toEqual({ rounds: 1, participants: 3, applied: false });
  expect(await storage.read('family')).toBeUndefined();
  expect(await storage.resolve('admin', 'source-admin-token')).toBeUndefined();
  expect(await importSqlite(file, storage, true)).toEqual({ rounds: 1, participants: 3, applied: true });
  expect(readFileSync(file)).toEqual(source);
  const app = createApp(storage, { disableRateLimits: true });
  expect((await app.request('/api/admin/source-admin-token')).status).toBe(200);
  expect((await app.request('/api/invite/source-invite-code')).status).toBe(200);
  const me = await (await app.request('/api/me/source-person-a')).json() as MeView;
  expect(me.recipient?.name).toBe('B');
  expect(me.recipient?.wishes[0].text).toBe('Book');
  const b = await (await app.request('/api/me/source-person-b')).json() as MeView;
  expect(b.unread.fromChristkind).toBe(1);
  await expect(importSqlite(file, storage, true)).rejects.toThrow('already exists');
  expect((await storage.read('family'))!.messages).toHaveLength(1);
});
