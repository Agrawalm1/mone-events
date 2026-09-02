import { sql } from '@/lib/db';
import { isAdmin, unauthorized } from '@/lib/auth';
import { publicLink } from '@/lib/format';

/**
 * One row per event with its counts, so the dashboard is a single query
 * rather than a fan-out per event.
 */
export async function GET() {
  if (!(await isAdmin())) return unauthorized();

  const rows = await sql`
    select
      e.id, e.slug, e.title, e.hosts, e.event_at, e.timezone,
      e.reminder_days, e.sender_name, e.rsvp_by,
      count(g.id) filter (where g.status = 'yes')     ::int as yes,
      count(g.id) filter (where g.status = 'maybe')   ::int as maybe,
      count(g.id) filter (where g.status = 'no')      ::int as no,
      count(g.id) filter (where g.status = 'pending') ::int as pending,
      coalesce(sum(g.adults) filter (where g.status = 'yes'), 0)::int as adults,
      coalesce(sum(g.kids)   filter (where g.status = 'yes'), 0)::int as kids,
      count(g.id) filter (where g.email <> '' and g.invite_sent_at is null)::int as unsent,
      count(g.id) filter (where g.reminder_sent_at is not null)::int as reminded,
      count(g.id)::int as total
    from events e
    left join guests g on g.event_id = e.id
    group by e.id
    order by e.event_at asc nulls last, e.id asc`;

  return Response.json({
    events: rows.map((r) => ({ ...r, publicUrl: publicLink(r.slug) })),
  });
}
