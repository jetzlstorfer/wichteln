import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { z, ZodError } from 'zod';
import { emptyRound, type Storage, type Round, type ParticipantRow, type LinkKind } from './storage';
import { draw, pairKey } from './draw';
import {
  HttpError, TOKEN_PATTERN, maxOpenableDoor, newAdminToken, newId, newInviteCode, newToken, nowIso, viennaToday,
} from './util';
import {
  LIMITS, type AdminView, type ChatMessage, type ClaimResponse, type CreateGroupResponse,
  type GiftStatus, type GroupInfo, type InviteView, type MeView, type MessagesView, type RevealPair, type Wish,
} from '../../shared/types';

export interface AppOptions {
  /** Only enable behind an ingress that replaces the forwarded client address. */
  trustProxy?: boolean;
  disableRateLimits?: boolean;
}

const cleanText = (max: number) => z.string().transform((s) => s.replace(/\r\n/g, '\n').trim()).pipe(z.string().max(max));
const personName = z.string().transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Bitte einen Namen eingeben.').max(LIMITS.personName));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Ungültiges Datum');
const budget = z.number().int().min(0).max(LIMITS.maxBudget).nullable();
const groupFields = z.object({
  name: cleanText(LIMITS.groupName).pipe(z.string().min(1, 'Bitte gib der Runde einen Namen.')),
  organizerName: personName, budget: budget.optional(), exchangeDate: isoDate.nullable().optional(),
  message: cleanText(LIMITS.message).optional(), allowSelfJoin: z.boolean().optional(),
});

class InputError extends Error {
  constructor(readonly validation: ZodError) { super('Invalid request input'); }
}

function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try { url = new URL(withProtocol); }
  catch { throw new HttpError(400, 'invalid-url', 'Dieser Link sieht nicht richtig aus.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
    throw new HttpError(400, 'invalid-url', 'Bitte nur normale Web-Links (https://…) verwenden.');
  }
  return url.toString();
}

async function readJson<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.output<T>> {
  let raw: unknown;
  try { raw = await c.req.json(); }
  catch { throw new HttpError(400, 'invalid-json', 'Ungültige Anfrage.'); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new InputError(parsed.error);
  return parsed.data;
}

function participantOf(round: Round, id: string): ParticipantRow {
  const p = round.participants.find((p) => p.id === id);
  if (!p) throw new HttpError(404, 'not-found', 'Diese Person gibt es in der Runde nicht.');
  return p;
}
function nameTaken(round: Round, name: string, exceptId?: string) {
  return round.participants.some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());
}
function ensureNotDrawn(round: Round) {
  if (round.group.drawn_at) throw new HttpError(409, 'already-drawn', 'Es wurde schon ausgelost. Setze die Auslosung zurück, um das zu ändern.');
}
function addParticipant(round: Round, name: string, token: string | null): ParticipantRow {
  if (round.participants.length >= LIMITS.participants) throw new HttpError(422, 'too-many', `Mehr als ${LIMITS.participants} Personen gehen leider nicht.`);
  if (nameTaken(round, name)) throw new HttpError(409, 'name-taken', `„${name}“ ist schon dabei.`);
  const now = nowIso();
  const person: ParticipantRow = {
    id: newId(), group_id: round.group.id, name, token, token_source: token ? 'self' : null,
    claimed_at: token ? now : null, reveal_consent_at: null, last_seen_at: null, reveal_seen_at: null,
    partner_id: null, about: '', gift_status: 0, opened_doors: '[]', created_at: now,
    recipient_read_sequence: 0, christkind_read_sequence: 0,
    position: Math.max(-1, ...round.participants.map((p) => p.position)) + 1, link_reissued_at: null,
  };
  round.participants.push(person);
  return person;
}
function wishesOf(round: Round, id: string): Wish[] {
  return round.wishes.filter((w) => w.participant_id === id).map((w) => ({ id: w.id, text: w.text, url: w.url }));
}
function groupInfo(round: Round): GroupInfo {
  const g = round.group;
  return {
    name: g.name, organizerName: g.organizer_name, budget: g.budget, exchangeDate: g.exchange_date,
    message: g.message, drawn: Boolean(g.drawn_at), revealed: Boolean(g.revealed_at), participantCount: round.participants.length,
  };
}
function revealPairs(round: Round): RevealPair[] {
  const nameOf = new Map(round.participants.map((p) => [p.id, p.name]));
  const next = new Map(round.assignments.map((a) => [a.giver_id, a.receiver_id]));
  const seen = new Set<string>();
  const result: RevealPair[] = [];
  for (const p of round.participants) {
    let current: string | undefined = p.id;
    while (current && next.has(current) && !seen.has(current)) {
      seen.add(current);
      const receiver: string = next.get(current)!;
      result.push({ giver: nameOf.get(current) ?? '?', receiver: nameOf.get(receiver) ?? '?' });
      current = receiver;
    }
  }
  return result;
}

export function createApp(storage: Storage, options: AppOptions = {}) {
  const app = new Hono();
  const limits = { general: [600, 5 * 60_000], create: [10, 60 * 60_000], claim: [30, 10 * 60_000], chat: [40, 10 * 60_000] } as const;
  const clientIp = (c: Context) => {
    if (options.trustProxy) {
      // ACA appends the verified ingress client IP after any caller-supplied entries.
      const forwarded = c.req.header('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean);
      if (forwarded?.length) return forwarded[forwarded.length - 1];
    }
    return (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress ?? 'unknown';
  };
  const limit = async (c: Context, kind: keyof typeof limits, key = clientIp(c)) => {
    if (options.disableRateLimits) return;
    const [max, window] = limits[kind];
    if (!await storage.checkRate(`${kind}:${key}`, max, window)) {
      throw new HttpError(429, 'rate-limited', 'Zu viele Anfragen – bitte kurz warten und nochmal probieren.');
    }
  };
  const validLink = (round: Round, kind: LinkKind, token: string) => {
    if (kind === 'admin') return round.group.admin_token === token;
    if (kind === 'invite') return round.group.invite_code === token;
    return round.participants.some((p) => p.token === token);
  };
  const linkId = async (kind: LinkKind, token: string) => {
    if (!TOKEN_PATTERN.test(token)) throw new HttpError(404, 'not-found', 'Dieser Link ist nicht (mehr) gültig.');
    const id = await storage.resolve(kind, token);
    if (!id) throw new HttpError(404, 'not-found', 'Dieser Link ist nicht (mehr) gültig.');
    return id;
  };
  const readLink = async (kind: LinkKind, token: string) => {
    const round = await storage.read(await linkId(kind, token));
    if (!round || !validLink(round, kind, token)) throw new HttpError(404, 'not-found', 'Dieser Link ist nicht (mehr) gültig.');
    return round;
  };
  const mutate = async <T>(kind: LinkKind, token: string, change: (round: Round) => T) =>
    storage.transact(await linkId(kind, token), (round) => {
      if (!validLink(round, kind, token)) throw new HttpError(404, 'not-found', 'Dieser Link ist nicht (mehr) gültig.');
      return change(round);
    });
  const meOf = (round: Round, token: string) => {
    const me = round.participants.find((p) => p.token === token);
    if (!me) throw new HttpError(404, 'not-found', 'Dieser persönliche Link ist nicht (mehr) gültig.');
    return me;
  };
  const assignmentFor = (round: Round, id: string) => round.assignments.find((a) => a.giver_id === id);
  const giverOf = (round: Round, id: string) => round.assignments.find((a) => a.receiver_id === id);

  app.use('*', secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'], fontSrc: ["'self'", 'data:'], connectSrc: ["'self'"],
      manifestSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
    },
    referrerPolicy: 'no-referrer', permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  }));
  app.use('/api/*', bodyLimit({ maxSize: 32 * 1024, onError: () => { throw new HttpError(413, 'too-large', 'Die Anfrage ist zu groß.'); } }));
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex, nofollow');
    if (c.req.path !== '/api/health' && c.req.path !== '/api/live') await limit(c, 'general');
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code, message: err.message, details: err.details }, err.status);
    if (err instanceof InputError) {
      const first = err.validation.issues[0];
      const message = first?.message && !first.message.startsWith('Invalid') && !first.message.startsWith('Too')
        ? first.message : 'Bitte überprüfe deine Eingaben.';
      return c.json({ error: 'validation', message, details: err.validation.issues.map((i) => ({ path: i.path, message: i.message })) }, 400);
    }
    // SDK errors can contain request URLs/credentials; log only a safe error category.
    console.error('[wichteln] request failed', err.name);
    return c.json({ error: 'internal', message: 'Da ist etwas schiefgegangen. Bitte später nochmal probieren.' }, 500);
  });
  app.get('/api/live', (c) => c.json({ ok: true }));
  app.get('/api/health', async (c) => { await storage.check(); return c.json({ ok: true }); });

  app.post('/api/groups', async (c) => {
    await limit(c, 'create');
    const body = await readJson(c, groupFields.extend({ participates: z.boolean().default(true) }));
    const round = emptyRound({
      name: body.name, organizer_name: body.organizerName, budget: body.budget ?? null,
      exchange_date: body.exchangeDate ?? null, message: body.message ?? '', allow_self_join: body.allowSelfJoin === false ? 0 : 1,
      previous_group_id: null,
    }, { admin: newAdminToken(), invite: newInviteCode() });
    const participantToken = body.participates ? newToken() : null;
    if (participantToken) round.group.organizer_participant_id = addParticipant(round, body.organizerName, participantToken).id;
    await storage.create(round);
    return c.json({ adminToken: round.group.admin_token, participantToken } satisfies CreateGroupResponse, 201);
  });

  app.get('/api/admin/:token', async (c) => {
    const round = await readLink('admin', c.req.param('token'));
    const g = round.group;
    const view: AdminView = {
      group: {
        ...groupInfo(round), id: g.id, inviteCode: g.invite_code, allowSelfJoin: Boolean(g.allow_self_join),
        drawnAt: g.drawn_at, createdAt: g.created_at, hasPreviousRound: Boolean(g.previous_group_id && await storage.read(g.previous_group_id)),
      },
      participants: round.participants.map((p) => ({
        id: p.id, name: p.name, claimed: Boolean(p.token), lastSeenAt: p.last_seen_at, revealSeen: Boolean(p.reveal_seen_at),
        partnerId: p.partner_id, wishCount: wishesOf(round, p.id).length, hasAbout: p.about.trim().length > 0,
        giftStatus: p.gift_status as GiftStatus, isOrganizer: p.id === g.organizer_participant_id, linkReissuedAt: p.link_reissued_at,
      })),
      exclusions: round.exclusions.map((e) => ({ id: e.id, giverId: e.giver_id, receiverId: e.receiver_id, reason: e.reason })),
      revealConsentCount: round.participants.filter((p) => p.reveal_consent_at).length, today: viennaToday(),
    };
    if (g.revealed_at) view.reveal = revealPairs(round);
    return c.json(view);
  });
  app.patch('/api/admin/:token', async (c) => {
    const body = await readJson(c, groupFields.partial());
    await mutate('admin', c.req.param('token'), ({ group: g }) => {
      g.name = body.name ?? g.name; g.organizer_name = body.organizerName ?? g.organizer_name;
      if (body.budget !== undefined) g.budget = body.budget;
      if (body.exchangeDate !== undefined) g.exchange_date = body.exchangeDate;
      g.message = body.message ?? g.message;
      if (body.allowSelfJoin !== undefined) g.allow_self_join = body.allowSelfJoin ? 1 : 0;
    });
    return c.json({ ok: true });
  });
  app.delete('/api/admin/:token', async (c) => {
    await mutate('admin', c.req.param('token'), (round) => { round.group.deleted = true; });
    return c.json({ ok: true });
  });
  app.post('/api/admin/:token/participants', async (c) => {
    const { name } = await readJson(c, z.object({ name: personName }));
    const id = await mutate('admin', c.req.param('token'), (round) => {
      ensureNotDrawn(round);
      return addParticipant(round, name, null).id;
    });
    return c.json({ id }, 201);
  });
  app.patch('/api/admin/:token/participants/:id', async (c) => {
    const body = await readJson(c, z.object({ name: personName.optional(), partnerId: z.string().nullable().optional() }));
    await mutate('admin', c.req.param('token'), (round) => {
      const person = participantOf(round, c.req.param('id'));
      if (body.name !== undefined && body.name !== person.name) {
        if (nameTaken(round, body.name, person.id)) throw new HttpError(409, 'name-taken', `„${body.name}“ ist schon dabei.`);
        person.name = body.name;
        if (person.id === round.group.organizer_participant_id) round.group.organizer_name = body.name;
      }
      if (body.partnerId !== undefined && body.partnerId !== person.partner_id) {
        ensureNotDrawn(round);
        if (body.partnerId === person.id) throw new HttpError(400, 'invalid-partner', 'Man kann nicht mit sich selbst verpartnert sein.');
        const partner = body.partnerId ? participantOf(round, body.partnerId) : undefined;
        if (person.partner_id) participantOf(round, person.partner_id).partner_id = null;
        person.partner_id = null;
        if (partner) {
          if (partner.partner_id) participantOf(round, partner.partner_id).partner_id = null;
          person.partner_id = partner.id; partner.partner_id = person.id;
        }
      }
    });
    return c.json({ ok: true });
  });
  app.delete('/api/admin/:token/participants/:id', async (c) => {
    await mutate('admin', c.req.param('token'), (round) => {
      ensureNotDrawn(round);
      const person = participantOf(round, c.req.param('id'));
      if (round.group.organizer_participant_id === person.id) round.group.organizer_participant_id = null;
      round.participants = round.participants.filter((p) => p.id !== person.id);
      for (const p of round.participants) if (p.partner_id === person.id) p.partner_id = null;
      round.exclusions = round.exclusions.filter((e) => e.giver_id !== person.id && e.receiver_id !== person.id);
      round.wishes = round.wishes.filter((w) => w.participant_id !== person.id);
    });
    return c.json({ ok: true });
  });
  /** Replaces a lost personal link. The old link stops working, which makes silent peeking noticeable. */
  app.post('/api/admin/:token/participants/:id/reissue-link', async (c) => {
    await limit(c, 'claim');
    const result = await mutate('admin', c.req.param('token'), (round) => {
      const person = participantOf(round, c.req.param('id'));
      if (!person.token) {
        throw new HttpError(409, 'not-claimed', `${person.name} hat noch keinen persönlichen Link. Schick den Einladungslink, damit ${person.name} den eigenen Namen auswählen kann.`);
      }
      person.token = newToken(); person.token_source = 'organizer';
      person.link_reissued_at = nowIso(); person.reveal_consent_at = null;
      return { token: person.token } satisfies ClaimResponse;
    });
    return c.json(result, 201);
  });
  app.post('/api/admin/:token/exclusions', async (c) => {
    const body = await readJson(c, z.object({
      giverId: z.string(), receiverId: z.string(), reason: z.enum(['custom', 'lastyear']).default('custom'), both: z.boolean().default(false),
    }));
    if (body.giverId === body.receiverId) throw new HttpError(400, 'invalid-exclusion', 'Bitte zwei verschiedene Personen wählen.');
    await mutate('admin', c.req.param('token'), (round) => {
      ensureNotDrawn(round);
      participantOf(round, body.giverId); participantOf(round, body.receiverId);
      const insert = (giver: string, receiver: string) => {
        if (!round.exclusions.some((e) => e.giver_id === giver && e.receiver_id === receiver)) {
          round.exclusions.push({ id: newId(), group_id: round.group.id, giver_id: giver, receiver_id: receiver, reason: body.reason });
        }
      };
      insert(body.giverId, body.receiverId);
      if (body.both) insert(body.receiverId, body.giverId);
    });
    return c.json({ ok: true }, 201);
  });
  app.delete('/api/admin/:token/exclusions/:id', async (c) => {
    await mutate('admin', c.req.param('token'), (round) => {
      ensureNotDrawn(round);
      round.exclusions = round.exclusions.filter((e) => e.id !== c.req.param('id'));
    });
    return c.json({ ok: true });
  });
  app.post('/api/admin/:token/draw', async (c) => {
    const mutualPairs = await mutate('admin', c.req.param('token'), (round) => {
      ensureNotDrawn(round);
      if (round.participants.some((p) => !p.token)) {
        throw new HttpError(409, 'unclaimed-participants', 'Bitte warte, bis alle ihren Namen in der Einladung ausgewählt haben.');
      }
      const forbidden = new Set<string>();
      for (const p of round.participants) if (p.partner_id) forbidden.add(pairKey(p.id, p.partner_id));
      for (const e of round.exclusions) forbidden.add(pairKey(e.giver_id, e.receiver_id));
      const result = draw({ ids: round.participants.map((p) => p.id), forbidden });
      if (!result.ok) {
        if (result.reason === 'too-few') throw new HttpError(422, 'too-few', 'Zum Wichteln braucht es mindestens 3 Personen.');
        const stuck = result.stuck.map((id) => participantOf(round, id).name);
        throw new HttpError(422, 'impossible', stuck.length
          ? `Mit diesen Regeln geht die Auslosung nicht auf – besonders bei ${stuck.join(', ')}. Bitte lockere ein paar Ausschlüsse.`
          : 'Mit diesen Regeln geht die Auslosung nicht auf. Bitte lockere ein paar Ausschlüsse.', { stuck });
      }
      round.assignments = [...result.pairs].map(([giver_id, receiver_id]) => ({ giver_id, receiver_id }));
      round.group.drawn_at = nowIso(); round.group.revealed_at = null; round.group.draw_version = newId();
      round.messages = [];
      for (const p of round.participants) { p.reveal_seen_at = null; p.reveal_consent_at = null; }
      return result.mutualPairs;
    });
    return c.json({ ok: true, mutualPairs });
  });
  app.post('/api/admin/:token/draw/reset', async (c) => {
    await mutate('admin', c.req.param('token'), (round) => {
      round.assignments = []; round.messages = [];
      round.group.drawn_at = null; round.group.revealed_at = null; round.group.draw_version = newId();
      for (const p of round.participants) { p.reveal_seen_at = null; p.reveal_consent_at = null; }
    });
    return c.json({ ok: true });
  });
  app.post('/api/admin/:token/reveal', async (c) => {
    const { revealed } = await readJson(c, z.object({ revealed: z.boolean() }));
    await mutate('admin', c.req.param('token'), (round) => {
      if (!round.group.drawn_at) throw new HttpError(409, 'not-drawn', 'Es wurde noch nicht ausgelost.');
      if (!revealed && round.group.revealed_at) throw new HttpError(409, 'already-revealed', 'Eine veröffentlichte Auflösung lässt sich nicht wieder geheim machen.');
      if (revealed && round.participants.some((p) => !p.reveal_consent_at)) {
        throw new HttpError(409, 'consent-required', 'Die Auflösung bleibt geheim, bis alle auf ihrer eigenen Seite zugestimmt haben.');
      }
      round.group.revealed_at = revealed ? nowIso() : null;
    });
    return c.json({ ok: true });
  });
  app.post('/api/admin/:token/next-round', async (c) => {
    await limit(c, 'create');
    const body = await readJson(c, z.object({
      name: cleanText(LIMITS.groupName).pipe(z.string().min(1)), exchangeDate: isoDate.nullable().optional(), budget: budget.optional(),
    }));
    // Validate against a guarded snapshot; a simultaneous reset must not leak its former assignment.
    const next = await mutate('admin', c.req.param('token'), (round) => {
      if (!round.group.revealed_at) throw new HttpError(409, 'reveal-required', 'Die Vorjahres-Paarungen können erst nach der gemeinsam freigegebenen Auflösung übernommen werden.');
      const next = emptyRound({
        name: body.name, organizer_name: round.group.organizer_name, budget: body.budget !== undefined ? body.budget : round.group.budget,
        exchange_date: body.exchangeDate ?? null, message: round.group.message, allow_self_join: round.group.allow_self_join, previous_group_id: round.group.id,
      }, { admin: newAdminToken(), invite: newInviteCode() });
      const ids = new Map<string, string>();
      for (const p of round.participants) {
        const person = addParticipant(next, p.name, p.id === round.group.organizer_participant_id ? newToken() : null);
        ids.set(p.id, person.id);
        if (person.token) next.group.organizer_participant_id = person.id;
      }
      for (const p of round.participants) if (p.partner_id) participantOf(next, ids.get(p.id)!).partner_id = ids.get(p.partner_id) ?? null;
      const insert = (giver: string, receiver: string, reason: 'custom' | 'lastyear') => {
        const giver_id = ids.get(giver)!; const receiver_id = ids.get(receiver)!;
        if (!next.exclusions.some((e) => e.giver_id === giver_id && e.receiver_id === receiver_id)) {
          next.exclusions.push({ id: newId(), group_id: next.group.id, giver_id, receiver_id, reason });
        }
      };
      for (const e of round.exclusions) if (e.reason === 'custom') insert(e.giver_id, e.receiver_id, 'custom');
      for (const a of round.assignments) insert(a.giver_id, a.receiver_id, 'lastyear');
      return next;
    });
    await storage.create(next);
    return c.json({
      adminToken: next.group.admin_token,
      participantToken: next.participants.find((p) => p.id === next.group.organizer_participant_id)?.token ?? null,
    } satisfies CreateGroupResponse, 201);
  });

  app.get('/api/invite/:code', async (c) => {
    const round = await readLink('invite', c.req.param('code'));
    return c.json({
      group: { ...groupInfo(round), allowSelfJoin: Boolean(round.group.allow_self_join) && !round.group.drawn_at },
      participants: round.participants.map((p) => ({ id: p.id, name: p.name, claimed: Boolean(p.token) })),
    } satisfies InviteView);
  });
  app.post('/api/invite/:code/claim', async (c) => {
    await limit(c, 'claim');
    const { participantId } = await readJson(c, z.object({ participantId: z.string() }));
    const result = await mutate('invite', c.req.param('code'), (round) => {
      ensureNotDrawn(round);
      const person = participantOf(round, participantId);
      if (person.token) throw new HttpError(409, 'already-claimed', `„${person.name}“ ist schon vergeben. Verwende deinen gespeicherten Link oder bitte ${round.group.organizer_name} um einen neuen. Wenn du das nicht warst, sag bitte ${round.group.organizer_name} Bescheid.`);
      person.token = newToken(); person.token_source = 'self'; person.claimed_at = nowIso();
      return { token: person.token } satisfies ClaimResponse;
    });
    return c.json(result, 201);
  });
  app.post('/api/invite/:code/join', async (c) => {
    await limit(c, 'claim');
    const { name } = await readJson(c, z.object({ name: personName }));
    const result = await mutate('invite', c.req.param('code'), (round) => {
      ensureNotDrawn(round);
      if (!round.group.allow_self_join) throw new HttpError(403, 'join-disabled', `Bitte frag ${round.group.organizer_name}, ob du dazukommen kannst.`);
      const token = newToken(); addParticipant(round, name, token);
      return { token } satisfies ClaimResponse;
    });
    return c.json(result, 201);
  });

  app.get('/api/me/:token', async (c) => {
    const token = c.req.param('token');
    const round = await mutate('personal', token, (round) => {
      meOf(round, token).last_seen_at = nowIso();
      return round;
    });
    const me = meOf(round, token);
    const a = round.group.drawn_at ? assignmentFor(round, me.id) : undefined;
    const receiver = a ? participantOf(round, a.receiver_id) : undefined;
    const giver = round.group.drawn_at ? giverOf(round, me.id) : undefined;
    const unread = (giverId: string, receiverId: string, fromGiver: boolean, readSequence: number) =>
      round.messages.filter((m) => m.giver_id === giverId && m.receiver_id === receiverId &&
        Boolean(m.from_giver) === fromGiver && !m.read_at && m.sequence > readSequence).length;
    const view: MeView = {
      me: {
        id: me.id, name: me.name, about: me.about, giftStatus: me.gift_status as GiftStatus,
        openedDoors: JSON.parse(me.opened_doors) as number[], wishes: wishesOf(round, me.id),
        isOrganizer: me.id === round.group.organizer_participant_id, revealSeen: Boolean(me.reveal_seen_at), revealConsent: Boolean(me.reveal_consent_at),
        linkReissuedAt: me.link_reissued_at,
      },
      group: groupInfo(round),
      participants: round.participants.map((p) => ({ id: p.id, name: p.name, giftStatus: p.gift_status as GiftStatus, isMe: p.id === me.id })),
      recipient: receiver ? { name: receiver.name, about: receiver.about, wishes: wishesOf(round, receiver.id) } : null,
      unread: {
        fromRecipient: receiver ? unread(me.id, receiver.id, false, me.recipient_read_sequence) : 0,
        fromChristkind: giver ? unread(giver.giver_id, me.id, true, me.christkind_read_sequence) : 0,
      },
      today: viennaToday(),
    };
    if (round.group.revealed_at) view.reveal = revealPairs(round);
    return c.json(view);
  });
  app.patch('/api/me/:token', async (c) => {
    const body = await readJson(c, z.object({ about: cleanText(LIMITS.about).optional(), giftStatus: z.number().int().min(0).max(3).optional() }));
    await mutate('personal', c.req.param('token'), (round) => {
      const me = meOf(round, c.req.param('token'));
      me.about = body.about ?? me.about; me.gift_status = body.giftStatus ?? me.gift_status;
    });
    return c.json({ ok: true });
  });
  app.post('/api/me/:token/wishes', async (c) => {
    const body = await readJson(c, z.object({
      text: cleanText(LIMITS.wishText).pipe(z.string().min(1, 'Was wünschst du dir?')), url: z.string().max(LIMITS.wishUrl).nullable().optional(),
    }));
    const url = body.url ? normalizeUrl(body.url) : null;
    const wish = await mutate('personal', c.req.param('token'), (round) => {
      const me = meOf(round, c.req.param('token'));
      if (wishesOf(round, me.id).length >= LIMITS.wishes) throw new HttpError(422, 'too-many', `Maximal ${LIMITS.wishes} Wünsche – das Christkind hat nur zwei Hände!`);
      const wish = { id: newId(), participant_id: me.id, text: body.text, url, created_at: nowIso() };
      round.wishes.push(wish);
      return { id: wish.id, text: wish.text, url } satisfies Wish;
    });
    return c.json(wish, 201);
  });
  app.delete('/api/me/:token/wishes/:id', async (c) => {
    await mutate('personal', c.req.param('token'), (round) => {
      const me = meOf(round, c.req.param('token'));
      round.wishes = round.wishes.filter((w) => w.id !== c.req.param('id') || w.participant_id !== me.id);
    });
    return c.json({ ok: true });
  });
  app.post('/api/me/:token/reveal-seen', async (c) => {
    await mutate('personal', c.req.param('token'), (round) => { meOf(round, c.req.param('token')).reveal_seen_at ??= nowIso(); });
    return c.json({ ok: true });
  });
  app.post('/api/me/:token/reveal-consent', async (c) => {
    const { consent } = await readJson(c, z.object({ consent: z.boolean() }));
    await mutate('personal', c.req.param('token'), (round) => {
      if (!round.group.drawn_at) throw new HttpError(409, 'not-drawn', 'Es wurde noch nicht ausgelost.');
      if (round.group.revealed_at) throw new HttpError(409, 'already-revealed', 'Die Auflösung wurde bereits veröffentlicht.');
      const me = meOf(round, c.req.param('token'));
      // The organizer has seen a re-issued link, so consent from it cannot prove the person agreed.
      if (consent && me.link_reissued_at) {
        throw new HttpError(409, 'reissued-link', 'Mit einem neu ausgestellten Link ist keine Zustimmung zur Auflösung möglich.');
      }
      me.reveal_consent_at = consent ? nowIso() : null;
    });
    return c.json({ ok: true });
  });
  app.post('/api/me/:token/doors', async (c) => {
    const { day } = await readJson(c, z.object({ day: z.number().int().min(1).max(24) }));
    if (day > maxOpenableDoor(viennaToday())) throw new HttpError(409, 'too-early', 'Nicht schummeln – dieses Türchen ist noch zu! 🤫');
    const openedDoors = await mutate('personal', c.req.param('token'), (round) => {
      const me = meOf(round, c.req.param('token'));
      const doors = new Set(JSON.parse(me.opened_doors) as number[]); doors.add(day);
      const sorted = [...doors].sort((a, b) => a - b); me.opened_doors = JSON.stringify(sorted);
      return sorted;
    });
    return c.json({ openedDoors });
  });

  const threadMessages = (round: Round, giverId: string, receiverId: string, iAmGiver: boolean): ChatMessage[] =>
    round.messages.filter((m) => m.giver_id === giverId && m.receiver_id === receiverId).map((m) => ({
      id: m.id, mine: Boolean(m.from_giver) === iAmGiver, body: m.body, createdAt: m.created_at,
    }));
  app.get('/api/me/:token/messages', async (c) => {
    const view = await mutate('personal', c.req.param('token'), (round) => {
      const me = meOf(round, c.req.param('token'));
      const view: MessagesView = { recipient: null, christkind: null };
      if (round.group.drawn_at) {
        const a = assignmentFor(round, me.id); const giver = giverOf(round, me.id);
        if (a) {
          view.recipient = { name: participantOf(round, a.receiver_id).name, messages: threadMessages(round, me.id, a.receiver_id, true) };
          me.recipient_read_sequence = round.group.message_sequence;
        }
        if (giver) {
          view.christkind = { messages: threadMessages(round, giver.giver_id, me.id, false) };
          me.christkind_read_sequence = round.group.message_sequence;
        }
      }
      return view;
    });
    return c.json(view);
  });
  app.post('/api/me/:token/messages', async (c) => {
    const token = c.req.param('token');
    const initial = await readLink('personal', token);
    await limit(c, 'chat', meOf(initial, token).id);
    const body = await readJson(c, z.object({
      to: z.enum(['recipient', 'christkind']), body: cleanText(LIMITS.chat).pipe(z.string().min(1, 'Die Nachricht ist leer.')),
    }));
    const message = await mutate('personal', token, (round) => {
      const me = meOf(round, token);
      const a = body.to === 'recipient' ? assignmentFor(round, me.id) : giverOf(round, me.id);
      if (!round.group.drawn_at || !a) throw new HttpError(409, 'not-drawn', 'Nachrichten gibt es erst nach der Auslosung.');
      const message = {
        id: newId(), group_id: round.group.id, giver_id: a.giver_id, receiver_id: a.receiver_id,
        from_giver: body.to === 'recipient' ? 1 : 0, body: body.body, created_at: nowIso(), read_at: null,
        sequence: ++round.group.message_sequence,
      };
      round.messages.push(message);
      return { id: message.id, mine: true, body: message.body, createdAt: message.created_at } satisfies ChatMessage;
    });
    return c.json(message, 201);
  });

  app.get('/manifest.webmanifest', (c) => {
    const start = c.req.query('start') ?? '/';
    const startUrl = /^\/(w|orga|einladung)\/[A-Za-z0-9_-]{8,64}$/.test(start) ? start : '/';
    c.header('Content-Type', 'application/manifest+json; charset=utf-8'); c.header('Cache-Control', 'no-cache');
    return c.body(JSON.stringify({
      name: 'Wichteln mit dem Christkind', short_name: 'Wichteln',
      description: 'Familien-Wichteln mit dem Christkind – auslosen, Wunschzettel schreiben, Packerl schenken.',
      lang: 'de-AT', start_url: startUrl, scope: '/', display: 'standalone', orientation: 'portrait',
      background_color: '#0c1730', theme_color: '#0c1730',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }));
  });
  app.all('/api/*', () => { throw new HttpError(404, 'not-found', 'Nicht gefunden.'); });
  return app;
}
