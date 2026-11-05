import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  assignmentSchema, exclusionSchema, groupSchema, messageSchema, participantSchema, wishSchema,
  type Round, type Storage,
} from './storage';

/** Reads a consistent snapshot without migrating or writing to the source SQLite database. */
export function readSqliteRounds(file: string): Round[] {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec('BEGIN');
    const version = z.object({ user_version: z.number().int().min(1).max(3) }).parse(db.prepare('PRAGMA user_version').get()).user_version;
    const result: Round[] = [];
    for (const raw of db.prepare('SELECT * FROM groups ORDER BY created_at, rowid').all()) {
      const group = groupSchema.parse({
        ...raw, draw_version: 'import', content_version: 'import', message_sequence: 0,
        organizer_participant_id: raw.organizer_participant_id ?? null,
      });
      const round: Round = { group, participants: [], exclusions: [], wishes: [], assignments: [], messages: [] };
      for (const [position, person] of db.prepare('SELECT * FROM participants WHERE group_id = ? ORDER BY created_at, rowid').all(group.id).entries()) {
        const keepToken = version === 1 ? person.id === group.organizer_participant_id : version === 2 ? Boolean(person.verified_at) : true;
        round.participants.push(participantSchema.parse({
          ...person, position, reveal_consent_at: person.reveal_consent_at ?? null,
          token: keepToken ? person.token : null, token_source: keepToken ? person.token_source : null,
          claimed_at: keepToken ? person.claimed_at : null,
        }));
      }
      round.exclusions = db.prepare('SELECT * FROM exclusions WHERE group_id = ? ORDER BY rowid').all(group.id).map((e) => exclusionSchema.parse(e));
      round.wishes = db.prepare(
        'SELECT w.* FROM wishes w JOIN participants p ON p.id = w.participant_id WHERE p.group_id = ? ORDER BY w.created_at, w.rowid',
      ).all(group.id).map((w) => wishSchema.parse(w));
      round.assignments = db.prepare('SELECT giver_id, receiver_id FROM assignments WHERE group_id = ? ORDER BY rowid').all(group.id).map((a) => assignmentSchema.parse(a));
      round.messages = db.prepare('SELECT * FROM messages WHERE group_id = ? ORDER BY created_at, rowid').all(group.id).map((m, index) =>
        messageSchema.parse({ ...m, sequence: index + 1 }));
      round.group.message_sequence = round.messages.length;
      result.push(round);
    }
    return result;
  } finally {
    db.close();
  }
}

export async function importSqlite(file: string, storage: Storage, apply = false) {
  const rounds = readSqliteRounds(file);
  // Preflight all IDs and links before writing any round; never merge or overwrite live data.
  for (const round of rounds) {
    if (await storage.read(round.group.id)) throw new Error('Import refused: a source round already exists in the target');
    const tokens: ['admin' | 'invite' | 'personal', string][] = [
      ['admin', round.group.admin_token], ['invite', round.group.invite_code],
      ...round.participants.flatMap((p): ['personal', string][] => p.token ? [['personal', p.token]] : []),
    ];
    for (const [kind, token] of tokens) {
      const existing = await storage.resolve(kind, token);
      if (existing && existing !== round.group.id) throw new Error('Import refused: a source link exists in another target round');
    }
  }
  if (apply) for (const round of rounds) await storage.create(round);
  return { rounds: rounds.length, participants: rounds.reduce((n, r) => n + r.participants.length, 0), applied: apply };
}
