/** Remembers the rounds opened on this device so people find their way back. */

export interface SavedRound {
  kind: 'orga' | 'w';
  token: string;
  groupName: string;
  personName?: string;
  inviteCode?: string;
  /** For organizer entries: the organizer's own participant link, if they take part. */
  selfToken?: string;
  savedAt: string;
}

const KEY = 'wichteln.rounds.v1';

function read(): SavedRound[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedRound[]) : [];
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.token === 'string') : [];
  } catch {
    return [];
  }
}

function write(rounds: SavedRound[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rounds.slice(0, 30)));
  } catch {
    /* private mode or storage full – the links still work */
  }
}

export function listRounds(): SavedRound[] {
  return read().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function rememberRound(round: Omit<SavedRound, 'savedAt'>) {
  const all = read();
  const previous = all.find((r) => r.kind === round.kind && r.token === round.token);
  const rest = all.filter((r) => r !== previous);
  const defined = Object.fromEntries(Object.entries(round).filter(([, v]) => v !== undefined)) as typeof round;
  rest.unshift({ ...previous, ...defined, savedAt: new Date().toISOString() });
  write(rest);
}

export function findRound(kind: SavedRound['kind'], token: string): SavedRound | undefined {
  return read().find((r) => r.kind === kind && r.token === token);
}

export function forgetRound(kind: SavedRound['kind'], token: string) {
  write(read().filter((r) => !(r.kind === kind && r.token === token)));
}

export function findByInvite(inviteCode: string): SavedRound | undefined {
  return read().find((r) => r.kind === 'w' && r.inviteCode === inviteCode);
}

export function flag(key: string): boolean {
  try {
    return localStorage.getItem(`wichteln.flag.${key}`) === '1';
  } catch {
    return false;
  }
}

export function setFlag(key: string, value = true) {
  try {
    if (value) localStorage.setItem(`wichteln.flag.${key}`, '1');
    else localStorage.removeItem(`wichteln.flag.${key}`);
  } catch {
    /* ignore */
  }
}
