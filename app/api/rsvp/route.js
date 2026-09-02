import { sql, getEvent, getGuestByToken, newToken } from '@/lib/db';
import { sendMail, confirmEmail, hostNotifyEmail, notifyAddressFor } from '@/lib/mail';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STATUSES = new Set(['yes', 'no', 'maybe']);

export const maxDuration = 30;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { token, slug, name, email, phone, status, adults, kids, note } = body;

  if (!STATUSES.has(status)) {
    return Response.json({ error: 'Choose yes, no, or maybe.' }, { status: 400 });
  }
  if (!String(name || '').trim()) {
    return Response.json({ error: 'Add your name so the host knows who replied.' }, { status: 400 });
  }

  const grownups = status === 'no' ? 0 : Math.min(20, Math.max(1, Number(adults) || 1));
  const children = status === 'no' ? 0 : Math.min(20, Math.max(0, Number(kids) || 0));
  const seats = grownups + children;
  let guest = null;
  let event = null;

  if (token) {
    guest = await getGuestByToken(token);
    if (!guest) return Response.json({ error: 'That invitation link is not valid.' }, { status: 404 });
    const rows = await sql`select * from events where id = ${guest.event_id}`;
    event = rows[0];
  } else {
    // Someone opened the shared link rather than a personal one.
    event = await getEvent(slug);
    if (!event) return Response.json({ error: 'That invitation is not valid.' }, { status: 404 });
    const addr = String(email || '').trim().toLowerCase();
    if (!EMAIL.test(addr)) {
      return Response.json({ error: 'Add a valid email address.' }, { status: 400 });
    }
    const found = await sql`
      select * from guests where event_id = ${event.id} and email = ${addr} limit 1`;
    if (found.length) {
      guest = found[0];
    } else {
      const rows = await sql`
        insert into guests (event_id, token, name, email, source)
        values (${event.id}, ${newToken()}, ${String(name).trim()}, ${addr}, 'link')
        returning *`;
      guest = rows[0];
    }
  }

  const rows = await sql`
    update guests set
      name = ${String(name).trim()},
      email = ${String(email || guest.email).trim().toLowerCase()},
      phone = ${String(phone || '').trim()},
      status = ${status},
      party = ${seats},
      adults = ${grownups},
      kids = ${children},
      note = ${String(note || '').trim()},
      replied_at = now()
    where id = ${guest.id}
    returning *`;
  const saved = rows[0];

  // Mail is best-effort: a reply that saved but failed to confirm is still a
  // reply, and the host can see it in the dashboard either way.
  try {
    const msg = confirmEmail(event, saved);
    await sendMail({ to: saved.email, name: saved.name, event, ...msg });
  } catch (err) {
    console.error('confirm email failed', err.message);
  }

  const notifyTo = notifyAddressFor(event);
  if (event.notify_host && notifyTo) {
    try {
      const msg = hostNotifyEmail(event, saved);
      await sendMail({ to: notifyTo, event, ...msg });
    } catch (err) {
      console.error('host notify failed', err.message);
    }
  }

  return Response.json({
    ok: true,
    guest: {
      status: saved.status,
      party: saved.party,
      adults: saved.adults,
      kids: saved.kids,
      name: saved.name,
    },
  });
}
