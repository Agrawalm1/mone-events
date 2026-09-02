import { getEvent } from '@/lib/db';

const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
const esc = (s) =>
  String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export async function GET(request, { params }) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event || !event.event_at) {
    return new Response('Not found', { status: 404 });
  }

  const start = new Date(event.event_at);
  const end = event.ends_at ? new Date(event.ends_at) : new Date(start.getTime() + 2 * 3600 * 1000);

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Invitation//EN',
    'BEGIN:VEVENT',
    `UID:${event.slug}-${event.id}@invitation`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(event.title)}`,
    `LOCATION:${esc([event.venue_name, event.address].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${esc(event.note)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  return new Response(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${event.slug}.ics"`,
    },
  });
}
