-- Run this once against your Neon database (SQL Editor in the Neon console).

create table if not exists events (
  id              serial primary key,
  slug            text unique not null,
  title           text not null default '',
  hosts           text not null default '',
  event_at        timestamptz,
  ends_at         timestamptz,
  timezone        text not null default 'America/Chicago',
  venue_name      text not null default '',
  address         text not null default '',
  note            text not null default '',
  dress_code      text not null default '',
  rsvp_by         date,
  image_url       text,
  seal            text not null default '',
  sender_name     text not null default '',
  sender_email    text not null default '',
  notify_email    text not null default '',
  reminder_days   int  not null default 3,
  remind_pending  boolean not null default true,
  allow_plus_ones boolean not null default true,
  notify_host     boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists guests (
  id               serial primary key,
  event_id         int not null references events(id) on delete cascade,
  token            text unique not null,
  name             text not null default '',
  email            text not null default '',   -- blank allowed: verbal RSVPs
  phone            text not null default '',
  status           text not null default 'pending',  -- pending | yes | no | maybe
  party            int  not null default 1,   -- adults + kids, kept in sync
  adults           int  not null default 1,
  kids             int  not null default 0,
  note             text not null default '',
  source           text not null default 'list',     -- list | link
  invite_sent_at   timestamptz,
  opened_at        timestamptz,   -- first time they opened their link
  last_opened_at   timestamptz,
  open_count       int not null default 0,
  reminder_sent_at timestamptz,
  replied_at       timestamptz,
  created_at       timestamptz not null default now()
);

-- Real addresses must be unique per event; blanks are exempt so a host can
-- record several guests who only gave a phone number.
create unique index if not exists guests_event_email_uniq
  on guests (event_id, email)
  where email <> '';

create index if not exists guests_event_idx on guests (event_id);
create index if not exists guests_status_idx on guests (event_id, status);

-- Backs the login rate limit on /admin.
create table if not exists login_attempts (
  id serial primary key,
  ip text not null,
  at timestamptz not null default now()
);

create index if not exists login_attempts_ip_at on login_attempts (ip, at);

-- ── Contacts (MoNe Events addition) ─────────────────────────────────────────
-- Persistent address book, independent of any single event.
create table if not exists contacts (
  id           serial primary key,
  name         text not null default '',
  email        text not null default '',
  phone        text not null default '',
  address      text not null default '',  -- street, city, state, zip on one line or multi-line
  birthday     date,                      -- null if unknown
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists contacts_email_uniq
  on contacts (email)
  where email <> '';

-- Link a guest row back to the contact it came from (optional).
alter table guests add column if not exists contact_id int references contacts(id) on delete set null;
create index if not exists guests_contact_idx on guests (contact_id);

-- One event to start with. Change the slug to whatever you like.
insert into events (slug, title, timezone)
values ('our-evening', 'Our Evening', 'America/Chicago')
on conflict (slug) do nothing;
