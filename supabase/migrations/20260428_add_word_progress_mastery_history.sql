alter table public.word_progress
  add column if not exists has_ever_mastered boolean not null default false;

update public.word_progress
set has_ever_mastered = true
where mastered_at is not null;
