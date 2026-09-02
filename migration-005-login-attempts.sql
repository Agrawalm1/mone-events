-- Backs the login rate limit. Run in the Neon SQL Editor. Safe to run twice.

create table if not exists login_attempts (
  id serial primary key,
  ip text not null,
  at timestamptz not null default now()
);

create index if not exists login_attempts_ip_at on login_attempts (ip, at);
