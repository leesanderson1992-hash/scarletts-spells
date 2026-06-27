begin;

create table if not exists public.child_word_treasures (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  canonical_word_id uuid,
  canonical_mapping_id uuid references public.spelling_canonical_mappings(id) on delete set null,
  corrected_word text not null,
  corrected_word_normalized text not null,
  original_misspelling text,
  source_issue_id uuid references public.writing_issues(id) on delete set null,
  source_learning_item_id uuid references public.learning_items(id) on delete set null,
  source_submission_id uuid references public.task_submissions(id) on delete set null,
  source_misspelling_instance_id uuid references public.misspelling_instances(id) on delete set null,
  micro_skill_key text,
  status text not null default 'golden_nugget',
  discovered_at timestamptz not null default timezone('utc', now()),
  correction_attempted_at timestamptz,
  entered_forge_at timestamptz,
  golden_bar_at timestamptz,
  authentic_correct_uses_after_forge integer not null default 0,
  required_uses_for_bar integer not null default 5,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint child_word_treasures_id_child_parent_key
    unique (id, child_id, parent_user_id),
  constraint child_word_treasures_status_check
    check (status in ('golden_nugget', 'in_forge', 'golden_bar')),
  constraint child_word_treasures_corrected_word_check
    check (btrim(corrected_word) <> '' and btrim(corrected_word_normalized) <> ''),
  constraint child_word_treasures_evidence_count_check
    check (authentic_correct_uses_after_forge >= 0),
  constraint child_word_treasures_required_uses_check
    check (required_uses_for_bar > 0),
  constraint child_word_treasures_forge_timestamp_check
    check (status <> 'in_forge' or entered_forge_at is not null),
  constraint child_word_treasures_gold_bar_timestamp_check
    check (status <> 'golden_bar' or golden_bar_at is not null),
  constraint child_word_treasures_gold_bar_after_forge_check
    check (golden_bar_at is null or entered_forge_at is not null)
);

create unique index if not exists child_word_treasures_child_word_uidx
  on public.child_word_treasures (child_id, corrected_word_normalized);

create index if not exists child_word_treasures_parent_child_status_idx
  on public.child_word_treasures (parent_user_id, child_id, status, updated_at desc);

create index if not exists child_word_treasures_source_issue_idx
  on public.child_word_treasures (source_issue_id)
  where source_issue_id is not null;

create index if not exists child_word_treasures_source_learning_item_idx
  on public.child_word_treasures (source_learning_item_id)
  where source_learning_item_id is not null;

create index if not exists child_word_treasures_canonical_mapping_idx
  on public.child_word_treasures (canonical_mapping_id)
  where canonical_mapping_id is not null;

create table if not exists public.child_word_treasure_events (
  id uuid primary key default gen_random_uuid(),
  treasure_id uuid not null,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  source_type text not null,
  source_entity_id uuid,
  previous_status text,
  new_status text,
  authentic_use_increment integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint child_word_treasure_events_type_check
    check (
      event_type in (
        'golden_nugget_created',
        'golden_nugget_updated',
        'entered_forge',
        'authentic_correct_use_recorded',
        'golden_bar_awarded'
      )
    ),
  constraint child_word_treasure_events_source_type_check
    check (btrim(source_type) <> ''),
  constraint child_word_treasure_events_previous_status_check
    check (previous_status is null or previous_status in ('golden_nugget', 'in_forge', 'golden_bar')),
  constraint child_word_treasure_events_new_status_check
    check (new_status is null or new_status in ('golden_nugget', 'in_forge', 'golden_bar')),
  constraint child_word_treasure_events_increment_check
    check (authentic_use_increment >= 0),
  constraint child_word_treasure_events_treasure_child_parent_fkey
    foreign key (treasure_id, child_id, parent_user_id)
    references public.child_word_treasures(id, child_id, parent_user_id)
    on delete cascade
);

create index if not exists child_word_treasure_events_treasure_created_idx
  on public.child_word_treasure_events (treasure_id, created_at desc);

create index if not exists child_word_treasure_events_parent_child_created_idx
  on public.child_word_treasure_events (parent_user_id, child_id, created_at desc);

create index if not exists child_word_treasure_events_source_idx
  on public.child_word_treasure_events (source_type, source_entity_id)
  where source_entity_id is not null;

create unique index if not exists child_word_treasure_events_source_uidx
  on public.child_word_treasure_events (treasure_id, event_type, source_type, source_entity_id)
  where source_entity_id is not null;

create or replace trigger set_child_word_treasures_updated_at
before update on public.child_word_treasures
for each row execute function public.set_updated_at();

alter table public.child_word_treasures enable row level security;
alter table public.child_word_treasure_events enable row level security;

revoke all on table public.child_word_treasures from public;
revoke all on table public.child_word_treasures from anon;
revoke all on table public.child_word_treasures from authenticated;
grant select on table public.child_word_treasures to authenticated;
grant all on table public.child_word_treasures to service_role;

revoke all on table public.child_word_treasure_events from public;
revoke all on table public.child_word_treasure_events from anon;
revoke all on table public.child_word_treasure_events from authenticated;
grant select on table public.child_word_treasure_events to authenticated;
grant all on table public.child_word_treasure_events to service_role;

drop policy if exists child_word_treasures_parent_select
  on public.child_word_treasures;
create policy child_word_treasures_parent_select
on public.child_word_treasures
for select
to authenticated
using (auth.uid() = parent_user_id);

drop policy if exists child_word_treasure_events_parent_select
  on public.child_word_treasure_events;
create policy child_word_treasure_events_parent_select
on public.child_word_treasure_events
for select
to authenticated
using (auth.uid() = parent_user_id);

commit;
