/**
 * The admin types wall-clock time ("6:00 PM") and the event carries an IANA
 * zone. These convert between that and the UTC instant stored in Postgres,
 * so a host in one timezone can schedule an event in another without the
 * hour drifting across a DST boundary.
 */

function partsIn(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(date)) p[type] = value;
  if (p.hour === '24') p.hour = '00';
  return p;
}

function offsetMs(date, timeZone) {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - date.getTime();
}

/** "2026-09-12T18:00" in America/Chicago -> "2026-09-12T23:00:00.000Z" */
export function wallToUtc(wall, timeZone) {
  if (!wall) return null;
  const naive = Date.parse(`${wall}:00Z`);
  if (isNaN(naive)) return null;
  let ts = naive;
  // Two passes settle it, including on DST boundaries.
  for (let i = 0; i < 3; i++) ts = naive - offsetMs(new Date(ts), timeZone);
  return new Date(ts).toISOString();
}

/** The inverse, for populating a datetime-local input. */
export function utcToWall(iso, timeZone) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = partsIn(d, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export const COMMON_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Australia/Sydney',
];
