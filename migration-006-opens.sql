-- Records when a guest actually opened their invitation page.
-- Run in the Neon SQL Editor. Safe to run twice.

alter table guests add column if not exists opened_at      timestamptz;
alter table guests add column if not exists last_opened_at timestamptz;
alter table guests add column if not exists open_count     int not null default 0;
