begin;

create table if not exists public.parent_verifications (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  domain_module text not null,
  source_type text not null,
  source_entity_id text not null,
  task_submission_id uuid references public.task_submissions(id) on delete set null,
  writing_sample_id uuid references public.writing_samples(id) on delete set null,
  suggested_category_code text,
  suggested_micro_skill_key text,
  suggested_template_key text,
  suggestion_payload jsonb not null default '{}'::jsonb,
  decision text not null,
  verified_category_code text,
  verified_micro_skill_key text,
  verified_template_key text,
  verification_notes text,
  metadata jsonb not null default '{}'::jsonb,
  verified_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'parent_verifications_domain_module_check'
  ) then
    alter table public.parent_verifications
      add constraint parent_verifications_domain_module_check
      check (
        domain_module in (
          'spelling',
          'punctuation',
          'sentence_boundaries',
          'grammar',
          'vocabulary',
          'proofreading',
          'paragraph_revision',
          'writing_transfer'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'parent_verifications_decision_check'
  ) then
    alter table public.parent_verifications
      add constraint parent_verifications_decision_check
      check (
        decision in (
          'accepted',
          'overridden',
          'false_positive',
          'not_a_learning_issue'
        )
      );
  end if;
end $$;

create index if not exists parent_verifications_child_idx
  on public.parent_verifications (child_id, domain_module, verified_at desc);

create index if not exists parent_verifications_source_idx
  on public.parent_verifications (source_type, source_entity_id, verified_at desc);

grant select, insert, update, delete on public.parent_verifications to authenticated;

alter table public.parent_verifications enable row level security;

drop policy if exists parent_verifications_parent_access on public.parent_verifications;
create policy parent_verifications_parent_access
on public.parent_verifications
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

create table if not exists public.assignment_items (
  id uuid primary key default gen_random_uuid(),
  daily_assignment_id uuid references public.daily_assignments(id) on delete set null,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  domain_module text not null,
  item_type text not null,
  source_type text not null,
  source_entity_id text not null,
  learning_item_id uuid references public.learning_items(id) on delete set null,
  template_key text,
  target_word text,
  prompt_data jsonb not null default '{}'::jsonb,
  expected_answer jsonb,
  position integer not null default 0,
  status text not null default 'ready',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignment_items_domain_module_check'
  ) then
    alter table public.assignment_items
      add constraint assignment_items_domain_module_check
      check (
        domain_module in (
          'spelling',
          'punctuation',
          'sentence_boundaries',
          'grammar',
          'vocabulary',
          'proofreading',
          'paragraph_revision',
          'writing_transfer'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignment_items_status_check'
  ) then
    alter table public.assignment_items
      add constraint assignment_items_status_check
      check (status in ('pending', 'ready', 'completed', 'cancelled'));
  end if;
end $$;

create index if not exists assignment_items_daily_assignment_idx
  on public.assignment_items (daily_assignment_id, position);

create index if not exists assignment_items_child_idx
  on public.assignment_items (child_id, domain_module, created_at desc);

grant select, insert, update, delete on public.assignment_items to authenticated;

alter table public.assignment_items enable row level security;

drop policy if exists assignment_items_parent_access on public.assignment_items;
create policy assignment_items_parent_access
on public.assignment_items
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

commit;
