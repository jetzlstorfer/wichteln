import { TableClient, TableServiceClient } from '@azure/data-tables';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { runMaintenance } from '../src/maintenance';
import { emptyRound, MemoryStorage, participantSchema, TableStorage, type Round, type Storage } from '../src/storage';
import { newAdminToken, newId, newInviteCode, newToken } from '../src/util';
import type { CreateGroupResponse, AdminView, MeView } from '../../shared/types';

let storage: Storage;
let tableNames: string[] = [];
let app: ReturnType<typeof createApp>;
const connection = process.env.AZURITE_CONNECTION_STRING ?? 'UseDevelopmentStorage=true';
const integration = process.env.TEST_TABLE_STORAGE === 'true';

beforeEach(async () => {
  if (integration) {
    const suffix = newId().replace(/[-_]/g, '');
    tableNames = [`Rounds${suffix}`, `Links${suffix}`, `Rates${suffix}`];
    const service = TableServiceClient.fromConnectionString(connection, { allowInsecureConnection: true });
    for (const name of tableNames) await service.createTable(name);
    storage = new TableStorage(...clients());
  } else storage = new MemoryStorage();
  app = createApp(storage, { disableRateLimits: true });
});
afterEach(async () => {
  if (integration) {
    const service = TableServiceClient.fromConnectionString(connection, { allowInsecureConnection: true });
    for (const name of tableNames) await service.deleteTable(name);
  }
});
function clients(): [TableClient, TableClient, TableClient] {
  return [
    TableClient.fromConnectionString(connection, tableNames[0], { allowInsecureConnection: true }),
    TableClient.fromConnectionString(connection, tableNames[1], { allowInsecureConnection: true }),
    TableClient.fromConnectionString(connection, tableNames[2], { allowInsecureConnection: true }),
  ];
}
async function request(method: string, url: string, body?: unknown) {
  return app.request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
function family(size = 3): Round {
  const round = emptyRound({
    name: 'Family', organizer_name: 'A', budget: null, exchange_date: '2026-12-24',
    message: '', allow_self_join: 1, previous_group_id: null,
  }, { admin: newAdminToken(), invite: newInviteCode() });
  for (let i = 0; i < size; i++) {
    round.participants.push({
      id: newId(), group_id: round.group.id, name: `Person ${i}`, token: newToken(), token_source: 'self',
      claimed_at: '2026-11-05', last_seen_at: null, reveal_consent_at: null, reveal_seen_at: null,
      partner_id: null, about: 'About me', gift_status: 0, opened_doors: '[]', created_at: '2026-11-05',
      recipient_read_sequence: 0, christkind_read_sequence: 0, position: i, link_reissued_at: null,
    });
  }
  round.group.organizer_participant_id = round.participants[0].id;
  return round;
}

describe('storage contract', () => {
  it.runIf(integration)('reports corrupt stored records as server failures, not invalid user input', async () => {
    if (!(storage instanceof TableStorage)) throw new Error('This test requires Table Storage');
    const round = family();
    await storage.create(round);
    await storage.roundTable.updateEntity({ partitionKey: round.group.id, rowKey: 'group', json: '{}' }, 'Replace');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await request('GET', `/api/admin/${round.group.admin_token}`)).status).toBe(500);
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it.runIf(integration)('fails readiness when a backing table is missing, without restarting a healthy process', async () => {
    const service = TableServiceClient.fromConnectionString(connection, { allowInsecureConnection: true });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await service.deleteTable(tableNames[2]);
    try {
      expect((await request('GET', '/api/health')).status).toBe(500);
      expect((await request('GET', '/api/live')).status).toBe(200);
      expect(log).toHaveBeenCalled();
    } finally {
      await service.createTable(tableNames[2]);
      log.mockRestore();
    }
  });

  it('rolls back rejected changes and never exposes mutable stored objects', async () => {
    const round = family();
    await storage.create(round);
    const read = (await storage.read(round.group.id))!;
    read.group.name = 'Changed outside transaction';
    expect((await storage.read(round.group.id))!.group.name).toBe('Family');
    await expect(storage.transact(round.group.id, (r) => {
      r.group.name = 'Must roll back'; throw new Error('Rejected');
    })).rejects.toThrow('Rejected');
    expect((await storage.read(round.group.id))!.group.name).toBe('Family');
    const returned = await storage.transact(round.group.id, (r) => r);
    returned.group.name = 'Changed transaction return value';
    expect((await storage.read(round.group.id))!.group.name).toBe('Family');
  });

  it('keeps all 60 people, large rule sets and bulk cleanup within atomic batch limits', async () => {
    const round = family(60);
    for (const p of round.participants) {
      for (let i = 0; i < 20; i++) round.wishes.push({
        id: newId(), participant_id: p.id, text: 'Wish', url: null, created_at: '2026-11-05',
      });
    }
    // Removing one participant must not need to delete 118 rules and 20 wishes in the root transaction.
    for (const p of round.participants.slice(1)) {
      for (const [giver_id, receiver_id] of [[p.id, round.participants[0].id], [round.participants[0].id, p.id]]) {
        round.exclusions.push({ id: newId(), group_id: round.group.id, giver_id, receiver_id, reason: 'custom' });
      }
    }
    await storage.create(round);
    expect((await storage.read(round.group.id))!.wishes).toHaveLength(1200);
    const admin = `/api/admin/${round.group.admin_token}`;
    expect((await request('DELETE', `${admin}/participants/${round.participants[0].id}`)).status).toBe(200);
    const removed = (await storage.read(round.group.id))!;
    expect(removed.participants).toHaveLength(59);
    expect(removed.exclusions).toHaveLength(0);
    expect(removed.wishes).toHaveLength(1180);
    expect((await request('POST', `${admin}/draw`)).status).toBe(200);
    expect((await storage.read(round.group.id))!.assignments).toHaveLength(59);
    expect(await runMaintenance(storage, '2027-03-01')).toEqual({ purged: 1, deleted: 0 });
    expect((await storage.read(round.group.id))!.wishes).toEqual([]);
    expect((await storage.read(round.group.id))!.participants.every((p) => p.about === '')).toBe(true);
    if (storage instanceof TableStorage) {
      const entities = [];
      for await (const e of storage.roundTable.listEntities()) entities.push(e);
      expect(entities.some((e) => e.rowKey?.startsWith('w:') || e.rowKey?.startsWith('e:'))).toBe(false);
    }
  });

  it('reads and resets more than 100 messages atomically without clearing newly written content', async () => {
    const round = family();
    round.group.drawn_at = '2026-11-05';
    round.assignments = round.participants.map((p, i) => ({ giver_id: p.id, receiver_id: round.participants[(i + 1) % 3].id }));
    for (let i = 1; i <= 120; i++) {
      round.messages.push({
        id: newId(), group_id: round.group.id, ...round.assignments[0], from_giver: 1, body: `Question ${i}`,
        created_at: '2026-11-05', read_at: null, sequence: i,
      });
    }
    round.group.message_sequence = 120;
    await storage.create(round);
    const token = round.participants[1].token!;
    const initial = await (await request('GET', `/api/me/${token}`)).json() as MeView;
    expect(initial.unread.fromChristkind).toBe(120);
    expect((await request('GET', `/api/me/${token}/messages`)).status).toBe(200);
    const read = await (await request('GET', `/api/me/${token}`)).json() as MeView;
    expect(read.unread.fromChristkind).toBe(0);
    const giverToken = round.participants[0].token!;
    expect((await request('POST', `/api/me/${giverToken}/messages`, { to: 'recipient', body: 'New question' })).status).toBe(201);
    const next = await (await request('GET', `/api/me/${token}`)).json() as MeView;
    expect(next.unread.fromChristkind).toBe(1);
    const admin = `/api/admin/${round.group.admin_token}`;
    expect((await request('POST', `${admin}/draw/reset`)).status).toBe(200);
    expect((await storage.read(round.group.id))!.messages).toHaveLength(0);
    expect((await request('POST', `${admin}/draw`)).status).toBe(200);
    expect((await request('POST', `/api/me/${giverToken}/messages`, { to: 'recipient', body: 'New draw' })).status).toBe(201);
    await storage.sweep();
    expect((await storage.read(round.group.id))!.messages.map((m) => m.body)).toEqual(['New draw']);
  });

  it('atomically rejects concurrent duplicate joins and enforces capacity', async () => {
    const round = family(59);
    await storage.create(round);
    const joined = await Promise.all(Array.from({ length: 8 }, () =>
      request('POST', `/api/invite/${round.group.invite_code}/join`, { name: 'Last person' })));
    expect(joined.filter((r) => r.status === 201)).toHaveLength(1);
    expect(joined.filter((r) => r.status === 409 || r.status === 422)).toHaveLength(7);
    expect((await storage.read(round.group.id))!.participants).toHaveLength(60);
  });

  it('prevents concurrent draws and rejects orphan lookup records as authorization', async () => {
    const round = family();
    await storage.create(round);
    const admin = `/api/admin/${round.group.admin_token}`;
    const draws = await Promise.all(Array.from({ length: 5 }, () => request('POST', `${admin}/draw`)));
    expect(draws.filter((r) => r.status === 200)).toHaveLength(1);
    expect(draws.filter((r) => r.status === 409)).toHaveLength(4);
    if (storage instanceof TableStorage) {
      const { createHash } = await import('node:crypto');
      const token = newToken();
      await storage.linkTable.createEntity({
        partitionKey: 'links', rowKey: createHash('sha256').update(`personal:${token}`).digest('hex'),
        groupId: round.group.id, createdAt: new Date().toISOString(),
      });
      expect((await request('GET', `/api/me/${token}`)).status).toBe(404);
    }
    expect((await request('DELETE', admin)).status).toBe(200);
    expect((await request('GET', admin)).status).toBe(404);
    expect((await request('GET', `/api/me/${round.participants[0].token}`)).status).toBe(404);
    await storage.sweep();
    expect(await storage.read(round.group.id)).toBeUndefined();
  });

  it('enforces distributed rate limits and expiry even after creating a fresh storage client', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => storage.checkRate('test-key', 5, 60_000, 1000)));
    expect(results.filter(Boolean)).toHaveLength(5);
    const fresh = integration ? new TableStorage(...clients()) : storage;
    expect(await fresh.checkRate('test-key', 5, 60_000, 1001)).toBe(false);
    expect(await fresh.checkRate('test-key', 5, 60_000, 61_001)).toBe(true);
  });

  it('uses the rightmost ingress IP and exempts probes from persisted rate limits', async () => {
    app = createApp(storage, { trustProxy: true });
    for (let i = 0; i < 11; i++) {
      const response = await app.request('/api/groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `spoofed-${i}, 198.51.100.1` },
        body: JSON.stringify({ name: 'Family', organizerName: 'A' }),
      });
      expect(response.status).toBe(i < 10 ? 201 : 429);
    }
    const freshApp = createApp(storage, { trustProxy: true });
    expect((await freshApp.request('/api/live')).status).toBe(200);
    expect((await freshApp.request('/api/health')).status).toBe(200);
    const response = await freshApp.request('/api/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': 'different-spoof, 198.51.100.1' },
      body: JSON.stringify({ name: 'Family', organizerName: 'A' }),
    });
    expect(response.status).toBe(429);
  });

  it('persists the public API across completely fresh Table clients', async () => {
    const created = await (await request('POST', '/api/groups', { name: 'Family', organizerName: 'A' })).json() as CreateGroupResponse;
    if (integration) app = createApp(new TableStorage(...clients()), { disableRateLimits: true });
    const view = await (await request('GET', `/api/admin/${created.adminToken}`)).json() as AdminView;
    expect(view.group.name).toBe('Family');
    expect(view.participants).toHaveLength(1);
  });

  it('keeps people saved before links could be re-issued working', async () => {
    const round = family();
    const legacy = round.participants.map((p) => {
      const copy: Partial<typeof p> = { ...p };
      delete copy.link_reissued_at;
      return copy;
    });
    expect(legacy.map((p) => participantSchema.parse(p).link_reissued_at)).toEqual([null, null, null]);
    await storage.create(round);
    if (storage instanceof TableStorage) {
      for (const p of legacy) {
        await storage.roundTable.updateEntity({ partitionKey: round.group.id, rowKey: `p:${p.id}`, json: JSON.stringify(p) }, 'Merge');
      }
    }
    const admin = `/api/admin/${round.group.admin_token}`;
    const view = await (await request('GET', admin)).json() as AdminView;
    expect(view.participants.map((p) => p.linkReissuedAt)).toEqual([null, null, null]);
    const old = round.participants[1].token!;
    expect((await (await request('GET', `/api/me/${old}`)).json() as MeView).me.linkReissuedAt).toBeNull();
    const reissued = await request('POST', `${admin}/participants/${round.participants[1].id}/reissue-link`);
    expect(reissued.status).toBe(201);
    const { token } = await reissued.json() as { token: string };
    expect((await request('GET', `/api/me/${old}`)).status).toBe(404);
    expect((await (await request('GET', `/api/me/${token}`)).json() as MeView).me.linkReissuedAt).toBeTruthy();
    expect((await request('GET', `/api/me/${round.participants[2].token}`)).status).toBe(200);
  });
});
