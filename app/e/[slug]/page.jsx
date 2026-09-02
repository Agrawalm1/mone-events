import { notFound } from 'next/navigation';
import { getEvent } from '@/lib/db';
import Invitation from '@/components/Invitation';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const event = await getEvent(slug);
  return { title: event?.title || 'Invitation' };
}

export default async function PublicInvite({ params }) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) notFound();

  return <Invitation event={event} guest={null} />;
}
