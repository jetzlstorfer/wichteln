const dateFmt = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const longDateFmt = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const viennaLongFmt = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Vienna' });
const timeFmt = new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' });
const dayFmt = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', timeZone: 'Europe/Vienna' });
const euroFmt = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const relFmt = new Intl.RelativeTimeFormat('de-AT', { numeric: 'auto' });
const viennaIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' });

const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);
const DAY = 86_400_000;

/** "Mittwoch, 24. Dezember" */
export const formatDate = (iso: string) => dateFmt.format(utc(iso));
/** "24. Dezember 2025" */
export const formatDateLong = (iso: string) => longDateFmt.format(utc(iso));
/** Calendar day of a timestamp in Vienna, e.g. "3. Dezember 2025". */
export const formatTimestampDay = (timestamp: string) => viennaLongFmt.format(new Date(timestamp));
export const formatEuro = (n: number) => euroFmt.format(n);

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((utc(toIso).getTime() - utc(fromIso).getTime()) / DAY);
}

/** Austrian countdown wording – kids count the nights until the Christkind comes. */
export function sleepsText(days: number): string {
  if (days < 0) return 'Die Bescherung war schon – frohe Weihnachten!';
  if (days === 0) return 'Heute ist Bescherung!';
  if (days === 1) return 'Nur noch 1 Mal schlafen!';
  return `Noch ${days} Mal schlafen`;
}

export function messageTime(iso: string, todayIso: string): string {
  const d = new Date(iso);
  return viennaIso.format(d) === todayIso ? timeFmt.format(d) : `${dayFmt.format(d)}, ${timeFmt.format(d)}`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'noch nie';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'gerade eben';
  if (abs < 3600) return relFmt.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return relFmt.format(Math.round(diff / 3600), 'hour');
  return relFmt.format(Math.round(diff / 86400), 'day');
}

export function todayLocalIso(): string {
  return viennaIso.format(new Date());
}

/** Default Bescherung: 24 December of this year, or next year once it has passed. */
export function defaultExchangeDate(todayIso = todayLocalIso()): string {
  const year = Number(todayIso.slice(0, 4));
  return todayIso > `${year}-12-24` ? `${year + 1}-12-24` : `${year}-12-24`;
}

/** Number of Advent candles burning on the given day (0–4). */
export function adventCandles(todayIso: string): number {
  const year = Number(todayIso.slice(0, 4));
  const today = utc(todayIso);
  if (today.getUTCMonth() === 0) return 4;
  const christmas = utc(`${year}-12-25`);
  if (today >= christmas) return 4;
  const dow = christmas.getUTCDay();
  const fourthAdvent = new Date(christmas.getTime() - (dow === 0 ? 7 : dow) * DAY);
  let candles = 0;
  for (let i = 0; i < 4; i++) {
    const sunday = new Date(fourthAdvent.getTime() - (3 - i) * 7 * DAY);
    if (today >= sunday) candles = i + 1;
  }
  return candles;
}

export const pluralPeople = (n: number) => (n === 1 ? '1 Person' : `${n} Personen`);
