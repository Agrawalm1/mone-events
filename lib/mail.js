import { fmtPlainDate, whenLine, inviteLink, publicLink } from './format';

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Each event carries its own display name, sending address, and notification
 * address, so two people can share one deployment and still have invitations
 * arrive under their own name. Blank fields fall back to the env vars.
 */
export function senderFor(event) {
  const name = (event && event.sender_name) || process.env.SENDER_NAME || '';
  const addr = (event && event.sender_email) || process.env.SENDER_EMAIL;
  return { from: name ? `${name} <${addr}>` : addr, addr };
}

export function notifyAddressFor(event) {
  return (event && event.notify_email) || process.env.REPLY_TO_EMAIL || '';
}

/**
 * Sends to exactly one recipient. Resend accepts an array, but every address
 * in `to` can see the others, and each guest needs their own link anyway —
 * so callers loop instead.
 *
 * Resend's published rate limit and the limit accounts actually get don't
 * always agree, so this retries on 429 rather than assuming a ceiling.
 */
export async function sendMail({ to, name, subject, html, text, event }) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');

  const { from, addr } = senderFor(event);
  const replyTo = notifyAddressFor(event) || addr;
  const unsubscribe = replyTo;

  const payload = {
    from,
    to: [name ? `${name} <${to}>` : to],
    subject,
    html,
    text,
    reply_to: replyTo || undefined,
    headers: {
      // Not required below the bulk-sender threshold, but filters read it as
      // a sign of well-behaved infrastructure and it costs nothing.
      'List-Unsubscribe': `<mailto:${unsubscribe}?subject=unsubscribe>`,
    },
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) return res.json();

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 1;
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 5) * 1000));
      continue;
    }

    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }

  throw new Error('Resend kept rate limiting this address after four tries.');
}

/* ------------------------------------------------------------------ */
/*  templates                                                          */
/* ------------------------------------------------------------------ */

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Text only, deliberately. The photo lives on the invitation page, not in the
 * email — the message is a short note that gets you to click through, and a
 * high text-to-image ratio is also what spam filters want to see.
 */
function shell({ event, heading, lead, ctaLabel, ctaUrl, footer }) {
  const details = [
    event.event_at ? whenLine(event) : '',
    event.venue_name,
    event.address,
  ].filter(Boolean);

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#e4e6df;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e4e6df;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#f3f3ee;border:1px solid rgba(22,32,46,0.15);">
        <tr><td style="padding:34px 30px 36px;text-align:center;font-family:Helvetica,Arial,sans-serif;color:#16202e;">
          ${
            event.hosts
              ? `<p style="margin:0 0 14px;font-family:Courier,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#868a83;">${esc(event.hosts)}</p>`
              : ''
          }
          <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:34px;line-height:1.1;color:#16202e;">${esc(heading)}</h1>
          ${lead ? `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#35435a;">${esc(lead)}</p>` : ''}
          <hr style="border:0;border-top:1px solid rgba(168,137,76,0.6);margin:0 0 22px;">
          ${details
            .map(
              (d, i) =>
                `<p style="margin:0 0 6px;font-size:${i === 0 ? '17px' : '15px'};line-height:1.5;color:#16202e;font-family:${i === 0 ? "Georgia,'Times New Roman',serif" : 'Helvetica,Arial,sans-serif'};">${esc(d)}</p>`
            )
            .join('')}
          ${
            event.dress_code
              ? `<p style="margin:14px 0 0;font-size:14px;color:#35435a;">${esc(event.dress_code)}</p>`
              : ''
          }
          <p style="margin:30px 0 0;">
            <a href="${esc(ctaUrl)}" style="display:inline-block;background:#6b2d4f;color:#f3f3ee;text-decoration:none;padding:14px 26px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">${esc(ctaLabel)}</a>
          </p>
          ${
            event.rsvp_by
              ? `<p style="margin:18px 0 0;font-family:Courier,monospace;font-size:11px;letter-spacing:0.12em;color:#868a83;">Kindly reply by ${esc(fmtPlainDate(event.rsvp_by))}</p>`
              : ''
          }
        </td></tr>
      </table>
      ${
        footer
          ? `<p style="max-width:540px;margin:16px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#868a83;text-align:center;">${esc(footer)}</p>`
          : ''
      }
    </td></tr>
  </table>
</body></html>`;
}

function plain(lines) {
  return lines.filter(Boolean).join('\n');
}

/** "2 adults and 1 child" — used in confirmations and host alerts. */
export function partyWords(guest) {
  const a = Number(guest.adults) || 0;
  const k = Number(guest.kids) || 0;
  const bits = [];
  if (a) bits.push(`${a} adult${a === 1 ? '' : 's'}`);
  if (k) bits.push(`${k} ${k === 1 ? 'child' : 'children'}`);
  return bits.join(' and ');
}

export function inviteEmail(event, guest) {
  const url = inviteLink(guest.token);
  return {
    subject: `You're invited: ${event.title}`,
    html: shell({
      event,
      heading: event.title,
      lead: guest.name ? `${guest.name}, we'd love to have you.` : '',
      ctaLabel: 'Open your invitation',
      ctaUrl: url,
      footer: 'This link is yours — it remembers your reply if you want to change it later.',
    }),
    text: plain([
      guest.name ? `${guest.name},` : '',
      '',
      event.hosts ? `${event.hosts} invite you to` : 'You are invited to',
      event.title,
      '',
      whenLine(event),
      event.venue_name,
      event.address,
      '',
      'Open your invitation and reply:',
      url,
      event.rsvp_by ? `\nKindly reply by ${fmtPlainDate(event.rsvp_by)}.` : '',
    ]),
  };
}

export function reminderEmail(event, guest) {
  const url = inviteLink(guest.token);
  const going = guest.status === 'yes' || guest.status === 'maybe';
  return {
    subject: going
      ? `Coming up: ${event.title}`
      : `Still hoping you can join: ${event.title}`,
    html: shell({
      event,
      heading: event.title,
      lead: going
        ? 'A quick reminder — here are the details again.'
        : "We haven't heard from you yet, and we'd still love to see you.",
      ctaLabel: going ? 'See the details' : 'Reply now',
      ctaUrl: url,
      footer: 'Change your reply any time from that link.',
    }),
    text: plain([
      going
        ? `A quick reminder about ${event.title}.`
        : `We haven't heard from you about ${event.title}.`,
      '',
      whenLine(event),
      event.venue_name,
      event.address,
      '',
      'Details and your reply:',
      url,
    ]),
  };
}

export function confirmEmail(event, guest) {
  const url = inviteLink(guest.token);
  const heading = 'Thank you for your RSVP';

  const sentiment =
    guest.status === 'yes'
      ? 'We are excited to see you.'
      : guest.status === 'no'
        ? 'We will miss you.'
        : 'We hope you can make it.';

  // The headcount is worth confirming back, but only when they're coming.
  const detail =
    guest.status === 'no' ? '' : ` We have you down for ${partyWords(guest) || 'one'}.`;

  return {
    subject: `Reply received: ${event.title}`,
    html: shell({
      event,
      heading,
      lead: sentiment + detail,
      ctaLabel: 'Change my reply',
      ctaUrl: url,
      footer: 'No further action needed.',
    }),
    text: plain([
      heading + '.',
      sentiment + detail,
      '',
      whenLine(event),
      event.venue_name,
      event.address,
      '',
      'Change your reply:',
      url,
    ]),
  };
}

export function hostNotifyEmail(event, guest) {
  const label = { yes: 'YES', no: 'NO', maybe: 'MAYBE' }[guest.status] || guest.status;
  const body = plain([
    `${guest.name || guest.email} replied ${label}${
      guest.status !== 'no' && partyWords(guest) ? ` — ${partyWords(guest)}` : ''
    }.`,
    guest.note ? `\nNote: ${guest.note}` : '',
    '',
    `${publicLink(event.slug)}`,
  ]);
  return {
    subject: `${label} — ${guest.name || guest.email}`,
    html: `<pre style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;white-space:pre-wrap;color:#16202e;">${esc(body)}</pre>`,
    text: body,
  };
}
