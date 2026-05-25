begin;

update public.daily_assignments
set assignment_generation_source = 'historical_pre_phase5'
where assignment_generation_source = 'legacy_word_progress';

alter table public.daily_assignments
  alter column assignment_generation_source set default 'learning_items';

drop index if exists public.writing_issues_word_progress_idx;

alter table public.writing_issues
  drop column if exists linked_word_progress_id;

drop table if exists public.word_progress;

alter table public.children
  drop column if exists gold_coin_balance;

commit;
