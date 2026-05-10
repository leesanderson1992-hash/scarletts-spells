begin;

alter table public.daily_assignments
  add column if not exists assignment_generation_source text not null default 'legacy_word_progress',
  add column if not exists source_learning_item_ids uuid[] not null default '{}'::uuid[];

commit;
