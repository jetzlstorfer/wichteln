import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export type DB = DatabaseSync;

export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE groups (
    id TEXT PRIMARY KEY,
    admin_token TEXT NOT NULL UNIQUE,
    invite_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    organizer_name TEXT NOT NULL,
    organizer_participant_id TEXT,
    budget INTEGER,
    exchange_date TEXT,
    message TEXT NOT NULL DEFAULT '',
    allow_self_join INTEGER NOT NULL DEFAULT 1,
    drawn_at TEXT,
    revealed_at TEXT,
    previous_group_id TEXT,
    content_purged_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE participants (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token TEXT UNIQUE,
    token_source TEXT,
    claimed_at TEXT,
    last_seen_at TEXT,
    reveal_seen_at TEXT,
    partner_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
    about TEXT NOT NULL DEFAULT '',
    gift_status INTEGER NOT NULL DEFAULT 0,
    opened_doors TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_participants_group ON participants(group_id);

  CREATE TABLE exclusions (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    giver_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    receiver_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    reason TEXT NOT NULL DEFAULT 'custom',
    UNIQUE (giver_id, receiver_id)
  );
  CREATE INDEX idx_exclusions_group ON exclusions(group_id);

  CREATE TABLE wishes (
    id TEXT PRIMARY KEY,
    participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    url TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_wishes_participant ON wishes(participant_id);

  CREATE TABLE assignments (
    giver_id TEXT PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    receiver_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE
  );
  CREATE INDEX idx_assignments_group ON assignments(group_id);
  CREATE INDEX idx_assignments_receiver ON assignments(receiver_id);

  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    giver_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    receiver_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    from_giver INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
  );
  CREATE INDEX idx_messages_pair ON messages(giver_id, receiver_id);
  `,
  `
  ALTER TABLE participants ADD COLUMN verified_at TEXT;
  ALTER TABLE participants ADD COLUMN reveal_consent_at TEXT;

  -- Only the creator's own link had an established owner in the old flow.
  UPDATE participants SET verified_at = claimed_at
  WHERE token IS NOT NULL AND id IN (SELECT organizer_participant_id FROM groups);
  UPDATE participants SET token = NULL, token_source = NULL, claimed_at = NULL
  WHERE verified_at IS NULL;

  CREATE TABLE claim_requests (
    token TEXT PRIMARY KEY,
    participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    verification_code TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX idx_claim_requests_participant ON claim_requests(participant_id);
  `,
];

export function openDatabase(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: DB) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = version; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export function transaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
