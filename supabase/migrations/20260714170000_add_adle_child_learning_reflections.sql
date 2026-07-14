-- Private child-authored learning notes. These rows are deliberately separate
-- from ADLE attempt, evidence, mastery, schedule, intake and reward storage.

create table if not exists public.adle_child_learning_reflections (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  daily_assignment_id uuid not null references public.daily_assignments(id) on delete cascade,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  content_version text not null,
  prompt_key text not null,
  prompt_text text not null,
  reflection_text text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_child_learning_reflections_content_check check (
    btrim(content_version) <> '' and
    btrim(prompt_key) <> '' and
    btrim(prompt_text) <> '' and
    char_length(btrim(reflection_text)) between 1 and 2000
  ),
  constraint adle_child_learning_reflections_assignment_prompt_unique
    unique (daily_assignment_id, prompt_key)
);

create index if not exists adle_child_learning_reflections_child_created_idx
  on public.adle_child_learning_reflections(child_id, created_at desc);

alter table public.adle_child_learning_reflections enable row level security;

drop policy if exists adle_child_learning_reflections_parent_select on public.adle_child_learning_reflections;
create policy adle_child_learning_reflections_parent_select
  on public.adle_child_learning_reflections
  for select
  to authenticated
  using (parent_user_id = auth.uid());

revoke all on table public.adle_child_learning_reflections from anon, authenticated;
grant select on table public.adle_child_learning_reflections to authenticated;
grant all on table public.adle_child_learning_reflections to service_role;
