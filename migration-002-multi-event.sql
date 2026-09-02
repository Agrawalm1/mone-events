-- Run this in the Neon SQL Editor if you already created your tables with
-- the original schema.sql. Safe to run more than once.

alter table events add column if not exists sender_name  text not null default '';
alter table events add column if not exists sender_email text not null default '';
alter table events add column if not exists notify_email text not null default '';
