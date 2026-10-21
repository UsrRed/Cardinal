let zone = 'UTC';
export function setTimezone(tz: string): void { zone = tz; }
export function getTimezone(): string { return zone; }

function fmt(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: zone, ...opts }).format(d);
  } catch {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...opts }).format(d);
  }
}
export const formatDateTime = (iso: string | null | undefined) =>
  fmt(iso, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const formatTime = (iso: string | null | undefined) => fmt(iso, { hour: '2-digit', minute: '2-digit' });
export const formatLongDate = (iso: string | null | undefined) =>
  fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const formatDay = formatLongDate;
