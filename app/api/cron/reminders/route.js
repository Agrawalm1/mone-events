import { sql } from '@/lib/db';
import { runSend } from '@/lib/send';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Runs daily. Asks "is today the reminder day?" rather than scheduling a
 * one-off when someone RSVPs — so moving the event date moves the reminder,
 * and reminder_sent_at makes a retry harmless.
 */
export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Not authorized' }, { status: 401 });
  }

  const due = await sql`
    select * from events
    where event_at is not null
      and ((event_at at time zone timezone)::date - reminder_days)
          = (now() at time zone timezone)::date`;

  const report = [];

  for (const event of due) {
    const guests = await sql`
      select * from guests
      where event_id = ${event.id}
        and email <> ''
        and reminder_sent_at is null
        and (status in ('yes','maybe') or (${event.remind_pending} and status = 'pending'))
      order by id asc`;

    const result = await runSend({ event, guests, kind: 'reminder', budgetMs: 45000 });
    report.push({ event: event.slug, ...result });
  }

  return Response.json({ ran: new Date().toISOString(), events: due.length, report });
}
