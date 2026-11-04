import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { z, ZodError } from 'zod';
import { transaction, type DB } from './db';
import { draw, pairKey } from './draw';
import {
  HttpError,
  RateLimiter,
  TOKEN_PATTERN,
  maxOpenableDoor,
  newAdminToken,
  newId,
  newInviteCode,
  newToken,
  newVerificationCode,
  nowIso,
  viennaToday,
} from './util';
import {
  LIMITS,
  type AdminView,
  type ChatMessage,
  type ClaimView,
  type CreateGroupResponse,
  type GiftStatus,
  type GroupInfo,
  type InviteView,
  type MeView,
  type MessagesView,
  type RevealPair,
  type Wish,
} from '../../shared/types';

interface GroupRow {
  id: string;
  admin_token: string;
  invite_code: string;
  name: string;
  organizer_name: string;
  organizer_participant_id: string | null;
  budget: number | null;
  exchange_date: string | null;
  message: string;
  allow_self_join: number;
  drawn_at: string | null;
  revealed_at: string | null;
  previous_group_id: string | null;
  created_at: string;
}

interface ParticipantRow {
  id: string;
  group_id: string;
  name: string;
  token: string | null;
  token_source: 'self' | 'organizer' | null;
  claimed_at: string | null;
  verified_at: string | null;
  reveal_consent_at: string | null;
  last_seen_at: string | null;
  reveal_seen_at: string | null;
  partner_id: string | null;
  about: string;
  gift_status: number;
  opened_doors: string;
  created_at: string;
}

export interface AppOptions {
  /** Use X-Forwarded-For for rate limiting (only when running behind a trusted proxy). */
  trustProxy?: boolean;
  /** Disable rate limits (tests). */
  disableRateLimits?: boolean;
}

// ---------- validation helpers ----------

const cleanText = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\r\n/g, '\n').trim())
    .pipe(z.string().max(max));

const personName = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Bitte einen Namen eingeben.').max(LIMITS.personName));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Ungültiges Datum');

const budget = z.number().int().min(0).max(LIMITS.maxBudget).nullable();

const groupFields = z.object({
  name: cleanText(LIMITS.groupName).pipe(z.string().min(1, 'Bitte gib der Runde einen Namen.')),
  organizerName: personName,
  budget: budget.optional(),
  exchangeDate: isoDate.nullable().optional(),
  message: cleanText(LIMITS.message).optional(),
  allowSelfJoin: z.boolean().optional(),
});

function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new HttpError(400, 'invalid-url', 'Dieser Link sieht nicht richtig aus.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
    throw new HttpError(400, 'invalid-url', 'Bitte nur normale Web-Links (https://…) verwenden.');
  }
  return url.toString();
}

async function readJson<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.output<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, 'invalid-json', 'Ungültige Anfrage.');
  }
  return schema.parse(raw);
}

function nameTaken(db: DB, groupId: string, name: string, exceptId?: string) {
  const row = db
    .prepare('SELECT id FROM participants WHERE group_id = ? AND lower(name) = lower(?) AND id != ?')
    .get(groupId, name, exceptId ?? '');
  return Boolean(row);
}

// ---------- app ----------

export function createApp(db: DB, options: AppOptions = {}) {
  const app = new Hono();

  const limiters = {
    general: new RateLimiter(600, 5 * 60_000),
    create: new RateLimiter(10, 60 * 60_000),
    claim: new RateLimiter(30, 10 * 60_000),
    verify: new RateLimiter(20, 10 * 60_000),
    chat: new RateLimiter(40, 10 * 60_000),
  };

  const clientIp = (c: Context): string => {
    if (options.trustProxy) {
      const fwd = c.req.header('x-forwarded-for');
      if (fwd) return fwd.split(',')[0].trim();
    }
    const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
    return incoming?.socket?.remoteAddress ?? 'unknown';
  };

  const limit = (c: Context, limiter: RateLimiter, key = clientIp(c)) => {
    if (options.disableRateLimits) return;
    if (!limiter.check(key)) {
      throw new HttpError(429, 'rate-limited', 'Zu viele Anfragen – bitte kurz warten und nochmal probieren.');
    }
  };

  // ----- data access -----

  const getGroupByAdmin = (token: string): GroupRow => {
    if (!TOKEN_PATTERN.test(token)) throw new HttpError(404, 'not-found', 'Diese Wichtel-Runde gibt es nicht (mehr).');
    const row = db.prepare('SELECT * FROM groups WHERE admin_token = ?').get(token) as GroupRow | undefined;
    if (!row) throw new HttpError(404, 'not-found', 'Diese Wichtel-Runde gibt es nicht (mehr).');
    return row;
  };

  const getGroupByInvite = (code: string): GroupRow => {
    if (!TOKEN_PATTERN.test(code)) throw new HttpError(404, 'not-found', 'Diese Einladung ist nicht (mehr) gültig.');
    const row = db.prepare('SELECT * FROM groups WHERE invite_code = ?').get(code) as GroupRow | undefined;
    if (!row) throw new HttpError(404, 'not-found', 'Diese Einladung ist nicht (mehr) gültig.');
    return row;
  };

  const getMe = (token: string): { me: ParticipantRow; group: GroupRow } => {
    if (!TOKEN_PATTERN.test(token)) throw new HttpError(404, 'not-found', 'Dieser persönliche Link ist nicht (mehr) gültig.');
    const me = db.prepare('SELECT * FROM participants WHERE token = ? AND verified_at IS NOT NULL').get(token) as ParticipantRow | undefined;
    if (!me) throw new HttpError(404, 'not-found', 'Dieser persönliche Link ist nicht (mehr) gültig.');
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(me.group_id) as unknown as GroupRow;
    return { me, group };
  };

  const participantsOf = (groupId: string) =>
    db.prepare('SELECT * FROM participants WHERE group_id = ? ORDER BY created_at, rowid').all(groupId) as unknown as ParticipantRow[];

  const participantOf = (group: GroupRow, id: string): ParticipantRow => {
    const p = db.prepare('SELECT * FROM participants WHERE id = ? AND group_id = ?').get(id, group.id) as
      | ParticipantRow
      | undefined;
    if (!p) throw new HttpError(404, 'not-found', 'Diese Person gibt es in der Runde nicht.');
    return p;
  };

  const wishesOf = (participantId: string): Wish[] =>
    (db.prepare('SELECT id, text, url FROM wishes WHERE participant_id = ? ORDER BY created_at, rowid').all(participantId) as unknown as Wish[]).map(
      (w) => ({ id: w.id, text: w.text, url: w.url ?? null }),
    );

  const touchGroup = (groupId: string) => db.prepare('UPDATE groups SET updated_at = ? WHERE id = ?').run(nowIso(), groupId);

  const ensureNotDrawn = (group: GroupRow) => {
    if (group.drawn_at) {
      throw new HttpError(409, 'already-drawn', 'Es wurde schon ausgelost. Setze die Auslosung zurück, um das zu ändern.');
    }
  };

  const groupInfo = (group: GroupRow): GroupInfo => {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM participants WHERE group_id = ?').get(group.id) as {
      count: number;
    };
    return {
      name: group.name,
      organizerName: group.organizer_name,
      budget: group.budget,
      exchangeDate: group.exchange_date,
      message: group.message,
      drawn: Boolean(group.drawn_at),
      revealed: Boolean(group.revealed_at),
      participantCount: Number(count),
    };
  };

  /** Full list of pairs, ordered along the gift chain(s) for a nice "Auflösung". */
  const revealPairs = (group: GroupRow): RevealPair[] => {
    const people = participantsOf(group.id);
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    const rows = db.prepare('SELECT giver_id, receiver_id FROM assignments WHERE group_id = ?').all(group.id) as {
      giver_id: string;
      receiver_id: string;
    }[];
    const next = new Map(rows.map((r) => [r.giver_id, r.receiver_id]));
    const seen = new Set<string>();
    const result: RevealPair[] = [];
    for (const p of people) {
      let current: string | undefined = p.id;
      while (current && next.has(current) && !seen.has(current)) {
        seen.add(current);
        const receiver: string = next.get(current)!;
        result.push({ giver: nameOf.get(current) ?? '?', receiver: nameOf.get(receiver) ?? '?' });
        current = receiver;
      }
    }
    return result;
  };

  const createGroup = (input: {
    name: string;
    organizerName: string;
    budget: number | null;
    exchangeDate: string | null;
    message: string;
    allowSelfJoin: boolean;
    previousGroupId: string | null;
  }) => {
    const now = nowIso();
    const group = {
      id: newId(),
      adminToken: newAdminToken(),
      inviteCode: newInviteCode(),
    };
    db.prepare(
      `INSERT INTO groups (id, admin_token, invite_code, name, organizer_name, budget, exchange_date, message,
         allow_self_join, previous_group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      group.id,
      group.adminToken,
      group.inviteCode,
      input.name,
      input.organizerName,
      input.budget,
      input.exchangeDate,
      input.message,
      input.allowSelfJoin ? 1 : 0,
      input.previousGroupId,
      now,
      now,
    );
    return group;
  };

  const insertParticipant = (groupId: string, name: string, token: string | null, source: 'self' | 'organizer' | null) => {
    const id = newId();
    const now = nowIso();
    db.prepare(
      `INSERT INTO participants (id, group_id, name, token, token_source, claimed_at, verified_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, groupId, name, token, source, token ? now : null, token ? now : null, now);
    return id;
  };

  const requestClaim = (person: ParticipantRow) => {
    if (person.token) {
      throw new HttpError(409, 'already-claimed', `„${person.name}“ ist bereits bestätigt. Verwende deinen gespeicherten persönlichen Link.`);
    }
    db.prepare('DELETE FROM claim_requests WHERE expires_at <= ?').run(nowIso());
    const claimToken = newToken();
    db.prepare(
      'INSERT INTO claim_requests (token, participant_id, verification_code, expires_at) VALUES (?, ?, ?, ?)',
    ).run(claimToken, person.id, newVerificationCode(), new Date(Date.now() + 30 * 60_000).toISOString());
    return { claimToken };
  };

  // ----- middleware -----

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      referrerPolicy: 'no-referrer',
      permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    }),
  );
  app.use('/api/*', bodyLimit({ maxSize: 32 * 1024, onError: () => { throw new HttpError(413, 'too-large', 'Die Anfrage ist zu groß.'); } }));
  app.use('/api/*', async (c, next) => {
    limit(c, limiters.general);
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex, nofollow');
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: err.code, message: err.message, details: err.details }, err.status);
    }
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const message = first?.message && !first.message.startsWith('Invalid') && !first.message.startsWith('Too')
        ? first.message
        : 'Bitte überprüfe deine Eingaben.';
      return c.json({ error: 'validation', message, details: err.issues.map((i) => ({ path: i.path, message: i.message })) }, 400);
    }
    console.error(err);
    return c.json({ error: 'internal', message: 'Da ist etwas schiefgegangen. Bitte später nochmal probieren.' }, 500);
  });

  app.get('/api/health', (c) => {
    db.prepare('SELECT 1').get();
    return c.json({ ok: true });
  });

  // ----- groups -----

  app.post('/api/groups', async (c) => {
    limit(c, limiters.create);
    const body = await readJson(
      c,
      groupFields.extend({ participates: z.boolean().default(true) }),
    );
    const result = transaction(db, () => {
      const group = createGroup({
        name: body.name,
        organizerName: body.organizerName,
        budget: body.budget ?? null,
        exchangeDate: body.exchangeDate ?? null,
        message: body.message ?? '',
        allowSelfJoin: body.allowSelfJoin ?? true,
        previousGroupId: null,
      });
      let participantToken: string | null = null;
      if (body.participates) {
        participantToken = newToken();
        const pid = insertParticipant(group.id, body.organizerName, participantToken, 'self');
        db.prepare('UPDATE groups SET organizer_participant_id = ? WHERE id = ?').run(pid, group.id);
      }
      return { adminToken: group.adminToken, participantToken } satisfies CreateGroupResponse;
    });
    return c.json(result, 201);
  });

  // ----- organizer -----

  app.get('/api/admin/:token', (c) => {
    const group = getGroupByAdmin(c.req.param('token'));
    const people = participantsOf(group.id);
    const wishCounts = new Map(
      (db
        .prepare(
          `SELECT w.participant_id AS id, COUNT(*) AS n FROM wishes w
           JOIN participants p ON p.id = w.participant_id WHERE p.group_id = ? GROUP BY w.participant_id`,
        )
        .all(group.id) as { id: string; n: number }[]).map((r) => [r.id, Number(r.n)]),
    );
    const exclusions = db
      .prepare('SELECT id, giver_id, receiver_id, reason FROM exclusions WHERE group_id = ? ORDER BY rowid')
      .all(group.id) as { id: string; giver_id: string; receiver_id: string; reason: 'custom' | 'lastyear' }[];
    const view: AdminView = {
      group: {
        ...groupInfo(group),
        id: group.id,
        inviteCode: group.invite_code,
        allowSelfJoin: Boolean(group.allow_self_join),
        drawnAt: group.drawn_at,
        createdAt: group.created_at,
        hasPreviousRound: Boolean(group.previous_group_id),
      },
      participants: people.map((p) => ({
        id: p.id,
        name: p.name,
        claimed: Boolean(p.token),
        lastSeenAt: p.last_seen_at,
        revealSeen: Boolean(p.reveal_seen_at),
        partnerId: p.partner_id,
        wishCount: wishCounts.get(p.id) ?? 0,
        hasAbout: p.about.trim().length > 0,
        giftStatus: p.gift_status as GiftStatus,
        isOrganizer: p.id === group.organizer_participant_id,
      })),
      exclusions: exclusions.map((e) => ({ id: e.id, giverId: e.giver_id, receiverId: e.receiver_id, reason: e.reason })),
      revealConsentCount: people.filter((p) => p.reveal_consent_at).length,
      today: viennaToday(),
    };
    if (group.revealed_at) view.reveal = revealPairs(group);
    return c.json(view);
  });

  app.patch('/api/admin/:token', async (c) => {
    const group = getGroupByAdmin(c.req.param('token'));
    const body = await readJson(c, groupFields.partial());
    const next = {
      name: body.name ?? group.name,
      organizer_name: body.organizerName ?? group.organizer_name,
      budget: body.budget !== undefined ? body.budget : group.budget,
      exchange_date: body.exchangeDate !== undefined ? body.exchangeDate : group.exchange_date,
      message: body.message ?? group.message,
      allow_self_join: body.allowSelfJoin !== undefined ? (body.allowSelfJoin ? 1 : 0) : group.allow_self_join,
    };
    db.prepare(
      `UPDATE groups SET name = ?, organizer_name = ?, budget = ?, exchange_date = ?, message = ?, allow_self_join = ?, updated_at = ?
       WHERE id = ?`,
    ).run(next.name, next.organizer_name, next.budget, next.exchange_date, next.message, next.allow_self_join, nowIso(), group.id);
    return c.json({ ok: true });
  });

  app.delete('/api/admin/:token', (c) => {
    const group = getGroupByAdmin(c.req.param('token'));
    transaction(db, () => {
      db.prepare('UPDATE groups SET previous_group_id = NULL WHERE previous_group_id = ?').run(group.id);
      db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
    });
    return c.json({ ok: true });
  });

  app.post('/api/admin/:token/participants', async (c) => {
    const group = getGroupByAdmin(c.req.param('token'));
    ensureNotDrawn(group);
    const { name } = await readJson(c, z.object({ name: personName }));
    const id = transaction(db, () => {
      const { count } = db.prepare('SELECT COUNT(*) AS count FROM participants WHERE group_id = ?').get(group.id) as { count: number };
      if (Number(count) >= LIMITS.participants) {
        throw new HttpError(422, 'too-many', `Mehr als ${LIMITS.participants} Personen gehen leider nicht.`);
      }
      if (nameTaken(db, group.id, name)) throw new HttpError(409, 'name-taken', `„${name}“ ist schon dabei.`);
      const pid = insertParticipant(group.id, name, null, null);
      touchGroup(group.id);
      return pid;
    });
    return c.json({ id }, 201);
  });

  app.patch('/api/admin/:token/participants/:id', async (c) => {
    const group = getGroupByAdmin(c.req.param('token'));
    const person = participantOf(group, c.req.param('id'));
    const body = await readJson(c, z.object({ name: personName.optional(), partnerId: z.string().nullable().optional() }));
    transaction(db, () => {
      if (body.name !== undefined && body.name !== person.name) {
        if (nameTaken(db, group.id, body.name, person.id)) throw new HttpError(409, 'name-taken', `„${body.name}“ ist schon dabei.`);
        db.prepare('UPDATE participants SET name = ? WHERE id = ?').run(body.name, person.id);
        if (person.id === group.organizer_participant_id) {
          db.prepare('UPDATE groups SET organizer_name = ? WHERE id = ?').run(body.name, group.id);
        }
      }
      if (body.partnerId !== undefined && body.partnerId !== person.partner_id) {
        ensureNotDrawn(group);
        // Unlink previous partners on both sides
        if (person.partner_id) db.prepare('UPDATE participants SET partner_id = NULL WHERE id = ?').run(person.partner_id);
        db.prepare('UPDATE participants SET partner_id = NULL WHERE id = ?').run(person.id);
        if (body.partnerId) {
          if (body.partnerId === person.id) throw new HttpError(400, 'invalid-partner', 'Man kann nicht mit sich selbst verpartnert sein.');
          const partner = participantOf(group, body.partnerId);
          if (partner.partner_id) db.prepare('UPDATE participants SET partner_id = NULL WHERE id = ?').run(partner.partner_id);
          db.prepare('UPDATE participants SET partner_id = ? WHERE id = ?').run(partner.id, person.id);
          db.prepare('UPDATE participants SET partner_id = ? WHERE id = ?').run(person.id, partner.id);
        }
      }
      touchGroup(group.id);
    });
    return c.json({ ok: true });
  });

  app.delete('/api/admin/:token/participants/:id', (c) => {
    const group = getGroupByAdmin(c.req.param('token'));
    ensureNotDrawn(group);
    const person = participantOf(group, c.req.param('id'));
    transaction(db, () => {
      if (person.id === group.organizer_participant_id) {
        db.prepare('UPDATE groups SET organizer_participant_id = NULL WHERE id = ?').run(group.id);
      }
      db.prepare('DELETE FROM participants WHERE id = ?').run(person.id);
      touchGroup(group.id);
    });
    return c.json({ ok: true });
  });

  app.post('/api/admin/:token/participants/:id/verify', async (c) => {
    const { verificationCode } = await readJson(c, z.object({
      verificationCode: z.string().transform((s) => s.replace(/[\s-]/g, '').toUpperCase()).pipe(z.string().regex(/^[A-F0-9]{10}$/)),
    }));
    transaction(db, () => {
      const group = getGroupByAdmin(c.req.param('token'));
      limit(c, limiters.verify, group.id);
      ensureNotDrawn(group);
      const person = participantOf(group, c.req.param('id'));
      if (person.token) throw new HttpError(409, 'already-claimed', 'Diese Person ist bereits bestätigt. Ihr Link kann nicht ersetzt werden.');
      const request = db.prepare(
        'SELECT token FROM claim_requests WHERE participant_id = ? AND verification_code = ? AND expires_at > ?',
      ).get(person.id, verificationCode, nowIso()) as { token: string } | undefined;
      if (!request) throw new HttpError(400, 'invalid-code', 'Dieser Code passt nicht oder ist abgelaufen. Bitte direkt am Handy der Person vergleichen.');
      db.prepare(
        "UPDATE participants SET token = ?, token_source = 'self', claimed_at = ?, verified_at = ? WHERE id = ?",
      ).run(request.token, nowIso(), nowIso(), person.id);
      db.prepare('DELETE FROM claim_requests WHERE participant_id = ?').run(person.id);
      touchGroup(group.id);
    });
    return c.json({ ok: true });
  });

  app.post('/api/admin/:token/exclusions', async (c) => {
    const group = getGroupByAdmin(c.req.param('token'));
    ensureNotDrawn(group);
    const body = await readJson(
      c,
      z.object({
        giverId: z.string(),
        receiverId: z.string(),
        reason: z.enum(['custom', 'lastyear']).default('custom'),
        both: z.boolean().default(false),
      }),
    );
    if (body.giverId === body.receiverId) throw new HttpError(400, 'invalid-exclusion', 'Bitte zwei verschiedene Personen wählen.');
    const giver = participantOf(group, body.giverId);
    const receiver = participantOf(group, body.receiverId);
    transaction(db, () => {
      const insert = db.prepare(
        'INSERT OR IGNORE INTO exclusions (id, group_id, giver_id, receiver_id, reason) VALUES (?, ?, ?, ?, ?)',
      );
      insert.run(newId(), group.id, giver.id, receiver.id, body.reason);
      if (body.both) insert.run(newId(), group.id, receiver.id, giver.id, body.reason);
      touchGroup(group.id);
    });
    return c.json({ ok: true }, 201);
  });

  app.delete('/api/admin/:token/exclusions/:id', (c) => {
    const group = getGroupByAdmin(c.req.param('token'));
    ensureNotDrawn(group);
    db.prepare('DELETE FROM exclusions WHERE id = ? AND group_id = ?').run(c.req.param('id'), group.id);
    return c.json({ ok: true });
  });

  app.post('/api/admin/:token/draw', (c) => {
    const group = getGroupByAdmin(c.req.param('token'));
    ensureNotDrawn(group);
    const people = participantsOf(group.id);
    if (people.some((p) => !p.token || !p.verified_at)) {
      throw new HttpError(409, 'unverified-participants', 'Bitte zuerst alle Personen durch einen Code-Vergleich vor Ort bestätigen.');
    }
    const forbidden = new Set<string>();
    for (const p of people) if (p.partner_id) forbidden.add(pairKey(p.id, p.partner_id));
    const exclusions = db.prepare('SELECT giver_id, receiver_id FROM exclusions WHERE group_id = ?').all(group.id) as {
      giver_id: string;
      receiver_id: string;
    }[];
    for (const e of exclusions) forbidden.add(pairKey(e.giver_id, e.receiver_id));

    const result = draw({ ids: people.map((p) => p.id), forbidden });
    if (!result.ok) {
      if (result.reason === 'too-few') {
        throw new HttpError(422, 'too-few', 'Zum Wichteln braucht es mindestens 3 Personen.');
      }
      const nameOf = new Map(people.map((p) => [p.id, p.name]));
      const stuck = result.stuck.map((id) => nameOf.get(id)!).filter(Boolean);
      throw new HttpError(
        422,
        'impossible',
        stuck.length
          ? `Mit diesen Regeln geht die Auslosung nicht auf – besonders bei ${stuck.join(', ')}. Bitte lockere ein paar Ausschlüsse.`
          : 'Mit diesen Regeln geht die Auslosung nicht auf. Bitte lockere ein paar Ausschlüsse.',
        { stuck },
      );
    }
    transaction(db, () => {
      db.prepare('DELETE FROM assignments WHERE group_id = ?').run(group.id);
      const insert = db.prepare('INSERT INTO assignments (giver_id, group_id, receiver_id) VALUES (?, ?, ?)');
      for (const [giver, receiver] of result.pairs) insert.run(giver, group.id, receiver);
      db.prepare('UPDATE participants SET reveal_seen_at = NULL, reveal_consent_at = NULL WHERE group_id = ?').run(group.id);
      db.prepare('DELETE FROM claim_requests WHERE participant_id IN (SELECT id FROM participants WHERE group_id = ?)').run(group.id);
      db.prepare('UPDATE groups SET drawn_at = ?, revealed_at = NULL, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), group.id);
    });
    return c.json({ ok: true, mutualPairs: result.mutualPairs });
  });

  app.post('/api/admin/:token/draw/reset', (c) => {
    const group = getGroupByAdmin(c.req.param('token'));
    transaction(db, () => {
      db.prepare('DELETE FROM assignments WHERE group_id = ?').run(group.id);
      db.prepare('DELETE FROM messages WHERE group_id = ?').run(group.id);
      db.prepare('UPDATE participants SET reveal_seen_at = NULL, reveal_consent_at = NULL WHERE group_id = ?').run(group.id);
      db.prepare('UPDATE groups SET drawn_at = NULL, revealed_at = NULL, updated_at = ? WHERE id = ?').run(nowIso(), group.id);
    });
    return c.json({ ok: true });
  });

  app.post('/api/admin/:token/reveal', async (c) => {
    const { revealed } = await readJson(c, z.object({ revealed: z.boolean() }));
    const group = getGroupByAdmin(c.req.param('token'));
    if (!group.drawn_at) throw new HttpError(409, 'not-drawn', 'Es wurde noch nicht ausgelost.');
    if (!revealed && group.revealed_at) {
      throw new HttpError(409, 'already-revealed', 'Eine veröffentlichte Auflösung lässt sich nicht wieder geheim machen.');
    }
    if (revealed && participantsOf(group.id).some((p) => !p.reveal_consent_at)) {
      throw new HttpError(409, 'consent-required', 'Die Auflösung bleibt geheim, bis alle auf ihrer eigenen Seite zugestimmt haben.');
    }
    db.prepare('UPDATE groups SET revealed_at = ?, updated_at = ? WHERE id = ?').run(revealed ? nowIso() : null, nowIso(), group.id);
    return c.json({ ok: true });
  });

  /** "Nächstes Jahr wieder": copies people, partners and rules; last year's pairs become exclusions. */
  app.post('/api/admin/:token/next-round', async (c) => {
    limit(c, limiters.create);
    const body = await readJson(
      c,
      z.object({
        name: cleanText(LIMITS.groupName).pipe(z.string().min(1)),
        exchangeDate: isoDate.nullable().optional(),
        budget: budget.optional(),
      }),
    );
    const group = getGroupByAdmin(c.req.param('token'));
    if (!group.revealed_at) {
      throw new HttpError(409, 'reveal-required', 'Die Vorjahres-Paarungen können erst nach der gemeinsam freigegebenen Auflösung übernommen werden.');
    }
    const result = transaction(db, () => {
      const next = createGroup({
        name: body.name,
        organizerName: group.organizer_name,
        budget: body.budget !== undefined ? body.budget : group.budget,
        exchangeDate: body.exchangeDate ?? null,
        message: group.message,
        allowSelfJoin: Boolean(group.allow_self_join),
        previousGroupId: group.id,
      });
      const idMap = new Map<string, string>();
      let participantToken: string | null = null;
      for (const p of participantsOf(group.id)) {
        const isOrganizer = p.id === group.organizer_participant_id;
        const token = isOrganizer ? newToken() : null;
        const newPid = insertParticipant(next.id, p.name, token, token ? 'self' : null);
        idMap.set(p.id, newPid);
        if (isOrganizer) {
          participantToken = token;
          db.prepare('UPDATE groups SET organizer_participant_id = ? WHERE id = ?').run(newPid, next.id);
        }
      }
      for (const p of participantsOf(group.id)) {
        if (p.partner_id && idMap.has(p.partner_id)) {
          db.prepare('UPDATE participants SET partner_id = ? WHERE id = ?').run(idMap.get(p.partner_id)!, idMap.get(p.id)!);
        }
      }
      const insert = db.prepare(
        'INSERT OR IGNORE INTO exclusions (id, group_id, giver_id, receiver_id, reason) VALUES (?, ?, ?, ?, ?)',
      );
      const custom = db.prepare("SELECT giver_id, receiver_id FROM exclusions WHERE group_id = ? AND reason = 'custom'").all(group.id) as {
        giver_id: string;
        receiver_id: string;
      }[];
      for (const e of custom) insert.run(newId(), next.id, idMap.get(e.giver_id)!, idMap.get(e.receiver_id)!, 'custom');
      const pairs = db.prepare('SELECT giver_id, receiver_id FROM assignments WHERE group_id = ?').all(group.id) as {
        giver_id: string;
        receiver_id: string;
      }[];
      for (const a of pairs) insert.run(newId(), next.id, idMap.get(a.giver_id)!, idMap.get(a.receiver_id)!, 'lastyear');
      return { adminToken: next.adminToken, participantToken } satisfies CreateGroupResponse;
    });
    return c.json(result, 201);
  });

  // ----- invitation -----

  app.get('/api/invite/:code', (c) => {
    const group = getGroupByInvite(c.req.param('code'));
    const view: InviteView = {
      group: { ...groupInfo(group), allowSelfJoin: Boolean(group.allow_self_join) && !group.drawn_at },
      participants: participantsOf(group.id).map((p) => ({ id: p.id, name: p.name, claimed: Boolean(p.token) })),
    };
    return c.json(view);
  });

  app.post('/api/invite/:code/claim', async (c) => {
    limit(c, limiters.claim);
    const { participantId } = await readJson(c, z.object({ participantId: z.string() }));
    const group = getGroupByInvite(c.req.param('code'));
    ensureNotDrawn(group);
    return c.json(requestClaim(participantOf(group, participantId)), 201);
  });

  app.post('/api/invite/:code/join', async (c) => {
    limit(c, limiters.claim);
    const { name } = await readJson(c, z.object({ name: personName }));
    const group = getGroupByInvite(c.req.param('code'));
    if (group.drawn_at) throw new HttpError(409, 'already-drawn', 'Es wurde schon ausgelost – neue Personen können nicht mehr dazukommen.');
    if (!group.allow_self_join) throw new HttpError(403, 'join-disabled', `Bitte frag ${group.organizer_name}, ob du dazukommen kannst.`);
    const request = transaction(db, () => {
      const { count } = db.prepare('SELECT COUNT(*) AS count FROM participants WHERE group_id = ?').get(group.id) as { count: number };
      if (Number(count) >= LIMITS.participants) throw new HttpError(422, 'too-many', 'Die Runde ist leider schon voll.');
      if (nameTaken(db, group.id, name)) {
        throw new HttpError(409, 'name-taken', `„${name}“ gibt es schon. Bist du das? Dann wähle den Namen oben aus.`);
      }
      const id = insertParticipant(group.id, name, null, null);
      touchGroup(group.id);
      return requestClaim(participantOf(group, id));
    });
    return c.json(request, 201);
  });

  app.get('/api/claim/:token', (c) => {
    const token = c.req.param('token');
    if (!TOKEN_PATTERN.test(token)) throw new HttpError(404, 'not-found', 'Diese Bestätigung ist nicht gültig.');
    const verified = db.prepare('SELECT * FROM participants WHERE token = ? AND verified_at IS NOT NULL').get(token) as ParticipantRow | undefined;
    if (verified) {
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(verified.group_id) as unknown as GroupRow;
      return c.json({ status: 'verified', name: verified.name, groupName: group.name, inviteCode: group.invite_code } satisfies ClaimView);
    }
    const request = db.prepare(
      `SELECT p.name, g.name AS groupName, g.invite_code AS inviteCode,
              r.verification_code AS verificationCode, r.expires_at AS expiresAt
       FROM claim_requests r JOIN participants p ON p.id = r.participant_id JOIN groups g ON g.id = p.group_id
       WHERE r.token = ? AND r.expires_at > ? AND p.token IS NULL AND g.drawn_at IS NULL`,
    ).get(token, nowIso()) as { name: string; groupName: string; inviteCode: string; verificationCode: string; expiresAt: string } | undefined;
    if (!request) throw new HttpError(404, 'claim-expired', 'Diese Anfrage ist abgelaufen oder wurde durch eine andere Bestätigung ersetzt. Öffne die Einladung erneut oder frag die organisierende Person.');
    return c.json({ status: 'pending', ...request } satisfies ClaimView);
  });

  // ----- participant -----

  const assignmentFor = (giverId: string) =>
    db.prepare('SELECT receiver_id FROM assignments WHERE giver_id = ?').get(giverId) as { receiver_id: string } | undefined;
  const giverOf = (receiverId: string) =>
    db.prepare('SELECT giver_id FROM assignments WHERE receiver_id = ?').get(receiverId) as { giver_id: string } | undefined;

  app.get('/api/me/:token', (c) => {
    const { me, group } = getMe(c.req.param('token'));
    db.prepare('UPDATE participants SET last_seen_at = ? WHERE id = ?').run(nowIso(), me.id);
    const people = participantsOf(group.id);
    const assignment = group.drawn_at ? assignmentFor(me.id) : undefined;
    const receiver = assignment ? people.find((p) => p.id === assignment.receiver_id) : undefined;
    const unreadCount = (giverId: string, receiverId: string, fromGiver: boolean) =>
      Number(
        (db
          .prepare('SELECT COUNT(*) AS n FROM messages WHERE giver_id = ? AND receiver_id = ? AND from_giver = ? AND read_at IS NULL')
          .get(giverId, receiverId, fromGiver ? 1 : 0) as { n: number }).n,
      );
    const myGiver = group.drawn_at ? giverOf(me.id) : undefined;
    const view: MeView = {
      me: {
        id: me.id,
        name: me.name,
        about: me.about,
        giftStatus: me.gift_status as GiftStatus,
        openedDoors: JSON.parse(me.opened_doors) as number[],
        wishes: wishesOf(me.id),
        isOrganizer: me.id === group.organizer_participant_id,
        revealSeen: Boolean(me.reveal_seen_at),
        revealConsent: Boolean(me.reveal_consent_at),
      },
      group: groupInfo(group),
      participants: people.map((p) => ({ id: p.id, name: p.name, giftStatus: p.gift_status as GiftStatus, isMe: p.id === me.id })),
      recipient: receiver ? { name: receiver.name, about: receiver.about, wishes: wishesOf(receiver.id) } : null,
      unread: {
        fromRecipient: receiver ? unreadCount(me.id, receiver.id, false) : 0,
        fromChristkind: myGiver ? unreadCount(myGiver.giver_id, me.id, true) : 0,
      },
      today: viennaToday(),
    };
    if (group.revealed_at) view.reveal = revealPairs(group);
    return c.json(view);
  });

  app.patch('/api/me/:token', async (c) => {
    const { me } = getMe(c.req.param('token'));
    const body = await readJson(
      c,
      z.object({
        about: cleanText(LIMITS.about).optional(),
        giftStatus: z.number().int().min(0).max(3).optional(),
      }),
    );
    db.prepare('UPDATE participants SET about = ?, gift_status = ? WHERE id = ?').run(
      body.about ?? me.about,
      body.giftStatus ?? me.gift_status,
      me.id,
    );
    return c.json({ ok: true });
  });

  app.post('/api/me/:token/wishes', async (c) => {
    const { me } = getMe(c.req.param('token'));
    const body = await readJson(
      c,
      z.object({
        text: cleanText(LIMITS.wishText).pipe(z.string().min(1, 'Was wünschst du dir?')),
        url: z.string().max(LIMITS.wishUrl).nullable().optional(),
      }),
    );
    const url = body.url ? normalizeUrl(body.url) : null;
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM wishes WHERE participant_id = ?').get(me.id) as { n: number };
    if (Number(n) >= LIMITS.wishes) throw new HttpError(422, 'too-many', `Maximal ${LIMITS.wishes} Wünsche – das Christkind hat nur zwei Hände!`);
    const id = newId();
    db.prepare('INSERT INTO wishes (id, participant_id, text, url, created_at) VALUES (?, ?, ?, ?, ?)').run(id, me.id, body.text, url, nowIso());
    return c.json({ id, text: body.text, url } satisfies Wish, 201);
  });

  app.delete('/api/me/:token/wishes/:id', (c) => {
    const { me } = getMe(c.req.param('token'));
    db.prepare('DELETE FROM wishes WHERE id = ? AND participant_id = ?').run(c.req.param('id'), me.id);
    return c.json({ ok: true });
  });

  app.post('/api/me/:token/reveal-seen', (c) => {
    const { me } = getMe(c.req.param('token'));
    db.prepare('UPDATE participants SET reveal_seen_at = COALESCE(reveal_seen_at, ?) WHERE id = ?').run(nowIso(), me.id);
    return c.json({ ok: true });
  });

  app.post('/api/me/:token/reveal-consent', async (c) => {
    const { consent } = await readJson(c, z.object({ consent: z.boolean() }));
    const { me, group } = getMe(c.req.param('token'));
    if (!group.drawn_at) throw new HttpError(409, 'not-drawn', 'Es wurde noch nicht ausgelost.');
    if (group.revealed_at) throw new HttpError(409, 'already-revealed', 'Die Auflösung wurde bereits veröffentlicht.');
    db.prepare('UPDATE participants SET reveal_consent_at = ? WHERE id = ?').run(consent ? nowIso() : null, me.id);
    return c.json({ ok: true });
  });

  app.post('/api/me/:token/doors', async (c) => {
    const { me } = getMe(c.req.param('token'));
    const { day } = await readJson(c, z.object({ day: z.number().int().min(1).max(24) }));
    if (day > maxOpenableDoor(viennaToday())) {
      throw new HttpError(409, 'too-early', 'Nicht schummeln – dieses Türchen ist noch zu! 🤫');
    }
    const doors = new Set(JSON.parse(me.opened_doors) as number[]);
    doors.add(day);
    const sorted = [...doors].sort((a, b) => a - b);
    db.prepare('UPDATE participants SET opened_doors = ? WHERE id = ?').run(JSON.stringify(sorted), me.id);
    return c.json({ openedDoors: sorted });
  });

  const threadMessages = (giverId: string, receiverId: string, iAmGiver: boolean): ChatMessage[] =>
    (db
      .prepare('SELECT id, from_giver, body, created_at FROM messages WHERE giver_id = ? AND receiver_id = ? ORDER BY created_at, rowid')
      .all(giverId, receiverId) as { id: string; from_giver: number; body: string; created_at: string }[]).map((m) => ({
      id: m.id,
      mine: Boolean(m.from_giver) === iAmGiver,
      body: m.body,
      createdAt: m.created_at,
    }));

  app.get('/api/me/:token/messages', (c) => {
    const { me, group } = getMe(c.req.param('token'));
    const view: MessagesView = { recipient: null, christkind: null };
    if (group.drawn_at) {
      const assignment = assignmentFor(me.id);
      const myGiver = giverOf(me.id);
      const now = nowIso();
      if (assignment) {
        const receiver = participantOf(group, assignment.receiver_id);
        view.recipient = { name: receiver.name, messages: threadMessages(me.id, receiver.id, true) };
        db.prepare('UPDATE messages SET read_at = ? WHERE giver_id = ? AND receiver_id = ? AND from_giver = 0 AND read_at IS NULL').run(
          now,
          me.id,
          receiver.id,
        );
      }
      if (myGiver) {
        view.christkind = { messages: threadMessages(myGiver.giver_id, me.id, false) };
        db.prepare('UPDATE messages SET read_at = ? WHERE giver_id = ? AND receiver_id = ? AND from_giver = 1 AND read_at IS NULL').run(
          now,
          myGiver.giver_id,
          me.id,
        );
      }
    }
    return c.json(view);
  });

  app.post('/api/me/:token/messages', async (c) => {
    const { me, group } = getMe(c.req.param('token'));
    limit(c, limiters.chat, me.id);
    const body = await readJson(
      c,
      z.object({
        to: z.enum(['recipient', 'christkind']),
        body: cleanText(LIMITS.chat).pipe(z.string().min(1, 'Die Nachricht ist leer.')),
      }),
    );
    if (!group.drawn_at) throw new HttpError(409, 'not-drawn', 'Nachrichten gibt es erst nach der Auslosung.');
    let giverId: string;
    let receiverId: string;
    if (body.to === 'recipient') {
      const a = assignmentFor(me.id);
      if (!a) throw new HttpError(409, 'not-drawn', 'Nachrichten gibt es erst nach der Auslosung.');
      giverId = me.id;
      receiverId = a.receiver_id;
    } else {
      const g = giverOf(me.id);
      if (!g) throw new HttpError(409, 'not-drawn', 'Nachrichten gibt es erst nach der Auslosung.');
      giverId = g.giver_id;
      receiverId = me.id;
    }
    const message = { id: newId(), createdAt: nowIso() };
    db.prepare('INSERT INTO messages (id, group_id, giver_id, receiver_id, from_giver, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      message.id,
      group.id,
      giverId,
      receiverId,
      body.to === 'recipient' ? 1 : 0,
      body.body,
      message.createdAt,
    );
    return c.json({ id: message.id, mine: true, body: body.body, createdAt: message.createdAt } satisfies ChatMessage, 201);
  });

  // ----- PWA manifest (start URL follows the page you install from) -----

  app.get('/manifest.webmanifest', (c) => {
    const start = c.req.query('start') ?? '/';
    const startUrl = /^\/(w|orga|einladung)\/[A-Za-z0-9_-]{8,64}$/.test(start) ? start : '/';
    c.header('Content-Type', 'application/manifest+json; charset=utf-8');
    c.header('Cache-Control', 'no-cache');
    return c.body(
      JSON.stringify({
        name: 'Wichteln mit dem Christkind',
        short_name: 'Wichteln',
        description: 'Familien-Wichteln mit dem Christkind – auslosen, Wunschzettel schreiben, Packerl schenken.',
        lang: 'de-AT',
        start_url: startUrl,
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0c1730',
        theme_color: '#0c1730',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      }),
    );
  });

  app.all('/api/*', () => {
    throw new HttpError(404, 'not-found', 'Nicht gefunden.');
  });

  return app;
}
