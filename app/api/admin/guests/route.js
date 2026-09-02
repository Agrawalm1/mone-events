import { sql, resolveEvent, listGuests, newToken } from '@/lib/db';
import { isAdmin, unauthorized } from '@/lib/auth';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STATUSES = new Set(['pending', 'yes', 'no', 'maybe']);

/**
 * Accepts, one per line:
 *   Ana Reyes <ana@example.com>
 *   jon@example.com
 *   Priya Nair, 555-0123        <- no email: for verbal RSVPs
 */
function parseRoster(raw) {
  const out = [];
  const seenEmail = new Set();
  for (const line of String(raw || '').split(/\n+/)) {
    const s = line.trim();
    if (!s) continue;

    const angled = s.match(/^(.*)<([^>]+)>$/);
    if (angled) {
      const email = angled[2].trim().toLowerCase();
      if (!EMAIL.test(email) || seenEmail.has(email)) continue;
      seenEmail.add(email);
      out.push({ email, name: angled[1].trim().replace(/^["']|["']$/g, ''), phone: '' });
      continue;
    }

    // Otherwise split on commas and sort the pieces by what they look like.
    const parts = s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    let email = '';
    let phone = '';
    const words = [];
    for (const part of parts) {
      if (!email && EMAIL.test(part)) email = part.toLowerCase();
      else if (!phone && /^[+()\d][\d\s().-]{6,}$/.test(part)) phone = part;
      else words.push(part);
    }
    if (email) {
      if (seenEmail.has(email)) continue;
      seenEmail.add(email);
    }
    const name = words.join(', ');
    if (!email && !name) continue;
    out.push({ email, name, phone });
  }
  return out;
}

export async function POST(request) {
  if (!(await isAdmin())) return unauthorized();
  const { roster, eventId, copyFromEventId } = await request.json();
  const event = await resolveEvent(eventId);
  if (!event) return Response.json({ error: 'Event not found.' }, { status: 404 });

  let people;
  if (copyFromEventId) {
    const rows = await sql`
      select name, email, phone from guests
      where event_id = ${Number(copyFromEventId)}
      order by id asc`;
    people = rows.map((r) => ({ name: r.name, email: r.email, phone: r.phone }));
  } else {
    people = parseRoster(roster);
  }

  let added = 0;
  for (const p of people) {
    if (p.email) {
      const exists = await sql`
        select 1 from guests
        where event_id = ${event.id} and email = ${p.email} limit 1`;
      if (exists.length) continue;
    }
    await sql`
      insert into guests (event_id, token, name, email, phone, source)
      values (${event.id}, ${newToken()}, ${p.name || ''}, ${p.email || ''}, ${p.phone || ''}, 'list')`;
    added++;
  }

  const guests = await listGuests(event.id);
  return Response.json({ added, skipped: people.length - added, guests });
}

/** Manual edit — lets a host record an RSVP given in person or by phone. */
export async function PATCH(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();
  const event = await resolveEvent(body.eventId);
  if (!event) return Response.json({ error: 'Event not found.' }, { status: 404 });

  const rows = await sql`
    select * from guests where id = ${Number(body.id)} and event_id = ${event.id} limit 1`;
  const current = rows[0];
  if (!current) return Response.json({ error: 'Guest not found.' }, { status: 404 });

  const status = STATUSES.has(body.status) ? body.status : current.status;
  const grownups = status === 'no' || status === 'pending'
    ? 0
    : Math.min(20, Math.max(1, Number(body.adults) || 1));
  const children = status === 'no' || status === 'pending'
    ? 0
    : Math.min(20, Math.max(0, Number(body.kids) || 0));

  const email = String(body.email ?? current.email).trim().toLowerCase();
  if (email && !EMAIL.test(email)) {
    return Response.json({ error: 'That email address does not look right.' }, { status: 400 });
  }
  if (email && email !== current.email) {
    const clash = await sql`
      select 1 from guests
      where event_id = ${event.id} and email = ${email} and id <> ${current.id} limit 1`;
    if (clash.length) {
      return Response.json({ error: 'Another guest already has that address.' }, { status: 409 });
    }
  }

  // replied_at is what separates a real reply from an untouched invitation, so
  // it's set when a status is recorded and cleared if the host resets to pending.
  await sql`
    update guests set
      name       = ${String(body.name ?? current.name).trim()},
      email      = ${email},
      phone      = ${String(body.phone ?? current.phone).trim()},
      status     = ${status},
      adults     = ${grownups},
      kids       = ${children},
      party      = ${grownups + children},
      note       = ${String(body.note ?? current.note).trim()},
      replied_at = ${status === 'pending' ? null : current.replied_at || new Date().toISOString()}
    where id = ${current.id}`;

  const guests = await listGuests(event.id);
  return Response.json({ guests });
}

export async function DELETE(request) {
  if (!(await isAdmin())) return unauthorized();
  const { id, eventId } = await request.json();
  const event = await resolveEvent(eventId);
  if (!event) return Response.json({ error: 'Event not found.' }, { status: 404 });

  await sql`delete from guests where id = ${Number(id)} and event_id = ${event.id}`;
  const guests = await listGuests(event.id);
  return Response.json({ guests });
}
