/** Local calendar days ("YYYY-MM-DD") in an IANA timezone, without dependencies. */

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function safeTz(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function parts(ms: number, tz: string): Record<string, number> {
  const out: Record<string, number> = {};
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz(tz), hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  for (const p of f.formatToParts(ms)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

/** Local wall-clock time minus UTC, in ms, at instant `ms`. */
function offsetMs(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - Math.floor(ms / 1000) * 1000;
}

export function localDay(ms: number, tz: string): string {
  const p = parts(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function localHour(ms: number, tz: string): number {
  return parts(ms, tz).hour!;
}

export function isValidDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** UTC instant of local midnight starting `day`. */
export function dayStart(day: string, tz: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetMs(guess, tz);
  return guess - offsetMs(first, tz);
}

/** [start, end) of a local day, in UTC ms. */
export function dayBounds(day: string, tz: string): [number, number] {
  return [dayStart(day, tz), dayStart(shiftDay(day, 1), tz)];
}
