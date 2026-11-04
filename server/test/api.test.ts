import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDatabase, type DB } from '../src/db';
import { runMaintenance } from '../src/maintenance';
import type { AdminView, CreateGroupResponse, InviteView, MeView, MessagesView } from '../../shared/types';

let db: DB;
let app: ReturnType<typeof createApp>;

async function call<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await app.request(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

beforeEach(() => {
  db = openDatabase(':memory:');
  app = createApp(db, { disableRateLimits: true });
});

afterEach(() => {
  db.close();
  delete process.env.FAKE_TODAY;
});

/** Creates a family round with Mama (organizer) + 6 people, two couples. */
async function setupFamily() {
  const created = await call<CreateGroupResponse>('POST', '/api/groups', {
    name: 'Familie Huber 2025',
    organizerName: 'Mama',
    budget: 30,
    exchangeDate: '2025-12-24',
    message: 'Bitte nichts Teures!',
  });
  expect(created.status).toBe(201);
  const { adminToken, participantToken } = created.data;
  expect(participantToken).toBeTruthy();
  const admin = `/api/admin/${adminToken}`;
  for (const name of ['Papa', 'Lisa', 'Thomas', 'Oma', 'Opa', 'Anna']) {
    expect((await call('POST', `${admin}/participants`, { name })).status).toBe(201);
  }
  let view = (await call<AdminView>('GET', admin)).data;
  const id = (name: string) => view.participants.find((p) => p.name === name)!.id;
  await call('PATCH', `${admin}/participants/${id('Mama')}`, { partnerId: id('Papa') });
  await call('PATCH', `${admin}/participants/${id('Oma')}`, { partnerId: id('Opa') });
  view = (await call<AdminView>('GET', admin)).data;
  return { adminToken, organizerToken: participantToken!, admin, view, id };
}

describe('API', () => {
  it('creates a round and links partners on both sides', async () => {
    const { view, id } = await setupFamily();
    expect(view.group.name).toBe('Familie Huber 2025');
    expect(view.participants).toHaveLength(7);
    const mama = view.participants.find((p) => p.name === 'Mama')!;
    const papa = view.participants.find((p) => p.name === 'Papa')!;
    expect(mama.isOrganizer).toBe(true);
    expect(mama.claimed).toBe(true);
    expect(mama.partnerId).toBe(id('Papa'));
    expect(papa.partnerId).toBe(id('Mama'));
  });

  it('rejects duplicate names and invalid input with German messages', async () => {
    const { admin } = await setupFamily();
    const dup = await call('POST', `${admin}/participants`, { name: 'lisa' });
    expect(dup.status).toBe(409);
    expect(dup.data.message).toContain('schon dabei');
    const empty = await call('POST', '/api/groups', { name: '', organizerName: 'X' });
    expect(empty.status).toBe(400);
    expect(empty.data.error).toBe('validation');
  });

  it('runs the full invite → claim → draw → chat flow while keeping the draw secret', async () => {
    const { admin, view, organizerToken, id } = await setupFamily();
    const invite = `/api/invite/${view.group.inviteCode}`;

    const inv = (await call<InviteView>('GET', invite)).data;
    expect(inv.participants.find((p) => p.name === 'Mama')!.claimed).toBe(true);
    expect(inv.participants.find((p) => p.name === 'Lisa')!.claimed).toBe(false);

    const lisaClaim = await call<{ token: string }>('POST', `${invite}/claim`, { participantId: id('Lisa') });
    expect(lisaClaim.status).toBe(200);
    const again = await call('POST', `${invite}/claim`, { participantId: id('Lisa') });
    expect(again.status).toBe(409);
    expect(again.data.error).toBe('already-claimed');

    const tokens = new Map<string, string>([['Mama', organizerToken], ['Lisa', lisaClaim.data.token]]);
    for (const name of ['Papa', 'Thomas', 'Oma', 'Opa', 'Anna']) {
      tokens.set(name, (await call('POST', `${invite}/claim`, { participantId: id(name) })).data.token);
    }

    const before = (await call<MeView>('GET', `/api/me/${tokens.get('Lisa')}`)).data;
    expect(before.recipient).toBeNull();

    const drawn = await call('POST', `${admin}/draw`);
    expect(drawn.status).toBe(200);

    // The organizer never sees the pairs before the Auflösung
    const adminView = await call<AdminView>('GET', admin);
    expect(adminView.data.reveal).toBeUndefined();
    expect(JSON.stringify(adminView.data)).not.toContain('receiver_id');

    const recipientOf = new Map<string, string>();
    for (const [name, token] of tokens) {
      const me = (await call<MeView>('GET', `/api/me/${token}`)).data;
      expect(me.recipient).not.toBeNull();
      recipientOf.set(name, me.recipient!.name);
      expect(me.recipient!.name).not.toBe(name);
      expect(JSON.stringify(me)).not.toContain('giver');
    }
    expect(recipientOf.get('Mama')).not.toBe('Papa');
    expect(recipientOf.get('Papa')).not.toBe('Mama');
    expect(recipientOf.get('Oma')).not.toBe('Opa');
    expect(recipientOf.get('Opa')).not.toBe('Oma');
    expect(new Set(recipientOf.values()).size).toBe(7);

    // Wish list is visible to the person drawing me
    const lisaToken = tokens.get('Lisa')!;
    const wish = await call('POST', `/api/me/${lisaToken}/wishes`, { text: 'Ein gutes Buch', url: 'buchhandlung.at/krimi' });
    expect(wish.status).toBe(201);
    expect(wish.data.url).toBe('https://buchhandlung.at/krimi');
    const bad = await call('POST', `/api/me/${lisaToken}/wishes`, { text: 'x', url: 'javascript:alert(1)' });
    expect(bad.status).toBe(400);
    const lisaGiverName = [...recipientOf].find(([, r]) => r === 'Lisa')![0];
    const giverView = (await call<MeView>('GET', `/api/me/${tokens.get(lisaGiverName)}`)).data;
    expect(giverView.recipient!.wishes.map((w) => w.text)).toEqual(['Ein gutes Buch']);

    // Anonymous Q&A: Lisa's Christkind asks, Lisa answers without knowing who asked
    const giverToken = tokens.get(lisaGiverName)!;
    expect((await call('POST', `/api/me/${giverToken}/messages`, { to: 'recipient', body: 'Welche Größe?' })).status).toBe(201);
    const lisaMe = (await call<MeView>('GET', `/api/me/${lisaToken}`)).data;
    expect(lisaMe.unread.fromChristkind).toBe(1);
    const lisaMsgs = (await call<MessagesView>('GET', `/api/me/${lisaToken}/messages`)).data;
    expect(lisaMsgs.christkind!.messages).toEqual([expect.objectContaining({ body: 'Welche Größe?', mine: false })]);
    expect(JSON.stringify(lisaMsgs.christkind)).not.toContain(lisaGiverName);
    expect((await call('POST', `/api/me/${lisaToken}/messages`, { to: 'christkind', body: 'M bitte!' })).status).toBe(201);
    const giverMsgs = (await call<MessagesView>('GET', `/api/me/${giverToken}/messages`)).data;
    expect(giverMsgs.recipient!.name).toBe('Lisa');
    expect(giverMsgs.recipient!.messages.map((m) => [m.body, m.mine])).toEqual([
      ['Welche Größe?', true],
      ['M bitte!', false],
    ]);
    expect((await call<MeView>('GET', `/api/me/${lisaToken}`)).data.unread.fromChristkind).toBe(0);

    // Rules are frozen after the draw, renaming is still fine
    expect((await call('POST', `${admin}/participants`, { name: 'Neu' })).status).toBe(409);
    expect((await call('PATCH', `${admin}/participants/${id('Anna')}`, { name: 'Anna-Lena' })).status).toBe(200);

    // Auflösung
    expect((await call('POST', `${admin}/reveal`, { revealed: true })).status).toBe(200);
    const revealed = (await call<AdminView>('GET', admin)).data.reveal!;
    expect(revealed).toHaveLength(7);
  });

  it('reports impossible rules with the names involved', async () => {
    const created = await call<CreateGroupResponse>('POST', '/api/groups', { name: 'Klein', organizerName: 'A' });
    const admin = `/api/admin/${created.data.adminToken}`;
    await call('POST', `${admin}/participants`, { name: 'B' });
    await call('POST', `${admin}/participants`, { name: 'C' });
    const view = (await call<AdminView>('GET', admin)).data;
    const [a, b] = view.participants;
    await call('PATCH', `${admin}/participants/${a.id}`, { partnerId: b.id });
    const res = await call('POST', `${admin}/draw`);
    expect(res.status).toBe(422);
    expect(res.data.error).toBe('impossible');
    expect(res.data.message).toMatch(/geht die Auslosung nicht auf/);
  });

  it('lets the organizer release a name and hand out a manual link', async () => {
    const { admin, view, id } = await setupFamily();
    const invite = `/api/invite/${view.group.inviteCode}`;
    const claim = await call<{ token: string }>('POST', `${invite}/claim`, { participantId: id('Oma') });
    expect((await call('POST', `${admin}/participants/${id('Oma')}/unclaim`)).status).toBe(200);
    expect((await call('GET', `/api/me/${claim.data.token}`)).status).toBe(404);
    const link = await call<{ token: string }>('POST', `${admin}/participants/${id('Oma')}/link`);
    expect((await call<MeView>('GET', `/api/me/${link.data.token}`)).data.me.name).toBe('Oma');
    const admView = (await call<AdminView>('GET', admin)).data;
    expect(admView.participants.find((p) => p.name === 'Oma')!.tokenSource).toBe('organizer');
  });

  it('supports self-join until the draw', async () => {
    const { admin, view } = await setupFamily();
    const invite = `/api/invite/${view.group.inviteCode}`;
    const joined = await call<{ token: string }>('POST', `${invite}/join`, { name: 'Cousine Mia' });
    expect(joined.status).toBe(201);
    expect((await call('POST', `${invite}/join`, { name: 'cousine mia' })).status).toBe(409);
    await call('POST', `${admin}/draw`);
    expect((await call('POST', `${invite}/join`, { name: 'Zu spät' })).status).toBe(409);
    expect((await call<InviteView>('GET', invite)).data.group.allowSelfJoin).toBe(false);
  });

  it('gates Advent doors by the Vienna date', async () => {
    const { organizerToken } = await setupFamily();
    const doors = `/api/me/${organizerToken}/doors`;
    process.env.FAKE_TODAY = '2025-11-30';
    expect((await call('POST', doors, { day: 1 })).status).toBe(409);
    process.env.FAKE_TODAY = '2025-12-05';
    expect((await call('POST', doors, { day: 5 })).data.openedDoors).toEqual([5]);
    expect((await call('POST', doors, { day: 6 })).status).toBe(409);
    process.env.FAKE_TODAY = '2026-01-02';
    expect((await call('POST', doors, { day: 24 })).data.openedDoors).toEqual([5, 24]);
  });

  it('starts next year with last year’s pairs excluded', async () => {
    const { admin, view, id, organizerToken } = await setupFamily();
    const invite = `/api/invite/${view.group.inviteCode}`;
    const tokens = new Map<string, string>([['Mama', organizerToken]]);
    for (const p of view.participants.filter((p) => !p.claimed)) {
      tokens.set(p.name, (await call('POST', `${invite}/claim`, { participantId: id(p.name) })).data.token);
    }
    await call('POST', `${admin}/exclusions`, { giverId: id('Lisa'), receiverId: id('Thomas'), both: true });
    await call('POST', `${admin}/draw`);
    const lastYear = new Map<string, string>();
    for (const [name, token] of tokens) lastYear.set(name, (await call<MeView>('GET', `/api/me/${token}`)).data.recipient!.name);

    const next = await call<CreateGroupResponse>('POST', `${admin}/next-round`, { name: 'Familie Huber 2026', exchangeDate: '2026-12-24' });
    expect(next.status).toBe(201);
    const nextView = (await call<AdminView>('GET', `/api/admin/${next.data.adminToken}`)).data;
    expect(nextView.group.hasPreviousRound).toBe(true);
    expect(nextView.group.drawn).toBe(false);
    expect(nextView.participants.map((p) => p.name).sort()).toEqual([...tokens.keys()].sort());
    expect(nextView.participants.filter((p) => p.claimed).map((p) => p.name)).toEqual(['Mama']);
    const nameOf = new Map(nextView.participants.map((p) => [p.id, p.name]));
    const lastyear = nextView.exclusions.filter((e) => e.reason === 'lastyear').map((e) => `${nameOf.get(e.giverId)}>${nameOf.get(e.receiverId)}`);
    expect(lastyear.sort()).toEqual([...lastYear].map(([g, r]) => `${g}>${r}`).sort());
    expect(nextView.exclusions.filter((e) => e.reason === 'custom')).toHaveLength(2);
    const mama = nextView.participants.find((p) => p.name === 'Mama')!;
    expect(nameOf.get(mama.partnerId!)).toBe('Papa');

    const drawn = await call('POST', `/api/admin/${next.data.adminToken}/draw`);
    expect(drawn.status).toBe(200);
  });

  it('purges personal content after Christmas and deletes old rounds', async () => {
    const { organizerToken, admin } = await setupFamily();
    await call('POST', `/api/me/${organizerToken}/wishes`, { text: 'Socken' });
    await call('PATCH', `/api/me/${organizerToken}`, { about: 'Ich mag Tee' });
    expect(runMaintenance(db, '2026-01-10', { purgeContentDays: 60, deleteGroupDays: 400 })).toEqual({ purged: 0, deleted: 0 });
    expect(runMaintenance(db, '2026-03-01', { purgeContentDays: 60, deleteGroupDays: 400 })).toEqual({ purged: 1, deleted: 0 });
    const me = (await call<MeView>('GET', `/api/me/${organizerToken}`)).data;
    expect(me.me.wishes).toEqual([]);
    expect(me.me.about).toBe('');
    expect(runMaintenance(db, '2027-02-01', { purgeContentDays: 60, deleteGroupDays: 400 })).toEqual({ purged: 0, deleted: 1 });
    expect((await call('GET', admin)).status).toBe(404);
  });

  it('serves a manifest whose start_url follows the installing page', async () => {
    const res = await app.request('/manifest.webmanifest?start=/w/abcdefghijkl');
    const manifest = (await res.json()) as { start_url: string };
    expect(manifest.start_url).toBe('/w/abcdefghijkl');
    const evil = (await (await app.request('/manifest.webmanifest?start=https://evil.example')).json()) as { start_url: string };
    expect(evil.start_url).toBe('/');
  });

  it('sets security headers and returns JSON 404s for unknown API routes', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect((await call('GET', '/api/admin/short')).status).toBe(404);
  });
});
