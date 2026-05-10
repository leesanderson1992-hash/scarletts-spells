begin;

create table if not exists public.writing_false_positive_suppressions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  misspelled_word text not null,
  corrected_word text not null,
  source_writing_issue_suggestion_id uuid references public.writing_issue_suggestions(id) on delete set null,
  source_misspelling_instance_id uuid references public.misspelling_instances(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists writing_false_positive_suppressions_exact_pair_idx
  on public.writing_false_positive_suppressions (
    child_id,
    parent_user_id,
    misspelled_word,
    corrected_word
  );

create index if not exists writing_false_positive_suppressions_child_idx
  on public.writing_false_positive_suppressions (child_id, created_at desc);

grant select, insert, update, delete on public.writing_false_positive_suppressions to authenticated;

alter table public.writing_false_positive_suppressions enable row level security;

drop policy if exists writing_false_positive_suppressions_parent_access
  on public.writing_false_positive_suppressions;
create policy writing_false_positive_suppressions_parent_access
on public.writing_false_positive_suppressions
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

commit;
