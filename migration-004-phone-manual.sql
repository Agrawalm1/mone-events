-- Adds a phone number, and allows guests with no email address so a host can
-- record a verbal RSVP. Run in the Neon SQL Editor. Safe to run twice.

alter table guests add column if not exists phone text not null default '';

-- The old constraint blocked more than one blank email per event. Replace it
-- with a partial index so blanks are allowed but real addresses stay unique.
alter table guests drop constraint if exists guests_event_id_email_key;

create unique index if not exists guests_event_email_uniq
  on guests (event_id, email)
  where email <> '';
