import { neon } from '@neondatabase/serverless';

/**
 * Built on first use, not at import time. Next.js imports every route module
 * during the build to collect page data — throwing at module scope would turn
 * a missing environment variable into a failed build instead of a clear
 * runtime error.
 */
let client = null;

function connection() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL is not set. Add it in Vercel under Settings > Environment Variables, or copy .env.example to .env.local for local work.'
      );
    }
    client = neon(url);
  }
  return client;
}

export function sql(strings, ...values) {
  return connection()(strings, ...values);
}

export async function getEvent(slug) {
  const rows = await sql`select * from events where slug = ${slug} limit 1`;
  return rows[0] || null;
}

export async function getPrimaryEvent() {
  const rows = await sql`select * from events order by id asc limit 1`;
  return rows[0] || null;
}

export async function listEvents() {
  return sql`select * from events order by id asc`;
}

export async function getEventById(id) {
  const rows = await sql`select * from events where id = ${Number(id)} limit 1`;
  return rows[0] || null;
}

/** Falls back to getPrimaryEvent when no id is supplied. */
export async function resolveEvent(id) {
  if (id) {
    const found = await getEventById(id);
    if (found) return found;
  }
  return getPrimaryEvent();
}

/** Five lowercase alphanumerics — enough that the link can't be guessed. */
function suffix() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'; // no look-alikes
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function slugify(title) {
  return (
    String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'event'
  );
}

/** The random tail of an existing slug, so renaming keeps the same link tail. */
export function slugSuffix(slug) {
  const tail = String(slug || '').split('-').pop();
  return /^[a-z0-9]{5}$/.test(tail) ? tail : null;
}

export function buildSlug(title, keepSuffix) {
  return `${slugify(title)}-${keepSuffix || suffix()}`;
}

export async function createEvent(title) {
  const clean = String(title || 'New event').trim() || 'New event';
  let slug = buildSlug(clean);
  for (let n = 0; n < 20; n++) {
    const taken = await sql`select 1 from events where slug = ${slug} limit 1`;
    if (!taken.length) break;
    slug = buildSlug(clean);
  }
  const rows = await sql`
    insert into events (slug, title, timezone)
    values (${slug}, ${clean}, 'America/Chicago')
    returning *`;
  return rows[0];
}

/** True once any invitation has gone out — after that the link must not move. */
export async function invitesSent(eventId) {
  const rows = await sql`
    select 1 from guests
    where event_id = ${Number(eventId)} and invite_sent_at is not null
    limit 1`;
  return rows.length > 0;
}

export async function deleteEvent(id) {
  await sql`delete from events where id = ${Number(id)}`;
}

export async function getGuestByToken(token) {
  const rows = await sql`
    select g.*, e.slug as event_slug
    from guests g join events e on e.id = g.event_id
    where g.token = ${token} limit 1`;
  return rows[0] || null;
}

export async function listGuests(eventId) {
  return sql`select * from guests where event_id = ${eventId} order by created_at asc`;
}

export function newToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
