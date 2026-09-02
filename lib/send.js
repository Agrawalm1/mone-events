import { sql } from './db';
import { sendMail, inviteEmail, reminderEmail } from './mail';

/**
 * Serverless functions have a wall clock. Rather than trying to push 100
 * emails through one invocation and hoping, this sends until the budget runs
 * out and reports what's left, so the caller can invoke it again.
 */
export async function runSend({ event, guests, kind, budgetMs = 40000 }) {
  const started = Date.now();
  const result = { sent: 0, failed: 0, remaining: 0, errors: [] };

  for (let i = 0; i < guests.length; i++) {
    if (Date.now() - started > budgetMs) {
      result.remaining = guests.length - i;
      break;
    }
    const guest = guests[i];
    const msg = kind === 'reminder' ? reminderEmail(event, guest) : inviteEmail(event, guest);

    try {
      await sendMail({
        to: guest.email,
        name: guest.name,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        event,
      });

      if (kind === 'reminder') {
        await sql`update guests set reminder_sent_at = now() where id = ${guest.id}`;
      } else {
        await sql`update guests set invite_sent_at = now() where id = ${guest.id}`;
      }
      result.sent++;
    } catch (err) {
      result.failed++;
      if (result.errors.length < 8) {
        result.errors.push(`${guest.email}: ${err.message}`);
      }
    }

    // Resend's real per-account rate limit is either 2/sec or 10/sec
    // depending on who you ask. 600ms keeps us under the pessimistic reading
    // and the 429 retry in sendMail covers the rest.
    await new Promise((r) => setTimeout(r, 600));
  }

  return result;
}
