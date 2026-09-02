import { sql, resolveEvent, listGuests } from '@/lib/db';
import { isAdmin, unauthorized } from '@/lib/auth';
import { runSend } from '@/lib/send';

export const maxDuration = 60;

export async function POST(request) {
  if (!(await isAdmin())) return unauthorized();
  const { kind, resend, eventId } = await request.json();
  const event = await resolveEvent(eventId);
  if (!event) return Response.json({ error: 'Event not found.' }, { status: 404 });

  let targets;
  if (kind === 'reminder') {
    targets = await sql`
      select * from guests
      where event_id = ${event.id}
        and email <> ''
        and reminder_sent_at is null
        and (status in ('yes','maybe') or (${event.remind_pending} and status = 'pending'))
      order by id asc`;
  } else if (resend) {
    targets = await sql`
      select * from guests where event_id = ${event.id} and email <> '' order by id asc`;
    await sql`update guests set invite_sent_at = null where event_id = ${event.id}`;
  } else {
    targets = await sql`
      select * from guests
      where event_id = ${event.id} and email <> '' and invite_sent_at is null
      order by id asc`;
  }

  const result = await runSend({
    event,
    guests: targets,
    kind: kind === 'reminder' ? 'reminder' : 'invite',
  });
  const guests = await listGuests(event.id);
  return Response.json({ ...result, guests });
}
