import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { MemoryStorage, openStorage, type Storage } from '../src/storage';
import { TableServiceClient } from '@azure/data-tables';
import { runMaintenance } from '../src/maintenance';
import type { AdminView, ClaimResponse, CreateGroupResponse, InviteView, MeView, MessagesView } from '../../shared/types';

let db: Storage;
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

beforeEach(async () => {
  if (process.env.TEST_TABLE_STORAGE === 'true') {
    process.env.STORAGE_BACKEND = 'azurite';
    const suffix = Math.random().toString(36).slice(2);
    process.env.TABLE_ROUNDS = `Rounds${suffix}`;
    process.env.TABLE_LINKS = `Links${suffix}`;
    process.env.TABLE_RATES = `Rates${suffix}`;
    db = await openStorage();
  } else db = new MemoryStorage();
  app = createApp(db, { disableRateLimits: true });
});

afterEach(async () => {
  if (process.env.TEST_TABLE_STORAGE === 'true') {
    const service = TableServiceClient.fromConnectionString(process.env.AZURITE_CONNECTION_STRING ?? 'UseDevelopmentStorage=true', { allowInsecureConnection: true });
    for (const name of [process.env.TABLE_ROUNDS, process.env.TABLE_LINKS, process.env.TABLE_RATES]) {
      if (name) await service.deleteTable(name);
    }
  }
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

async function claimPerson(invite: string, participantId: string) {
  const request = await call<ClaimResponse>('POST', `${invite}/claim`, { participantId });
  expect(request.status).toBe(201);
  expect(request.data.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
  return request.data.token;
}

async function claimAll(view: AdminView) {
  const tokens = new Map<string, string>();
  for (const p of view.participants.filter((p) => !p.claimed)) {
    tokens.set(p.name, await claimPerson(`/api/invite/${view.group.inviteCode}`, p.id));
  }
  return tokens;
}

async function consentAndReveal(admin: string, tokens: Iterable<string>) {
  for (const token of tokens) {
    expect((await call('POST', `/api/me/${token}/reveal-consent`, { consent: true })).status).toBe(200);
  }
  expect((await call('POST', `${admin}/reveal`, { revealed: true })).status).toBe(200);
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

    const lisaToken = await claimPerson(invite, id('Lisa'));
    const again = await call('POST', `${invite}/claim`, { participantId: id('Lisa') });
    expect(again.status).toBe(409);
    expect(again.data.error).toBe('already-claimed');

    const tokens = new Map<string, string>([['Mama', organizerToken], ['Lisa', lisaToken]]);
    for (const name of ['Papa', 'Thomas', 'Oma', 'Opa', 'Anna']) {
      tokens.set(name, await claimPerson(invite, id(name)));
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
    await consentAndReveal(admin, tokens.values());
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
    await claimAll(view);
    const res = await call('POST', `${admin}/draw`);
    expect(res.status).toBe(422);
    expect(res.data.error).toBe('impossible');
    expect(res.data.message).toMatch(/geht die Auslosung nicht auf/);
  });

  it('immediately grants access to the first claimant and never discloses their token in group views', async () => {
    const { admin, view, id } = await setupFamily();
    const invite = `/api/invite/${view.group.inviteCode}`;
    expect((await call('POST', `${admin}/draw`)).data.error).toBe('unclaimed-participants');
    const token = await claimPerson(invite, id('Oma'));
    expect((await call<MeView>('GET', `/api/me/${token}`)).data.me.name).toBe('Oma');
    expect((await call('POST', `/api/me/${token}/wishes`, { text: 'Ein Buch' })).status).toBe(201);
    const again = await call('POST', `${invite}/claim`, { participantId: id('Oma') });
    expect(again.status).toBe(409);
    expect(again.data.error).toBe('already-claimed');
    expect(again.data.token).toBeUndefined();
    expect((await call<InviteView>('GET', invite)).data.participants.find((p) => p.id === id('Oma'))!.claimed).toBe(true);
    for (const path of [admin, invite]) {
      const body = JSON.stringify((await call('GET', path)).data);
      expect(body).not.toContain(token);
    }
    expect((await call('GET', `/api/me/${id('Oma')}`)).status).toBe(404);
    expect((await call('GET', `/api/me/${view.group.inviteCode}`)).status).toBe(404);
    expect((await call<MeView>('GET', `/api/me/${token}`)).data.me.wishes[0].text).toBe('Ein Buch');
  });

  it('grants exactly one link when requests race for the same name', async () => {
    const { view, id } = await setupFamily();
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      call('POST', `/api/invite/${view.group.inviteCode}/claim`, { participantId: id('Lisa') }),
    ));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    const token = results.find((r) => r.status === 201)!.data.token;
    expect((await call<MeView>('GET', `/api/me/${token}`)).data.me.name).toBe('Lisa');
    for (const result of results.filter((r) => r.status === 409)) expect(result.data.token).toBeUndefined();
  });

  it('never lets the organizer read or reset links, only replace them through reissue-link', async () => {
    const { admin, view, id } = await setupFamily();
    const tokens = await claimAll(view);
    expect(new Set(tokens.values()).size).toBe(tokens.size);
    for (const afterDraw of [false, true]) {
      if (afterDraw) expect((await call('POST', `${admin}/draw`)).status).toBe(200);
      for (const name of ['Oma', 'Mama']) {
        for (const action of ['link', 'unclaim', 'verify']) {
          expect((await call('POST', `${admin}/participants/${id(name)}/${action}`)).status).toBe(404);
        }
      }
      const adminBody = JSON.stringify((await call('GET', admin)).data);
      for (const token of tokens.values()) expect(adminBody).not.toContain(token);
      expect((await call<MeView>('GET', `/api/me/${tokens.get('Oma')}`)).data.me.name).toBe('Oma');
    }
    const invite = `/api/invite/${view.group.inviteCode}`;
    expect((await call('POST', `${invite}/claim`, { participantId: id('Oma') })).data.error).toBe('already-drawn');
    expect((await call('POST', `${admin}/draw/reset`)).status).toBe(200);
    expect((await call('POST', `${invite}/claim`, { participantId: id('Oma') })).data.error).toBe('already-claimed');
    expect((await call<MeView>('GET', `/api/me/${tokens.get('Oma')}`)).data.recipient).toBeNull();
  });

  it('lets the organizer replace a lost link, invalidating the old one and telling the person', async () => {
    const { admin, view, id, organizerToken } = await setupFamily();
    const invite = `/api/invite/${view.group.inviteCode}`;
    const unclaimed = await call('POST', `${admin}/participants/${id('Oma')}/reissue-link`);
    expect(unclaimed.status).toBe(409);
    expect(unclaimed.data.error).toBe('not-claimed');
    expect(unclaimed.data.token).toBeUndefined();

    const tokens = await claimAll(view);
    const old = tokens.get('Oma')!;
    expect((await call('POST', `/api/me/${old}/wishes`, { text: 'Ein Buch' })).status).toBe(201);
    expect((await call('POST', `${admin}/draw`)).status).toBe(200);
    const before = (await call<MeView>('GET', `/api/me/${old}`)).data;
    expect(before.me.linkReissuedAt).toBeNull();
    expect((await call('POST', `/api/me/${old}/reveal-consent`, { consent: true })).status).toBe(200);

    expect((await call('POST', `/api/admin/not-a-real-admin-token/participants/${id('Oma')}/reissue-link`)).status).toBe(404);
    expect((await call('POST', `${admin}/participants/missing/reissue-link`)).status).toBe(404);
    const reissued = await call<ClaimResponse>('POST', `${admin}/participants/${id('Oma')}/reissue-link`);
    expect(reissued.status).toBe(201);
    const fresh = reissued.data.token;
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(fresh).not.toBe(old);

    expect((await call('GET', `/api/me/${old}`)).status).toBe(404);
    const after = (await call<MeView>('GET', `/api/me/${fresh}`)).data;
    expect(after.me.name).toBe('Oma');
    expect(after.me.linkReissuedAt).toBeTruthy();
    expect(after.me.wishes[0].text).toBe('Ein Buch');
    expect(after.me.revealConsent).toBe(false);
    expect(after.recipient?.name).toBe(before.recipient?.name);
    expect((await call('POST', `/api/me/${fresh}/reveal-consent`, { consent: true })).data.error).toBe('reissued-link');
    expect((await call('POST', `/api/me/${fresh}/reveal-consent`, { consent: false })).status).toBe(200);

    const adminView = (await call<AdminView>('GET', admin)).data;
    expect(adminView.participants.find((p) => p.name === 'Oma')!.linkReissuedAt).toBe(after.me.linkReissuedAt);
    expect(adminView.revealConsentCount).toBe(0);
    for (const path of [admin, invite]) expect(JSON.stringify((await call('GET', path)).data)).not.toContain(fresh);
    expect((await call<MeView>('GET', `/api/me/${tokens.get('Lisa')}`)).data.me.linkReissuedAt).toBeNull();
    expect((await call<MeView>('GET', `/api/me/${organizerToken}`)).data.me.name).toBe('Mama');
    expect((await call('POST', `${invite}/claim`, { participantId: id('Oma') })).data.error).toBe('already-drawn');
  });

  it('scopes claims to their group and rate-limits repeated attempts', async () => {
    const family = await setupFamily();
    const other = await setupFamily();
    const invite = `/api/invite/${family.view.group.inviteCode}`;
    expect((await call('POST', `${invite}/claim`, { participantId: other.id('Oma') })).status).toBe(404);
    app = createApp(db);
    const token = await claimPerson(invite, family.id('Oma'));
    for (let i = 1; i < 30; i++) {
      expect((await call('POST', `${invite}/claim`, { participantId: family.id('Oma') })).status).toBe(409);
    }
    expect((await call('POST', `${invite}/claim`, { participantId: family.id('Opa') })).status).toBe(429);
    expect((await call('GET', `/api/me/${token}`)).status).toBe(200);
  });

  it('supports self-join until the draw', async () => {
    const { admin, view } = await setupFamily();
    const invite = `/api/invite/${view.group.inviteCode}`;
    const joined = await call<ClaimResponse>('POST', `${invite}/join`, { name: 'Cousine Mia' });
    expect(joined.status).toBe(201);
    expect((await call<MeView>('GET', `/api/me/${joined.data.token}`)).data.me.name).toBe('Cousine Mia');
    expect((await call('POST', `${invite}/join`, { name: 'cousine mia' })).status).toBe(409);
    const updated = (await call<AdminView>('GET', admin)).data;
    const mia = updated.participants.find((p) => p.name === 'Cousine Mia')!;
    expect(mia.claimed).toBe(true);
    await claimAll(view);
    expect((await call('POST', `${admin}/draw`)).status).toBe(200);
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
      tokens.set(p.name, await claimPerson(invite, id(p.name)));
    }
    await call('POST', `${admin}/exclusions`, { giverId: id('Lisa'), receiverId: id('Thomas'), both: true });
    await call('POST', `${admin}/draw`);
    const lastYear = new Map<string, string>();
    for (const [name, token] of tokens) lastYear.set(name, (await call<MeView>('GET', `/api/me/${token}`)).data.recipient!.name);

    expect((await call('POST', `${admin}/next-round`, { name: 'Too early' })).data.error).toBe('reveal-required');
    await consentAndReveal(admin, tokens.values());
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

    await claimAll(nextView);
    const drawn = await call('POST', `/api/admin/${next.data.adminToken}/draw`);
    expect(drawn.status).toBe(200);
  });

  it('requires unanimous revocable consent and resets consent for every new draw', async () => {
    const { admin, view, organizerToken } = await setupFamily();
    const tokens = [...(await claimAll(view)).values(), organizerToken];
    expect((await call('POST', `/api/me/${organizerToken}/reveal-consent`, { consent: true })).data.error).toBe('not-drawn');
    expect((await call('POST', `${admin}/draw`)).status).toBe(200);
    expect((await call('POST', `${admin}/reveal`, { revealed: true })).data.error).toBe('consent-required');
    for (const token of tokens.slice(1)) {
      await call('POST', `/api/me/${token}/reveal-consent`, { consent: true });
    }
    expect((await call('POST', `${admin}/reveal`, { revealed: true })).data.error).toBe('consent-required');
    await call('POST', `/api/me/${tokens[0]}/reveal-consent`, { consent: true });
    await call('POST', `/api/me/${tokens[0]}/reveal-consent`, { consent: false });
    expect((await call('POST', `${admin}/reveal`, { revealed: true })).data.error).toBe('consent-required');
    expect((await call<AdminView>('GET', admin)).data.revealConsentCount).toBe(6);
    expect((await call<AdminView>('GET', admin)).data.reveal).toBeUndefined();
    expect((await call<MeView>('GET', `/api/me/${organizerToken}`)).data.reveal).toBeUndefined();
    await consentAndReveal(admin, tokens);
    expect((await call<AdminView>('GET', admin)).data.reveal).toHaveLength(7);
    expect((await call('POST', `${admin}/reveal`, { revealed: false })).data.error).toBe('already-revealed');
    expect((await call('POST', `/api/me/${tokens[0]}/reveal-consent`, { consent: false })).data.error).toBe('already-revealed');
    await call('POST', `${admin}/draw/reset`);
    await call('POST', `${admin}/draw`);
    expect((await call<AdminView>('GET', admin)).data.revealConsentCount).toBe(0);
    expect((await call('POST', `${admin}/reveal`, { revealed: true })).data.error).toBe('consent-required');
    expect((await call('POST', `${admin}/next-round`, { name: 'Still secret' })).data.error).toBe('reveal-required');
  });

  it('purges personal content after Christmas and deletes old rounds', async () => {
    const { organizerToken, admin } = await setupFamily();
    await call('POST', `/api/me/${organizerToken}/wishes`, { text: 'Socken' });
    await call('PATCH', `/api/me/${organizerToken}`, { about: 'Ich mag Tee' });
    expect(await runMaintenance(db, '2026-01-10', { purgeContentDays: 60, deleteGroupDays: 400 })).toEqual({ purged: 0, deleted: 0 });
    expect(await runMaintenance(db, '2026-03-01', { purgeContentDays: 60, deleteGroupDays: 400 })).toEqual({ purged: 1, deleted: 0 });
    const me = (await call<MeView>('GET', `/api/me/${organizerToken}`)).data;
    expect(me.me.wishes).toEqual([]);
    expect(me.me.about).toBe('');
    expect(await runMaintenance(db, '2027-02-01', { purgeContentDays: 60, deleteGroupDays: 400 })).toEqual({ purged: 0, deleted: 1 });
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
