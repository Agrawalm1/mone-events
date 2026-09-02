export function fmtDate(value, timezone) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone || 'America/Chicago',
  });
}

export function fmtTime(value, timezone) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone || 'America/Chicago',
    })
    .toLowerCase();
}

// A date column (rsvp_by) comes back as a Date at UTC midnight. Format it
// without a timezone so it doesn't slide backwards a day.
export function fmtPlainDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Server-only: this is read when building links inside emails, never in the
 * browser, so it deliberately has no NEXT_PUBLIC_ prefix. The old prefixed
 * name is still honoured so an existing deployment doesn't break mid-change.
 */
export function siteUrl() {
  const raw =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  return raw.replace(/\/+$/, '');
}

export function inviteLink(token) {
  return `${siteUrl()}/i/${token}`;
}

export function publicLink(slug) {
  return `${siteUrl()}/e/${slug}`;
}

export function whenLine(event) {
  const parts = [];
  if (event.event_at) {
    parts.push(fmtDate(event.event_at, event.timezone));
    parts.push(`at ${fmtTime(event.event_at, event.timezone)}`);
  }
  return parts.join(' ');
}
