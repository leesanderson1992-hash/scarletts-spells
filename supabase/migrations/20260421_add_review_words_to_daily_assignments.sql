begin;

alter table public.daily_assignments
  add column if not exists review_words text[] not null default '{}';

commit;
