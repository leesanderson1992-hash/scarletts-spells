begin;

alter table public.children
  add column if not exists ingredient_count integer not null default 0,
  add column if not exists reward_vouchers_available integer not null default 0;

alter table public.daily_assignments
  add column if not exists session_started_at timestamptz,
  add column if not exists session_completed_at timestamptz,
  add column if not exists session_completed_words integer not null default 0,
  add column if not exists ingredient_awarded boolean not null default false;

commit;
