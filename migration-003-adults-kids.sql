-- Splits the single party count into adults and children.
-- Run in the Neon SQL Editor. Safe to run more than once.

alter table guests add column if not exists adults int not null default 1;
alter table guests add column if not exists kids   int not null default 0;

-- Best-effort backfill: existing party sizes become adults.
update guests
set adults = case when status = 'no' then 0 else greatest(party, 1) end
where adults = 1 and party <> 1;
