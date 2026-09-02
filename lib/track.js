import { sql } from './db';

/**
 * Link scanners and chat previews fetch URLs without a human involved.
 * Corporate mail security (Safe Links, Mimecast, Proofpoint) is the common
 * one — it would otherwise mark a guest as having opened an invitation they
 * never saw.
 */
const NOT_A_PERSON =
  /bot|crawler|spider|preview|scan(ner)?|slurp|curl|wget|python-requests|headless|facebookexternalhit|whatsapp|telegram|discord|slackbot|twitterbot|linkedinbot|safelinks|proofpoint|barracuda|mimecast|urldefense|bitdefender|monitor/i;

export function looksHuman(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return false; // no user agent at all is a fetcher, not a browser
  return !NOT_A_PERSON.test(ua);
}

/** Fire and forget — a tracking failure must never break the invitation. */
export async function recordOpen(guestId, userAgent) {
  if (!looksHuman(userAgent)) return;
  try {
    await sql`
      update guests set
        opened_at      = coalesce(opened_at, now()),
        last_opened_at = now(),
        open_count     = open_count + 1
      where id = ${Number(guestId)}`;
  } catch (err) {
    console.error('open tracking failed', err.message);
  }
}
