import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { sql, getGuestByToken } from '@/lib/db';
import { recordOpen } from '@/lib/track';
import Invitation from '@/components/Invitation';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { token } = await params;
  const guest = await getGuestByToken(token);
  if (!guest) return { title: 'Invitation' };
  const rows = await sql`select title from events where id = ${guest.event_id}`;
  return { title: rows[0]?.title || 'Invitation' };
}

export default async function PersonalInvite({ params }) {
  const { token } = await params;
  const guest = await getGuestByToken(token);
  if (!guest) notFound();

  const rows = await sql`select * from events where id = ${guest.event_id}`;
  const event = rows[0];
  if (!event) notFound();

  // Only the personal link can attribute an open to someone, which is why the
  // shared /e/<slug> link records nothing.
  const h = await headers();
  await recordOpen(guest.id, h.get('user-agent'));

  return <Invitation event={event} guest={guest} />;
}
