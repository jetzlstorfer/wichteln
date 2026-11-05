import { createHash } from 'node:crypto';
import { TableClient, TableServiceClient, odata, type TableEntityResult, type TransactionAction } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import { z } from 'zod';
import { HttpError, newId, nowIso } from './util';

export const groupSchema = z.object({
  id: z.string(), admin_token: z.string(), invite_code: z.string(), name: z.string(),
  organizer_name: z.string(), organizer_participant_id: z.string().nullable(),
  budget: z.number().nullable(), exchange_date: z.string().nullable(), message: z.string(),
  allow_self_join: z.number(), drawn_at: z.string().nullable(), revealed_at: z.string().nullable(),
  previous_group_id: z.string().nullable(), content_purged_at: z.string().nullable(),
  created_at: z.string(), updated_at: z.string(),
  draw_version: z.string(), content_version: z.string(), message_sequence: z.number(),
  deleted: z.boolean().default(false),
});
export const participantSchema = z.object({
  id: z.string(), group_id: z.string(), name: z.string(), token: z.string().nullable(),
  token_source: z.enum(['self', 'organizer']).nullable(), claimed_at: z.string().nullable(),
  reveal_consent_at: z.string().nullable(), last_seen_at: z.string().nullable(),
  reveal_seen_at: z.string().nullable(), partner_id: z.string().nullable(), about: z.string(),
  gift_status: z.number(), opened_doors: z.string(), created_at: z.string(),
  recipient_read_sequence: z.number().default(0), christkind_read_sequence: z.number().default(0),
  position: z.number().default(0),
});
export const exclusionSchema = z.object({
  id: z.string(), group_id: z.string(), giver_id: z.string(), receiver_id: z.string(),
  reason: z.enum(['custom', 'lastyear']),
});
export const wishSchema = z.object({
  id: z.string(), participant_id: z.string(), text: z.string(), url: z.string().nullable(), created_at: z.string(),
});
export const assignmentSchema = z.object({ giver_id: z.string(), receiver_id: z.string() });
export const messageSchema = z.object({
  id: z.string(), group_id: z.string(), giver_id: z.string(), receiver_id: z.string(),
  from_giver: z.number(), body: z.string(), created_at: z.string(), read_at: z.string().nullable(),
  sequence: z.number(),
});

export type GroupRow = z.infer<typeof groupSchema>;
export type ParticipantRow = z.infer<typeof participantSchema>;
export type ExclusionRow = z.infer<typeof exclusionSchema>;
export type WishRow = z.infer<typeof wishSchema>;
export type MessageRow = z.infer<typeof messageSchema>;
export interface Round {
  group: GroupRow;
  participants: ParticipantRow[];
  exclusions: ExclusionRow[];
  wishes: WishRow[];
  assignments: z.infer<typeof assignmentSchema>[];
  messages: MessageRow[];
}
export type LinkKind = 'admin' | 'invite' | 'personal';

export interface Storage {
  resolve(kind: LinkKind, token: string): Promise<string | undefined>;
  read(id: string): Promise<Round | undefined>;
  create(round: Round): Promise<void>;
  /** The callback can be retried; it must not perform external side effects. */
  transact<T>(id: string, change: (round: Round) => T): Promise<T>;
  rounds(): AsyncIterable<Round>;
  check(): Promise<void>;
  checkRate(key: string, max: number, windowMs: number, now?: number): Promise<boolean>;
  sweep(): Promise<void>;
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const linkKey = (kind: LinkKind, token: string) => hash(`${kind}:${token}`);
const notFound = () => new HttpError(404, 'not-found', 'Diese Wichtel-Runde gibt es nicht (mehr).');
const busy = () => new HttpError(409, 'concurrent-update', 'Die Runde wurde gleichzeitig geändert. Bitte versuche es nochmal.');
const pause = (attempt: number) => new Promise((resolve) => setTimeout(resolve, Math.min(100, attempt * 5) + Math.random() * 20));
const status = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode : undefined;
const conflict = (error: unknown) => status(error) === 409 || status(error) === 412;
const serviceErrorSchema = z.object({
  code: z.string().optional(),
  response: z.object({ parsedBody: z.object({ odataError: z.object({ code: z.string() }).optional() }).optional() }).optional(),
});
const missingEntity = (error: unknown) => {
  const parsed = serviceErrorSchema.safeParse(error);
  const code = parsed.success ? parsed.data.response?.parsedBody?.odataError?.code ?? parsed.data.code : undefined;
  return status(error) === 404 && (code === 'ResourceNotFound' || code === 'EntityNotFound');
};
const storedEntitySchema = z.object({ partitionKey: z.string(), rowKey: z.string(), etag: z.string(), json: z.string() });
type StoredEntity = z.infer<typeof storedEntitySchema>;
const keysOf = (entity: TableEntityResult<object>) => z.object({ partitionKey: z.string(), rowKey: z.string(), etag: z.string() }).parse(entity);

function links(round: Round): [LinkKind, string][] {
  return [
    ['admin', round.group.admin_token],
    ['invite', round.group.invite_code],
    ...round.participants.flatMap((p): [LinkKind, string][] => p.token ? [['personal', p.token]] : []),
  ];
}

function records(round: Round): Map<string, string> {
  const result = new Map<string, string>([['group', JSON.stringify(round.group)], ['draw', JSON.stringify(round.assignments)]]);
  for (const p of round.participants) result.set(`p:${p.id}`, JSON.stringify(p));
  for (const e of round.exclusions) result.set(`e:${e.id}`, JSON.stringify(e));
  for (const w of round.wishes) result.set(`w:${round.group.content_version}:${w.id}`, JSON.stringify(w));
  for (const m of round.messages) result.set(`m:${round.group.draw_version}:${round.group.content_version}:${m.id}`, JSON.stringify(m));
  return result;
}

function decode(entities: StoredEntity[]): Round | undefined {
  const root = entities.find((e) => e.rowKey === 'group');
  if (!root) return undefined;
  const group = groupSchema.parse(JSON.parse(root.json));
  const round: Round = { group, participants: [], exclusions: [], wishes: [], assignments: [], messages: [] };
  for (const e of entities) {
    if (e.rowKey.startsWith('p:')) round.participants.push(participantSchema.parse(JSON.parse(e.json)));
    else if (e.rowKey.startsWith('e:')) round.exclusions.push(exclusionSchema.parse(JSON.parse(e.json)));
    else if (e.rowKey.startsWith(`w:${group.content_version}:`)) round.wishes.push(wishSchema.parse(JSON.parse(e.json)));
    else if (e.rowKey.startsWith(`m:${group.draw_version}:${group.content_version}:`)) round.messages.push(messageSchema.parse(JSON.parse(e.json)));
    else if (e.rowKey === 'draw') round.assignments = z.array(assignmentSchema).parse(JSON.parse(e.json));
  }
  const people = new Set(round.participants.map((p) => p.id));
  round.exclusions = round.exclusions.filter((e) => people.has(e.giver_id) && people.has(e.receiver_id));
  round.wishes = round.wishes.filter((w) => people.has(w.participant_id));
  round.messages = round.messages.filter((m) => people.has(m.giver_id) && people.has(m.receiver_id));
  round.participants.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  round.wishes.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  round.messages.sort((a, b) => a.sequence - b.sequence);
  return round;
}

export class TableStorage implements Storage {
  constructor(
    readonly roundTable: TableClient,
    readonly linkTable: TableClient,
    readonly rateTable: TableClient,
  ) {}

  private async get<T extends object>(client: TableClient, partition: string, key: string) {
    try {
      return await client.getEntity<T>(partition, key);
    } catch (error) {
      if (missingEntity(error)) return undefined;
      throw error;
    }
  }

  async resolve(kind: LinkKind, token: string) {
    return (await this.get<{ groupId: string }>(this.linkTable, 'links', linkKey(kind, token)))?.groupId;
  }

  private async index(round: Round, previous?: Round) {
    const known = new Set(previous ? links(previous).map(([kind, token]) => linkKey(kind, token)) : []);
    for (const [kind, token] of links(round)) {
      const rowKey = linkKey(kind, token);
      if (known.has(rowKey)) continue;
      const existing = await this.get<{ groupId: string }>(this.linkTable, 'links', rowKey);
      if (existing) {
        if (existing.groupId !== round.group.id) throw new Error('Link collision; import must not overwrite another round');
        continue;
      }
      try {
        await this.linkTable.createEntity({ partitionKey: 'links', rowKey, groupId: round.group.id, createdAt: nowIso() });
      } catch (error) {
        if (!conflict(error)) throw error;
        const winner = await this.get<{ groupId: string }>(this.linkTable, 'links', rowKey);
        if (winner?.groupId !== round.group.id) throw error;
      }
    }
  }

  private async snapshot(id: string) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const before = await this.get<{ json: string }>(this.roundTable, id, 'group');
      if (!before) return undefined;
      const entities: StoredEntity[] = [];
      for await (const entity of this.roundTable.listEntities<{ json: string }>({ queryOptions: { filter: odata`PartitionKey eq ${id}` } })) {
        entities.push(storedEntitySchema.parse(entity));
      }
      const after = await this.get<{ json: string }>(this.roundTable, id, 'group');
      if (before.etag && after?.etag === before.etag) {
        const round = decode(entities);
        if (!round) throw new Error('Round disappeared during snapshot');
        return { round, etag: before.etag, entities };
      }
      await pause(attempt);
    }
    throw busy();
  }

  async read(id: string) {
    const snapshot = await this.snapshot(id);
    return snapshot?.round.group.deleted ? undefined : snapshot?.round;
  }

  async create(round: Round) {
    if (await this.get(this.roundTable, round.group.id, 'group')) {
      throw new HttpError(409, 'round-exists', 'Diese Runde wurde bereits importiert.');
    }
    // A create-only marker prevents two imports from staging different data into the same partition.
    await this.roundTable.createEntity({ partitionKey: round.group.id, rowKey: 'staging', json: '{}', stagedAt: nowIso() });
    await this.index(round);
    const entities = [...records(round)].filter(([key]) => key !== 'group');
    // New partitions are invisible until the root is published, so large imports can be staged in batches.
    for (let start = 0; start < entities.length; start += 100) {
      await this.roundTable.submitTransaction(entities.slice(start, start + 100).map(([rowKey, json]): TransactionAction => [
        'create', { partitionKey: round.group.id, rowKey, json, stagedAt: nowIso() },
      ]));
    }
    await this.roundTable.createEntity({ partitionKey: round.group.id, rowKey: 'group', json: JSON.stringify(round.group) });
  }

  async transact<T>(id: string, change: (round: Round) => T): Promise<T> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const snapshot = await this.snapshot(id);
      if (!snapshot || snapshot.round.group.deleted) throw notFound();
      const before = records(snapshot.round);
      const next = structuredClone(snapshot.round);
      const result = change(next);
      next.group.updated_at = nowIso();
      const after = records(next);
      const actions: TransactionAction[] = [[
        'update', { partitionKey: id, rowKey: 'group', json: after.get('group')! }, 'Replace', { etag: snapshot.etag },
      ]];
      for (const [rowKey, json] of after) {
        if (rowKey !== 'group' && json !== before.get(rowKey)) {
          actions.push(['upsert', { partitionKey: id, rowKey, json }, 'Replace']);
        }
      }
      const people = new Set(next.participants.map((p) => p.id));
      for (const [rowKey, json] of before) {
        if (after.has(rowKey)) continue;
        // Epochs and removed participants invalidate bulk content atomically; the job physically removes it.
        if (rowKey.startsWith('m:') && (next.group.draw_version !== snapshot.round.group.draw_version ||
          next.group.content_version !== snapshot.round.group.content_version)) continue;
        if (rowKey.startsWith('w:') && next.group.content_version !== snapshot.round.group.content_version) continue;
        if (rowKey.startsWith('w:') && !people.has(wishSchema.parse(JSON.parse(json)).participant_id)) continue;
        if (rowKey.startsWith('e:')) {
          const e = exclusionSchema.parse(JSON.parse(json));
          if (!people.has(e.giver_id) || !people.has(e.receiver_id)) continue;
        }
        actions.push(['delete', { partitionKey: id, rowKey }]);
      }
      if (actions.length > 100) throw new Error('Mutation exceeds the Table Storage transaction limit');
      await this.index(next, snapshot.round);
      try {
        await this.roundTable.submitTransaction(actions);
        return result;
      } catch (error) {
        if (!conflict(error)) throw error;
        await pause(attempt);
      }
    }
    throw busy();
  }

  async *rounds() {
    for await (const entity of this.roundTable.listEntities({ queryOptions: { filter: "RowKey eq 'group'", select: ['PartitionKey'] } })) {
      const round = await this.read(z.string().parse(entity.partitionKey));
      if (round) yield round;
    }
  }

  async check() {
    for (const client of [this.roundTable, this.linkTable, this.rateTable]) {
      // Unlike an absent-entity 404, a missing table must fail readiness.
      await client.listEntities({ queryOptions: {
        filter: "PartitionKey eq 'health' and RowKey eq 'health'", select: ['PartitionKey'],
      } }).next();
    }
  }

  async checkRate(key: string, max: number, windowMs: number, now = Date.now()) {
    const partitionKey = 'rates';
    const rowKey = hash(key);
    for (let attempt = 0; attempt < 30; attempt++) {
      const current = await this.get<{ count: number; resetAt: number }>(this.rateTable, partitionKey, rowKey);
      if (current && current.resetAt > now && current.count >= max) return false;
      const entity = {
        partitionKey, rowKey,
        count: !current || current.resetAt <= now ? 1 : current.count + 1,
        resetAt: !current || current.resetAt <= now ? now + windowMs : current.resetAt,
      };
      try {
        if (current) await this.rateTable.updateEntity(entity, 'Replace', { etag: current.etag });
        else await this.rateTable.createEntity(entity);
        return true;
      } catch (error) {
        if (!conflict(error)) throw error;
        await pause(attempt);
      }
    }
    throw busy();
  }

  async sweep() {
    const partitions = new Set<string>();
    for await (const entity of this.roundTable.listEntities({ queryOptions: { select: ['PartitionKey'] } })) partitions.add(z.string().parse(entity.partitionKey));
    for (const id of partitions) {
      const snapshot = await this.snapshot(id);
      let entities = snapshot?.entities;
      if (!entities) {
        entities = [];
        for await (const entity of this.roundTable.listEntities<{ json: string; stagedAt: string }>({ queryOptions: { filter: odata`PartitionKey eq ${id}` } })) {
          if (!entity.stagedAt || Date.parse(entity.stagedAt) > Date.now() - 24 * 60 * 60_000) continue;
          entities.push(storedEntitySchema.parse(entity));
        }
      }
      const keep = snapshot && !snapshot.round.group.deleted ? records(snapshot.round) : new Map<string, string>();
      for (const entity of entities) {
        if (keep.has(entity.rowKey)) continue;
        try {
          await this.roundTable.deleteEntity(id, entity.rowKey, { etag: entity.etag });
        } catch (error) {
          if (status(error) !== 404 && status(error) !== 412) throw error;
        }
      }
    }
    for await (const entity of this.linkTable.listEntities<{ groupId: string; createdAt: string }>()) {
      const snapshot = await this.snapshot(entity.groupId);
      const valid = snapshot && !snapshot.round.group.deleted &&
        links(snapshot.round).some(([kind, token]) => linkKey(kind, token) === entity.rowKey);
      if (valid || Date.parse(entity.createdAt) > Date.now() - 24 * 60 * 60_000) continue;
      try {
        const keys = keysOf(entity);
        await this.linkTable.deleteEntity(keys.partitionKey, keys.rowKey, { etag: keys.etag });
      } catch (error) {
        if (status(error) !== 404 && status(error) !== 412) throw error;
      }
    }
    for await (const entity of this.rateTable.listEntities<{ resetAt: number }>({ queryOptions: { filter: odata`resetAt lt ${Date.now()}` } })) {
      try {
        const keys = keysOf(entity);
        await this.rateTable.deleteEntity(keys.partitionKey, keys.rowKey, { etag: keys.etag });
      } catch (error) {
        if (status(error) !== 404 && status(error) !== 412) throw error;
      }
    }
  }
}

/** Test-only storage with serialized mutations and copy isolation matching the persistent contract. */
export class MemoryStorage implements Storage {
  private data = new Map<string, Round>();
  private rates = new Map<string, { count: number; resetAt: number }>();
  async resolve(kind: LinkKind, token: string) {
    for (const round of this.data.values()) if (!round.group.deleted && links(round).some(([k, t]) => k === kind && t === token)) return round.group.id;
  }
  async read(id: string) {
    const round = this.data.get(id);
    return round && !round.group.deleted ? structuredClone(round) : undefined;
  }
  async create(round: Round) {
    if (this.data.has(round.group.id)) throw new HttpError(409, 'round-exists', 'Diese Runde wurde bereits importiert.');
    this.data.set(round.group.id, structuredClone(round));
  }
  async transact<T>(id: string, change: (round: Round) => T) {
    const saved = this.data.get(id);
    if (!saved || saved.group.deleted) throw notFound();
    const next = structuredClone(saved);
    const result = change(next);
    next.group.updated_at = nowIso();
    this.data.set(id, structuredClone(next));
    return result;
  }
  async *rounds() {
    for (const round of this.data.values()) if (!round.group.deleted) yield structuredClone(round);
  }
  async check() {}
  async checkRate(key: string, max: number, windowMs: number, now = Date.now()) {
    let rate = this.rates.get(key);
    if (!rate || rate.resetAt <= now) {
      rate = { count: 0, resetAt: now + windowMs };
      this.rates.set(key, rate);
    }
    return ++rate.count <= max;
  }
  async sweep() {
    for (const [id, round] of this.data) if (round.group.deleted) this.data.delete(id);
    for (const [key, rate] of this.rates) if (rate.resetAt <= Date.now()) this.rates.delete(key);
  }
}

export async function openStorage(): Promise<TableStorage> {
  const backend = process.env.STORAGE_BACKEND ?? 'azurite';
  const names = [process.env.TABLE_ROUNDS ?? 'WichtelnRounds', process.env.TABLE_LINKS ?? 'WichtelnLinks', process.env.TABLE_RATES ?? 'WichtelnRates'];
  if (backend === 'azurite') {
    if (process.env.NODE_ENV === 'production') throw new Error('Production requires STORAGE_BACKEND=azure');
    const connection = process.env.AZURITE_CONNECTION_STRING ?? 'UseDevelopmentStorage=true';
    const clients = names.map((name) => TableClient.fromConnectionString(connection, name, { allowInsecureConnection: true }));
    const service = TableServiceClient.fromConnectionString(connection, { allowInsecureConnection: true });
    for (const name of names) await service.createTable(name);
    return new TableStorage(clients[0], clients[1], clients[2]);
  }
  if (backend !== 'azure' || !process.env.TABLE_ENDPOINT) throw new Error('Set STORAGE_BACKEND=azure and TABLE_ENDPOINT, or use azurite locally');
  const credential = new DefaultAzureCredential();
  const clients = names.map((name) => new TableClient(process.env.TABLE_ENDPOINT!, name, credential));
  return new TableStorage(clients[0], clients[1], clients[2]);
}

export function emptyRound(input: Pick<GroupRow, 'name' | 'organizer_name' | 'budget' | 'exchange_date' | 'message' | 'allow_self_join' | 'previous_group_id'>, tokens: { admin: string; invite: string }): Round {
  const now = nowIso();
  return {
    group: {
      ...input, id: newId(), admin_token: tokens.admin, invite_code: tokens.invite,
      organizer_participant_id: null, drawn_at: null, revealed_at: null, content_purged_at: null,
      created_at: now, updated_at: now, draw_version: newId(), content_version: newId(), message_sequence: 0, deleted: false,
    },
    participants: [], exclusions: [], wishes: [], assignments: [], messages: [],
  };
}
