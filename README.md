# Invitation

A private invitation site with automatic email. Guests get a personal link, replies land in a
dashboard, and a scheduled job mails the reminder on its own.

Stack: Next.js on Vercel (free Hobby), Neon Postgres (free), Resend for email (free, 100/day),
Vercel Blob for the event photo (free).

Running cost: your domain. Everything else stays on a free tier at this size.

---

## What you'll set up

Four accounts, about 40 minutes, most of it waiting for DNS.

1. A domain registrar — Cloudflare or Namecheap, roughly $12/year
2. **Neon** — the database
3. **Resend** — sends the mail
4. **Vercel** — hosts the site and runs the daily job

---

## 1. Database

Create a project at neon.tech. Open the SQL Editor, paste in the whole of `schema.sql`, run it.
That creates two tables and one starter event row.

From the Neon dashboard, copy the pooled connection string. It looks like
`postgresql://...@ep-something-pooler.region.neon.tech/neondb?sslmode=require`. Keep it handy —
that's `DATABASE_URL`.

## 2. Email

Sign up at resend.com, add your domain, and add the DNS records it shows you. This is the step
that decides whether your invitations land in inboxes or spam.

Resend puts its records on a **subdomain** (`send.yourdomain.com` or similar) rather than the
root. That's convenient here: if you're also using Cloudflare Email Routing to receive mail, its
SPF record sits on the root and the two never collide. Add Resend's records exactly as shown and
leave the root SPF alone.

Set any CNAME records to **DNS-only** in Cloudflare (grey cloud, not orange). Proxying breaks
mail authentication.

Do not skip domain verification and send from a gmail.com address. Gmail and Yahoo require
senders to be authenticated, and free domains can't be. A quarter of your invitations would
vanish.

Then create an API key. Choose **Sending access**, not Full access — this app only ever calls
one endpoint, so a key that can also read and delete resources is permission you'd never use.
After picking Sending access you can restrict the key to your domain; do that too. Copy it
immediately: Resend shows an API key exactly once, and if you lose it your only option is to
delete it and make another.

You do **not** create individual addresses in Resend. Once the domain is verified, any address
at that domain is valid to send from — `invites@yourdomain.com` is just a string you type, not a
mailbox you register.

That's three values you now have: `RESEND_API_KEY`, `SENDER_EMAIL` (an address at your domain),
and `REPLY_TO_EMAIL` (where you actually read mail — guest replies and "someone RSVP'd"
notifications both go there; leave it blank and those notifications silently don't send). You
enter all three in the next step — there's nowhere in Resend to put them.

## 3. Deploy

Push this folder to a GitHub repo, then import it at vercel.com.

**This is where every value from `.env.example` gets entered.** Open your Vercel project →
**Settings → Environment Variables**, and add each name and value there. That's the only place
they exist in production — not in Resend, not in Neon, not in a file you upload.

Generate the two secrets (`ADMIN_SECRET` and `CRON_SECRET`) with:

```
openssl rand -hex 32
```

Leave `.env.example` itself untouched — it's committed to git and must never hold real values.
For running locally, copy it to `.env.local` and fill that in instead; `.env.local` is
gitignored.

Then create a Blob store under **Storage → Create → Blob** and connect it to the project. Vercel
injects `BLOB_READ_WRITE_TOKEN` for you.

Add your domain under **Settings → Domains**. A subdomain reads nicely on an invitation —
`invite.yourdomain.com`. Set `SITE_URL` to match, with no trailing slash, because
that's what gets baked into the links inside emails.

Redeploy after adding the variables. They aren't picked up retroactively.

## 4. Check the cron

`vercel.json` registers one job: `/api/cron/reminders`, daily at 15:00 UTC (10am Central). Vercel
registers it automatically on deploy — confirm it under **Settings → Cron Jobs**.

Two things to know about Hobby-plan cron: it runs **once a day at most**, and it fires anywhere
within the hour you name. Neither matters here, because the job asks "is today the reminder day?"
rather than trying to hit a precise moment.

To change the hour, edit the schedule in `vercel.json` (it's UTC) and redeploy.

---

## Using it

Go to `/admin` and sign in with `ADMIN_PASSWORD`.

### Two people, two events, one app

Sender name, sending address, and notification address all live on the event, not in the
environment. Use **New event** in the dashboard header to add one, and the dropdown beside it to
switch between them. Each event gets its own guest list, its own link, its own reminder
schedule, and its own name in the From line — so one person's invitations arrive as "Maya" and
the other's as "Vik" from the same deployment.

`SENDER_NAME` and `REPLY_TO_EMAIL` in the environment are only fallbacks now, used when an
event leaves those fields blank.

One caution: keeping a single sending address across both events is the safer default. Every
address you send from builds its own history at the receiving end, and splitting a new domain's
reputation across two addresses helps nobody. Vary the display name freely; vary the address
only if you have a reason.

**Card** — upload the photo, fill in the details, save. The photo is resized in your browser
before upload, so a 12MB phone picture is fine. Set the timezone first; the date fields are
interpreted in it.

**Guests** — paste addresses, one per line. `Ana Reyes <ana@example.com>` or a bare address both
work. Duplicates are skipped, so you can paste the same list twice without harm.

**Send** — mails everyone who hasn't been sent yet. Each guest gets their own link, which is why
replies attach to the right person without anyone logging in. Sending happens in batches; the
dashboard keeps calling until the queue drains, so leave the tab open until it says it's done.

**Replies** — live counts, notes, CSV export. "Heads" is the real number for catering: it sums
party sizes rather than counting replies.

The reminder needs no action. The daily job finds events where today is the event date minus
`reminder_days`, mails everyone who said yes or maybe (plus the silent ones, if you left that
option on), and stamps each guest so a retry can't double-send.

### The shared link

`/e/your-slug` works for anyone — good for a group chat or a forwarded message. People arriving
that way type their own name and email, and a guest record is created for them. They show up in
the dashboard marked "via shared link" so you can tell them apart from your original list.

---

## Limits worth knowing

- **Resend free: 100 emails/day, 3,000/month.** This is the tightest constraint. Confirmations
  and host notifications count against it too, so a 100-guest blast will not fit in one day.
  Send in waves — see below. This is a feature as much as a limit; a brand-new domain should not
  fire 100 messages at once anyway.
- **Rate limiting.** Resend's docs say 10 requests/second; plenty of accounts report 2. The
  sender paces at roughly 1.6/second and retries on 429, so you shouldn't hit it either way.
- **Vercel Hobby: one cron run per day.** Fine for reminders. If you ever want two reminder
  windows, use two different events or an external scheduler pinging the same route.
- **Neon free tier sleeps** after inactivity. The first page load after a quiet spell takes an
  extra second or two. Harmless.

## Running it locally

```
npm install
cp .env.example .env.local   # fill it in
npm run dev
```

To test the cron by hand:

```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders
```

It returns a JSON report of what it did. If it says `events: 0`, today isn't a reminder day —
temporarily change `reminder_days` to match the actual gap and try again.

## Sending in waves

A new domain with no sending history that emits 100 identical messages looks exactly like spam,
regardless of how correct your DNS is. Warm up first: send a handful of ordinary emails from
`invites@` over several days and get a few replies. Replies are the strongest positive signal
there is.

Then send the invitations in batches. The Send tab only mails guests who haven't been mailed
yet, so you can add 20 addresses in the Guests tab, send, add 20 more the next day, send again.
No code change needed — just add people in waves.

Write something real in the **Note** field, too. A big photo with almost no text is a mild spam
signal on its own; two or three sentences of genuine detail fixes the ratio.

## Before you send for real

- Add yourself as a guest and send one invitation. Check that it lands in the inbox, not spam.
- Open it in Gmail and use **Show original**. You want SPF, DKIM, and DMARC all reading PASS.
- Run one through mail-tester.com. Anything at 8/10 or above is fine.
- Click your own link and RSVP. Confirm the reply appears in the dashboard and the confirmation
  email arrives.
- Set `reminder_days` to the gap between today and the event, run the cron by hand, confirm the
  reminder arrives, then reset it and clear the flag:
  `update guests set reminder_sent_at = null;`

---

## Handing this to someone else

Nothing in the code is tied to a particular domain, name, or account — every
one of those is an environment variable. A second person runs their own copy by
repeating the setup with their own accounts. Their guests, database, and mail
are completely separate from yours.

**Give them the code.** Send the project folder, or add them to the repo and let
them fork it. They should end up with their own repository, not a branch of
yours — you don't want their commits landing in the deployment that's sending
your invitations.

**They need their own of each:**

| Account | Why it can't be shared |
|---|---|
| Neon | Guests and events live here. One database means one shared guest list. |
| Resend | Mail must be authenticated against *their* domain, not yours. |
| Vercel | Free Hobby is per person, and env vars are per project. |
| Domain | Their invitations should come from their name. |

**Fresh install, in order:**

1. Create a Neon project and run `schema.sql` — the whole file, once. It is
   complete on its own; the `migration-*.sql` files are only for upgrading an
   existing database and should be skipped on a new one.
2. Sign up for Resend, add and verify their domain, create a **Sending access**
   API key restricted to that domain.
3. Import the repo to Vercel, add every variable from `.env.example`, create a
   Blob store, add their domain, redeploy.
4. Sign in at `/admin` and create their first event.

**Things they will want to change:**

- `vercel.json` sets the reminder job to 15:00 UTC, which is 10am Central. Edit
  the cron schedule if they're in another timezone. It's UTC, not local.
- `schema.sql` seeds one event with the timezone `America/Chicago` and the slug
  `our-evening`. Harmless, but they'll rename it immediately.
- `public/background.jpg` and `public/background-mobile.jpg` are your background
  image. Image licences don't transfer just because the file is in a repo — they
  should drop in their own, or check they're allowed to use yours.
- Colours and fonts are variables at the top of `app/globals.css`.

**What they must not reuse:** `ADMIN_PASSWORD`, `ADMIN_SECRET`, `CRON_SECRET`,
`RESEND_API_KEY`, `DATABASE_URL`. Generate fresh secrets. Copying yours would
give each of you a working key to the other's admin tools.

### Why not just share your deployment?

It already supports multiple events, so technically two people can use one
install — that's how the sender name and reply address are set per event. But
there is a single admin password and no per-user permissions, so anyone who signs
in sees and can edit *every* event, including guest lists and email addresses.
And all mail would leave from your verified domain under your sending
reputation. Fine for a couple sharing a household; not fine for a friend.
