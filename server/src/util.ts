import { randomBytes } from 'node:crypto';

export const newId = () => randomBytes(12).toString('base64url');
export const newToken = () => randomBytes(18).toString('base64url');
export const newAdminToken = () => randomBytes(24).toString('base64url');
export const newInviteCode = () => randomBytes(9).toString('base64url');

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export const nowIso = () => new Date().toISOString();

/** Today's date in Austria as YYYY-MM-DD. `FAKE_TODAY` can be set for demos/tests. */
export function viennaToday(now: Date = new Date()): string {
  if (process.env.FAKE_TODAY && /^\d{4}-\d{2}-\d{2}$/.test(process.env.FAKE_TODAY)) {
    return process.env.FAKE_TODAY;
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Highest Advent-calendar door (1–24) that may be opened today. */
export function maxOpenableDoor(today: string): number {
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  if (month === 12) return Math.min(day, 24);
  if (month === 1) return 24;
  return 0;
}

export class HttpError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409 | 413 | 422 | 429,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Minimal fixed-window rate limiter (in memory, per key). */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  check(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10000) this.prune(now);
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
