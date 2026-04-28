begin;

alter table public.word_progress
  add column if not exists review_stage integer not null default 0;

update public.word_progress
set review_stage = 0
where review_stage is null;

commit;
