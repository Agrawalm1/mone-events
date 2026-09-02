import {
  sql,
  listEvents,
  resolveEvent,
  listGuests,
  createEvent,
  deleteEvent,
  invitesSent,
  buildSlug,
  slugSuffix,
} from '@/lib/db';
import { isAdmin, unauthorized } from '@/lib/auth';
import { publicLink } from '@/lib/format';

/** Everything the dashboard needs for one selected event, plus the switcher list. */
async function snapshot(id) {
  const events = await listEvents();
  const event = await resolveEvent(id);
  if (!event) return null;
  const guests = await listGuests(event.id);
  return { events, event, guests, publicUrl: publicLink(event.slug) };
}

export async function GET(request) {
  if (!(await isAdmin())) return unauthorized();
  const id = new URL(request.url).searchParams.get('id');
  const data = await snapshot(id);
  if (!data) {
    return Response.json({ error: 'No event found. Run schema.sql, or create one.' }, { status: 404 });
  }
  return Response.json(data);
}

export async function POST(request) {
  if (!(await isAdmin())) return unauthorized();
  const { title } = await request.json().catch(() => ({}));
  const created = await createEvent(title);
  return Response.json(await snapshot(created.id));
}

export async function PUT(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();
  const current = await resolveEvent(body.id);
  if (!current) return Response.json({ error: 'That event no longer exists.' }, { status: 404 });

  const e = { ...current, ...body };

  // The guest link is generated, never typed. It tracks the event name while
  // that's still safe, then freezes the moment the first invitation goes out —
  // otherwise links already sitting in people's inboxes would stop working.
  const locked = await invitesSent(current.id);
  let slug = current.slug;
  if (body.regenerate_slug) {
    slug = buildSlug(e.title);
  } else if (!locked) {
    slug = buildSlug(e.title, slugSuffix(current.slug));
  }

  for (let n = 0; n < 20; n++) {
    const clash = await sql`
      select 1 from events where slug = ${slug} and id <> ${current.id} limit 1`;
    if (!clash.length) break;
    slug = buildSlug(e.title);
  }

  await sql`
    update events set
      slug            = ${slug},
      title           = ${e.title || ''},
      hosts           = ${e.hosts || ''},
      event_at        = ${e.event_at || null},
      ends_at         = ${e.ends_at || null},
      timezone        = ${e.timezone || 'America/Chicago'},
      venue_name      = ${e.venue_name || ''},
      address         = ${e.address || ''},
      note            = ${e.note || ''},
      dress_code      = ${e.dress_code || ''},
      rsvp_by         = ${e.rsvp_by || null},
      image_url       = ${e.image_url || null},
      seal            = ${String(e.seal || '').trim().slice(0, 14)},
      sender_name     = ${e.sender_name || ''},
      sender_email    = ${(e.sender_email || '').trim().toLowerCase()},
      notify_email    = ${(e.notify_email || '').trim().toLowerCase()},
      reminder_days   = ${Number(e.reminder_days) || 3},
      remind_pending  = ${!!e.remind_pending},
      allow_plus_ones = ${!!e.allow_plus_ones},
      notify_host     = ${!!e.notify_host}
    where id = ${current.id}`;

  const data = await snapshot(current.id);
  return Response.json({ ...data, linkLocked: locked });
}

export async function DELETE(request) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await request.json().catch(() => ({}));
  const events = await listEvents();
  if (events.length <= 1) {
    return Response.json({ error: "You can't delete your only event." }, { status: 400 });
  }
  await deleteEvent(id);
  return Response.json(await snapshot(null));
}
