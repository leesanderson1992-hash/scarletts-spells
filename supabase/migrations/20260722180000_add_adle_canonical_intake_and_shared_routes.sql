begin;

-- Canonical-target intake lineage. The ADLE learning item remains the durable
-- child + canonical word + error-specific micro-skill identity; this table
-- preserves every reviewed spelling source that strengthened that identity.
create table if not exists public.adle_learning_item_sources (
  id uuid primary key default gen_random_uuid(),
  learning_item_id uuid not null references public.adle_learning_items(id) on delete cascade,
  parent_verified_candidate_mapping_id uuid references public.parent_verified_spelling_candidate_mappings(id) on delete restrict,
  canonical_mapping_id uuid references public.spelling_canonical_mappings(id) on delete restrict,
  misspelling_normalized text not null,
  correct_spelling_normalized text not null,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  source_ref text not null,
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_learning_item_sources_pair_check check (
    btrim(misspelling_normalized) <> '' and
    btrim(correct_spelling_normalized) <> '' and
    btrim(misspelling_normalized) <> btrim(correct_spelling_normalized)
  ),
  constraint adle_learning_item_sources_ref_check check (btrim(source_ref) <> ''),
  constraint adle_learning_item_sources_authority_check check (
    parent_verified_candidate_mapping_id is not null or canonical_mapping_id is not null
  ),
  constraint adle_learning_item_sources_row_status_check check (
    row_status = any (array['active', 'rejected', 'superseded'])
  )
);

create unique index if not exists adle_learning_item_sources_ref_idx
  on public.adle_learning_item_sources(learning_item_id, source_ref);
create index if not exists adle_learning_item_sources_candidate_idx
  on public.adle_learning_item_sources(parent_verified_candidate_mapping_id)
  where parent_verified_candidate_mapping_id is not null;
create index if not exists adle_learning_item_sources_canonical_mapping_idx
  on public.adle_learning_item_sources(canonical_mapping_id)
  where canonical_mapping_id is not null;

-- The resolver performs the richer readiness gate; this RPC makes the final
-- item + lineage persistence one idempotent transaction under a per-route
-- advisory lock. It cannot create catalog or dictionary truth.
create or replace function public.adle_persist_canonical_intake(
  p_child_id uuid,
  p_canonical_word_id uuid,
  p_micro_skill_key text,
  p_candidate_mapping_id uuid,
  p_canonical_mapping_id uuid,
  p_misspelling_normalized text,
  p_correct_spelling_normalized text,
  p_source_ref text,
  p_verified_on date
)
returns table (learning_item_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learning_item_id uuid;
  v_inserted boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    p_child_id::text || ':' || p_canonical_word_id::text || ':' || p_micro_skill_key,
    0
  ));

  if not exists (
    select 1 from public.parent_verified_spelling_candidate_mappings c
    where c.id = p_candidate_mapping_id
      and c.child_id = p_child_id
      and c.misspelling_normalized = p_misspelling_normalized
      and c.correct_spelling_normalized = p_correct_spelling_normalized
      and c.micro_skill_key = p_micro_skill_key
      and c.candidate_status = any (array['parent_local_promoted', 'global_canonical_promoted'])
  ) then
    raise exception 'canonical intake candidate identity is no longer approved';
  end if;

  if not exists (
    select 1 from public.canonical_teaching_dictionary_words w
    where w.id = p_canonical_word_id
      and w.normalised_word = p_correct_spelling_normalized
      and w.row_status = 'active'
      and w.review_status = 'approved_for_first_exposure'
  ) then
    raise exception 'canonical intake target identity is no longer assignment-approved';
  end if;

  select li.id into v_learning_item_id
  from public.adle_learning_items li
  where li.child_id = p_child_id
    and li.canonical_word_id = p_canonical_word_id
    and li.micro_skill_key = p_micro_skill_key
    and li.row_status = 'active'
  order by li.intake_on desc, li.id
  limit 1;

  if v_learning_item_id is null then
    insert into public.adle_learning_items (
      child_id, canonical_word_id, micro_skill_key, item_status, source_kind,
      source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status
    ) values (
      p_child_id, p_canonical_word_id, p_micro_skill_key, 'pending', 'verified_misspelling',
      p_source_ref, p_misspelling_normalized, false, null, p_verified_on, 'active'
    ) returning id into v_learning_item_id;
    v_inserted := true;
  end if;

  insert into public.adle_learning_item_sources (
    learning_item_id, parent_verified_candidate_mapping_id, canonical_mapping_id,
    misspelling_normalized, correct_spelling_normalized, micro_skill_key, source_ref, row_status
  ) values (
    v_learning_item_id, p_candidate_mapping_id, p_canonical_mapping_id,
    p_misspelling_normalized, p_correct_spelling_normalized, p_micro_skill_key, p_source_ref, 'active'
  ) on conflict do nothing;

  return query select v_learning_item_id, v_inserted;
end;
$$;

revoke all on function public.adle_persist_canonical_intake(uuid, uuid, text, uuid, uuid, text, text, text, date) from public, anon, authenticated;
grant execute on function public.adle_persist_canonical_intake(uuid, uuid, text, uuid, uuid, text, text, text, date) to service_role;

-- One child-facing schedule row remains canonical per child + word. These
-- links retain every error-specific learning route serviced by that review.
create table if not exists public.adle_review_schedule_word_routes (
  id uuid primary key default gen_random_uuid(),
  schedule_word_id uuid not null references public.adle_review_schedule_words(id) on delete cascade,
  learning_item_id uuid not null references public.adle_learning_items(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  attached_on date not null,
  attachment_ordinal integer not null,
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_schedule_word_routes_ordinal_check check (attachment_ordinal >= 1),
  constraint adle_review_schedule_word_routes_status_check check (
    row_status = any (array['active', 'superseded'])
  )
);

create unique index if not exists adle_review_schedule_word_routes_active_item_idx
  on public.adle_review_schedule_word_routes(schedule_word_id, learning_item_id)
  where row_status = 'active';
create index if not exists adle_review_schedule_word_routes_item_idx
  on public.adle_review_schedule_word_routes(learning_item_id)
  where row_status = 'active';

-- Append-only route attribution. The word attempt/outcome remains singular;
-- these rows show which learning routes consumed it without duplicating the
-- word-level evidence or reward event.
create table if not exists public.adle_review_outcome_event_routes (
  id uuid primary key default gen_random_uuid(),
  outcome_event_id uuid not null references public.adle_review_outcome_events(id) on delete cascade,
  learning_item_id uuid not null references public.adle_learning_items(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  unique (outcome_event_id, learning_item_id)
);

create table if not exists public.adle_assignment_attempt_event_routes (
  id uuid primary key default gen_random_uuid(),
  attempt_event_id uuid not null references public.adle_assignment_attempt_events(id) on delete cascade,
  learning_item_id uuid not null references public.adle_learning_items(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  unique (attempt_event_id, learning_item_id)
);

-- Cross-table identity guards: copied skill keys are audit snapshots, but
-- they must always agree with the linked learning item and shared word.
create or replace function public.adle_validate_schedule_word_route_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1
    from public.adle_learning_items li
    join public.adle_review_schedule_words sw on sw.id = new.schedule_word_id
    where li.id = new.learning_item_id
      and li.child_id = sw.child_id
      and li.canonical_word_id = sw.canonical_word_id
      and li.micro_skill_key = new.micro_skill_key
  ) then
    raise exception 'schedule route does not match learning-item child, word and micro-skill identity';
  end if;
  return new;
end;
$$;
drop trigger if exists adle_review_schedule_word_routes_identity_guard on public.adle_review_schedule_word_routes;
create trigger adle_review_schedule_word_routes_identity_guard
before insert or update on public.adle_review_schedule_word_routes
for each row execute function public.adle_validate_schedule_word_route_identity();

create or replace function public.adle_validate_outcome_route_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1
    from public.adle_learning_items li
    join public.adle_review_outcome_events oe on oe.id = new.outcome_event_id
    where li.id = new.learning_item_id
      and li.child_id = oe.child_id
      and li.canonical_word_id = oe.canonical_word_id
      and li.micro_skill_key = new.micro_skill_key
  ) then
    raise exception 'outcome route does not match learning-item child, word and micro-skill identity';
  end if;
  return new;
end;
$$;
drop trigger if exists adle_review_outcome_event_routes_identity_guard on public.adle_review_outcome_event_routes;
create trigger adle_review_outcome_event_routes_identity_guard
before insert or update on public.adle_review_outcome_event_routes
for each row execute function public.adle_validate_outcome_route_identity();

create or replace function public.adle_validate_attempt_route_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1
    from public.adle_learning_items li
    join public.adle_assignment_attempt_events ae on ae.id = new.attempt_event_id
    where li.id = new.learning_item_id
      and li.child_id = ae.child_id
      and li.canonical_word_id = ae.canonical_word_id
      and li.micro_skill_key = new.micro_skill_key
  ) then
    raise exception 'attempt route does not match learning-item child, word and micro-skill identity';
  end if;
  return new;
end;
$$;
drop trigger if exists adle_assignment_attempt_event_routes_identity_guard on public.adle_assignment_attempt_event_routes;
create trigger adle_assignment_attempt_event_routes_identity_guard
before insert or update on public.adle_assignment_attempt_event_routes
for each row execute function public.adle_validate_attempt_route_identity();

-- A later lesson for a different route reopens the shared word schedule. This
-- is lifecycle/audit evidence only and is never priced as a production.
alter table public.adle_review_outcome_events
  drop constraint if exists adle_review_outcome_events_type_check;
alter table public.adle_review_outcome_events
  add constraint adle_review_outcome_events_type_check check (event_type = any (array[
    'review_pass', 'review_fail', 'retest_pass', 'retest_fail', 'ejected',
    'reteach_priority_flagged', 'paused_parent_review',
    'retirement_check_scheduled', 'retirement_check_pass',
    'retirement_check_fail', 'retired', 'reactivated_for_new_skill'
  ]));

alter table public.adle_learning_item_sources enable row level security;
alter table public.adle_review_schedule_word_routes enable row level security;
alter table public.adle_review_outcome_event_routes enable row level security;
alter table public.adle_assignment_attempt_event_routes enable row level security;

revoke all on table public.adle_learning_item_sources from anon, authenticated;
revoke all on table public.adle_review_schedule_word_routes from anon, authenticated;
revoke all on table public.adle_review_outcome_event_routes from anon, authenticated;
revoke all on table public.adle_assignment_attempt_event_routes from anon, authenticated;
grant all on table public.adle_learning_item_sources to service_role;
grant all on table public.adle_review_schedule_word_routes to service_role;
grant all on table public.adle_review_outcome_event_routes to service_role;
grant all on table public.adle_assignment_attempt_event_routes to service_role;

commit;
