-- R1 only: inactive foundations for the canonical Review Writing Challenge.
-- This migration creates no assignments, writes no learner runtime rows, and
-- does not switch the forward assignment or scheduler authorities.

create or replace function public.adle_review_snapshot_is_structurally_valid_v3(
  p_snapshot jsonb
) returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_challenge_types text[];
begin
  if jsonb_typeof(p_snapshot) <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot)) <> 13
    or p_snapshot->>'snapshotSchemaVersion' <> 'review_snapshot_v3'
    or p_snapshot->>'compilerVersion' <> 'adle_review_snapshot_compiler_v3'
    or p_snapshot->>'validatorVersion' <> 'adle_review_snapshot_validator_v3'
    or p_snapshot->>'contractRegistryVersion' <> 'adle_review_contracts_v1'
    or jsonb_typeof(p_snapshot->'assignment') <> 'object'
    or p_snapshot#>>'{assignment,generationSource}' <> 'adle_review_writing_challenge_v3'
    or nullif(btrim(p_snapshot#>>'{assignment,assignmentId}'), '') is null
    or nullif(btrim(p_snapshot#>>'{assignment,reviewItemId}'), '') is null
    or jsonb_typeof(p_snapshot->'targets') <> 'array'
    or jsonb_array_length(p_snapshot->'targets') not between 1 and 10
    or jsonb_typeof(p_snapshot->'promptCandidates') <> 'array'
    or jsonb_array_length(p_snapshot->'promptCandidates') <> 5
    or jsonb_typeof(p_snapshot->'timerPolicy') <> 'object'
    or (p_snapshot#>>'{timerPolicy,writingDurationSeconds}')::integer <> 600
    or p_snapshot#>'{timerPolicy,extensionOptionsSeconds}' <> '[300,600,900]'::jsonb
    or (p_snapshot#>>'{timerPolicy,maximumExtensions}')::integer <> 1
    or (p_snapshot#>>'{timerPolicy,parentReauthenticationRequired}')::boolean is not true
    or p_snapshot#>>'{timerPolicy,scope}' <> 'creative_writing_only'
    or jsonb_typeof(p_snapshot->'activitySequence') <> 'array'
    or jsonb_array_length(p_snapshot->'activitySequence') <> 5
    or p_snapshot#>>'{completionContract,targetProgressRole}' <> 'challenge_progress_only'
    or p_snapshot#>>'{completionContract,perfectProgressRole}' <> 'achievement_only'
    or (p_snapshot#>>'{completionContract,requireOriginalOutcomeForEveryTarget}')::boolean is not true
    or (p_snapshot#>>'{completionContract,requireTerminalRepairForEveryFailure}')::boolean is not true
    or jsonb_typeof(p_snapshot->'contentVersions') <> 'array'
    or jsonb_typeof(p_snapshot->'provenance') <> 'object'
    or p_snapshot#>>'{provenance,sourceKind}' <> 'compiled_review_assignment'
    or p_snapshot#>>'{provenance,fingerprintAlgorithm}' <> 'sha256'
    or (p_snapshot#>>'{provenance,fingerprintVersion}')::integer <> 1
    or coalesce(p_snapshot#>>'{provenance,sourceFingerprint}', '') !~ '^[a-f0-9]{64}$'
  then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_snapshot->'targets') with ordinality target(value, position)
    where target.value->>'contractVersion' <> '3'
      or nullif(btrim(target.value->>'encounterId'), '') is null
      or nullif(btrim(target.value->>'canonicalWordId'), '') is null
      or nullif(btrim(target.value->>'canonicalSpelling'), '') is null
      or (target.value->>'order')::integer <> target.position
      or nullif(btrim(target.value#>>'{schedule,scheduleWordId}'), '') is null
      or nullif(btrim(target.value#>>'{schedule,schedulePolicyVersion}'), '') is null
      or nullif(btrim(target.value#>>'{schedule,wordScheduleVersion}'), '') is null
  ) or (
    select count(distinct value->>'encounterId')
    from jsonb_array_elements(p_snapshot->'targets')
  ) <> jsonb_array_length(p_snapshot->'targets') or (
    select count(distinct value->>'canonicalWordId')
    from jsonb_array_elements(p_snapshot->'targets')
  ) <> jsonb_array_length(p_snapshot->'targets') or (
    select count(distinct value#>>'{schedule,scheduleWordId}')
    from jsonb_array_elements(p_snapshot->'targets')
  ) <> jsonb_array_length(p_snapshot->'targets') then
    return false;
  end if;

  select array_agg(value->>'challengeType' order by value->>'challengeType')
  into v_challenge_types
  from jsonb_array_elements(p_snapshot->'promptCandidates');

  if v_challenge_types <> array[
      'conundrums',
      'fortunately_unfortunately',
      'persuasion',
      'reflection',
      'stories'
    ]::text[]
    or not (p_snapshot->>'initialChallengeType' = any(v_challenge_types))
    or exists (
      select 1
      from jsonb_array_elements(p_snapshot->'promptCandidates') prompt
      where prompt->>'contractVersion' <> '3'
        or nullif(btrim(prompt->>'promptVersionId'), '') is null
        or nullif(btrim(prompt->>'stablePromptKey'), '') is null
        or nullif(btrim(prompt->>'promptText'), '') is null
        or nullif(btrim(prompt->>'instructionText'), '') is null
        or case
          when prompt->>'challengeType' = 'reflection'
            then prompt->>'reusePolicy' <> 'reusable_lru_no_immediate_repeat'
          else prompt->>'reusePolicy' <> 'once_per_learner'
        end
    )
  then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.adle_review_snapshot_is_structurally_valid_v3(jsonb)
from public, anon, authenticated;
grant execute on function public.adle_review_snapshot_is_structurally_valid_v3(jsonb)
to authenticated, service_role;

alter table public.daily_assignments
  add column if not exists compiled_review_snapshot jsonb null;

alter table public.daily_assignments
  drop constraint if exists daily_assignments_compiled_review_snapshot_v3_check;
alter table public.daily_assignments
  add constraint daily_assignments_compiled_review_snapshot_v3_check
  check (
    compiled_review_snapshot is null
    or public.adle_review_snapshot_is_structurally_valid_v3(compiled_review_snapshot)
  );

create index if not exists daily_assignments_compiled_review_snapshot_version_idx
  on public.daily_assignments ((compiled_review_snapshot->>'snapshotSchemaVersion'))
  where compiled_review_snapshot is not null;

create or replace function public.prevent_adle_compiled_review_snapshot_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.compiled_review_snapshot is distinct from new.compiled_review_snapshot then
    raise exception 'ADLE compiled Review snapshot is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists daily_assignments_compiled_review_snapshot_immutable
  on public.daily_assignments;
create trigger daily_assignments_compiled_review_snapshot_immutable
before update of compiled_review_snapshot on public.daily_assignments
for each row execute function public.prevent_adle_compiled_review_snapshot_update();

create table if not exists public.adle_review_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  stable_prompt_key text not null,
  challenge_type text not null,
  content_version text not null,
  prompt_text text not null,
  instruction_text text not null,
  configuration jsonb not null default '{}'::jsonb,
  reuse_policy text not null,
  release_reference text not null,
  source_fingerprint text not null,
  review_status text not null default 'draft',
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_prompt_versions_identity_unique
    unique (stable_prompt_key, content_version),
  constraint adle_review_prompt_versions_key_check
    check (btrim(stable_prompt_key) <> '' and btrim(content_version) <> ''),
  constraint adle_review_prompt_versions_challenge_check
    check (challenge_type = any (array[
      'conundrums', 'reflection', 'stories',
      'fortunately_unfortunately', 'persuasion'
    ])),
  constraint adle_review_prompt_versions_copy_check
    check (btrim(prompt_text) <> '' and btrim(instruction_text) <> ''),
  constraint adle_review_prompt_versions_configuration_check
    check (jsonb_typeof(configuration) = 'object'),
  constraint adle_review_prompt_versions_reuse_check
    check (
      (challenge_type = 'reflection' and reuse_policy = 'reusable_lru_no_immediate_repeat')
      or
      (challenge_type <> 'reflection' and reuse_policy = 'once_per_learner')
    ),
  constraint adle_review_prompt_versions_authority_check
    check (
      btrim(release_reference) <> ''
      and source_fingerprint ~ '^[a-f0-9]{64}$'
    ),
  constraint adle_review_prompt_versions_review_status_check
    check (review_status = any (array[
      'draft', 'in_review', 'approved', 'rejected', 'superseded'
    ])),
  constraint adle_review_prompt_versions_row_status_check
    check (row_status = any (array['active', 'superseded', 'archived']))
);

create unique index if not exists adle_review_prompt_versions_one_approved_active_idx
  on public.adle_review_prompt_versions(stable_prompt_key)
  where review_status = 'approved' and row_status = 'active';
create index if not exists adle_review_prompt_versions_selection_idx
  on public.adle_review_prompt_versions(challenge_type, stable_prompt_key)
  where review_status = 'approved' and row_status = 'active';

create or replace function public.prevent_approved_adle_review_prompt_content_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.review_status = 'approved' and old.row_status = 'active' and (
    old.stable_prompt_key is distinct from new.stable_prompt_key
    or old.challenge_type is distinct from new.challenge_type
    or old.content_version is distinct from new.content_version
    or old.prompt_text is distinct from new.prompt_text
    or old.instruction_text is distinct from new.instruction_text
    or old.configuration is distinct from new.configuration
    or old.reuse_policy is distinct from new.reuse_policy
    or old.release_reference is distinct from new.release_reference
    or old.source_fingerprint is distinct from new.source_fingerprint
  ) then
    raise exception 'Approved ADLE Review prompt content is immutable; publish a new version';
  end if;
  return new;
end;
$$;

create trigger adle_review_prompt_versions_approved_content_immutable
before update on public.adle_review_prompt_versions
for each row execute function public.prevent_approved_adle_review_prompt_content_update();

create table if not exists public.adle_review_sessions (
  id uuid primary key default gen_random_uuid(),
  daily_assignment_id uuid not null
    references public.daily_assignments(id) on delete cascade,
  assignment_item_id uuid not null
    references public.assignment_items(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_fingerprint text not null,
  selected_prompt_version_id uuid
    references public.adle_review_prompt_versions(id) on delete restrict,
  selected_challenge_type text,
  stage text not null default 'challenge_selection',
  draft_text text not null default '',
  submitted_writing_text text,
  writing_started_at timestamptz,
  writing_deadline_at timestamptz,
  writing_submitted_at timestamptz,
  extension_seconds integer,
  extension_authorized_parent_user_id uuid
    references auth.users(id) on delete restrict,
  extension_authorized_at timestamptz,
  state_version integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_sessions_assignment_item_unique unique (assignment_item_id),
  constraint adle_review_sessions_fingerprint_check
    check (snapshot_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint adle_review_sessions_challenge_check
    check (selected_challenge_type is null or selected_challenge_type = any (array[
      'conundrums', 'reflection', 'stories',
      'fortunately_unfortunately', 'persuasion'
    ])),
  constraint adle_review_sessions_stage_check
    check (stage = any (array[
      'challenge_selection', 'creative_writing', 'retrieval_checks',
      'repair', 'ready_to_complete', 'completed'
    ])),
  constraint adle_review_sessions_extension_check
    check (
      (extension_seconds is null
        and extension_authorized_parent_user_id is null
        and extension_authorized_at is null)
      or
      (extension_seconds = any (array[300, 600, 900])
        and extension_authorized_parent_user_id = parent_user_id
        and extension_authorized_at is not null)
    ),
  constraint adle_review_sessions_timer_check
    check (
      (writing_started_at is null and writing_deadline_at is null)
      or
      (writing_started_at is not null and writing_deadline_at is not null
        and writing_deadline_at > writing_started_at)
    ),
  constraint adle_review_sessions_state_version_check check (state_version >= 0),
  constraint adle_review_sessions_completion_check
    check (
      (stage = 'completed' and completed_at is not null)
      or
      (stage <> 'completed' and completed_at is null)
    )
);

create index if not exists adle_review_sessions_child_open_idx
  on public.adle_review_sessions(child_id, created_at)
  where completed_at is null;

create or replace function public.prevent_adle_review_session_irreversible_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.daily_assignment_id is distinct from new.daily_assignment_id
    or old.assignment_item_id is distinct from new.assignment_item_id
    or old.child_id is distinct from new.child_id
    or old.parent_user_id is distinct from new.parent_user_id
    or old.snapshot_fingerprint is distinct from new.snapshot_fingerprint
  then
    raise exception 'ADLE Review session identity is immutable';
  end if;
  if old.writing_started_at is not null and (
    old.writing_started_at is distinct from new.writing_started_at
    or old.selected_prompt_version_id is distinct from new.selected_prompt_version_id
    or old.selected_challenge_type is distinct from new.selected_challenge_type
  ) then
    raise exception 'ADLE Review prompt choice is immutable after writing starts';
  end if;
  if old.extension_seconds is not null and (
    old.extension_seconds is distinct from new.extension_seconds
    or old.extension_authorized_parent_user_id is distinct from new.extension_authorized_parent_user_id
    or old.extension_authorized_at is distinct from new.extension_authorized_at
    or old.writing_deadline_at is distinct from new.writing_deadline_at
  ) then
    raise exception 'ADLE Review writing extension is single-use and immutable';
  end if;
  if old.submitted_writing_text is not null and (
    old.submitted_writing_text is distinct from new.submitted_writing_text
    or old.writing_submitted_at is distinct from new.writing_submitted_at
  ) then
    raise exception 'ADLE Review submitted writing is immutable';
  end if;
  if old.completed_at is not null and (
    old.completed_at is distinct from new.completed_at
    or old.stage is distinct from new.stage
  ) then
    raise exception 'ADLE Review completion is immutable';
  end if;
  return new;
end;
$$;

create trigger adle_review_sessions_irreversible_state_immutable
before update on public.adle_review_sessions
for each row execute function public.prevent_adle_review_session_irreversible_rewrite();

create table if not exists public.adle_review_word_encounters (
  id uuid primary key,
  review_session_id uuid not null
    references public.adle_review_sessions(id) on delete cascade,
  schedule_word_id uuid not null
    references public.adle_review_schedule_words(id) on delete restrict,
  canonical_word_id uuid not null
    references public.canonical_teaching_dictionary_words(id) on delete restrict,
  target_order integer not null,
  writing_disposition text,
  original_outcome text not null default 'pending',
  original_outcome_source text,
  attribution_algorithm_version text,
  attribution_provenance jsonb,
  original_attempt_event_id uuid
    references public.adle_assignment_attempt_events(id) on delete restrict,
  review_outcome_event_id uuid
    references public.adle_review_outcome_events(id) on delete restrict,
  revealed_at timestamptz,
  repair_state text not null default 'not_required',
  repair_terminal_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_word_encounters_session_word_unique
    unique (review_session_id, canonical_word_id),
  constraint adle_review_word_encounters_session_schedule_unique
    unique (review_session_id, schedule_word_id),
  constraint adle_review_word_encounters_session_order_unique
    unique (review_session_id, target_order),
  constraint adle_review_word_encounters_order_check
    check (target_order between 1 and 10),
  constraint adle_review_word_encounters_disposition_check
    check (writing_disposition is null or writing_disposition = any (array[
      'correct_in_writing', 'attributable_misspelling', 'unaccounted_for'
    ])),
  constraint adle_review_word_encounters_outcome_check
    check (original_outcome = any (array['pending', 'success', 'failure'])),
  constraint adle_review_word_encounters_source_check
    check (original_outcome_source is null or original_outcome_source = any (array[
      'writing', 'audio_retrieval_check'
    ])),
  constraint adle_review_word_encounters_original_state_check
    check (
      (writing_disposition is null
        and original_outcome = 'pending'
        and original_outcome_source is null)
      or
      (writing_disposition = 'correct_in_writing'
        and original_outcome = 'success'
        and original_outcome_source = 'writing')
      or
      (writing_disposition = 'attributable_misspelling'
        and original_outcome = 'failure'
        and original_outcome_source = 'writing')
      or
      (writing_disposition = 'unaccounted_for'
        and (
          (original_outcome = 'pending' and original_outcome_source is null)
          or
          (original_outcome in ('success', 'failure')
            and original_outcome_source = 'audio_retrieval_check')
        ))
    ),
  constraint adle_review_word_encounters_repair_state_check
    check (repair_state = any (array[
      'not_required', 'required', 'in_progress',
      'completed_correct', 'attempted_not_secured'
    ])),
  constraint adle_review_word_encounters_repair_outcome_check
    check (
      (original_outcome in ('pending', 'success') and repair_state = 'not_required'
        and repair_terminal_at is null)
      or
      (original_outcome = 'failure'
        and repair_state in ('required', 'in_progress')
        and repair_terminal_at is null)
      or
      (original_outcome = 'failure'
        and repair_state in ('completed_correct', 'attempted_not_secured')
        and repair_terminal_at is not null)
    ),
  constraint adle_review_word_encounters_attribution_check
    check (
      attribution_algorithm_version is null
      or (writing_disposition is not null and btrim(attribution_algorithm_version) <> '')
    ),
  constraint adle_review_word_encounters_attribution_provenance_check
    check (
      attribution_provenance is null
      or jsonb_typeof(attribution_provenance) = 'object'
    )
);

create index if not exists adle_review_word_encounters_session_idx
  on public.adle_review_word_encounters(review_session_id, target_order);
create index if not exists adle_review_word_encounters_schedule_idx
  on public.adle_review_word_encounters(schedule_word_id);

create or replace function public.prevent_adle_review_original_outcome_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.review_session_id is distinct from new.review_session_id
    or old.schedule_word_id is distinct from new.schedule_word_id
    or old.canonical_word_id is distinct from new.canonical_word_id
    or old.target_order is distinct from new.target_order
  then
    raise exception 'ADLE Review encounter identity is immutable';
  end if;
  if old.writing_disposition is not null and (
    old.writing_disposition is distinct from new.writing_disposition
    or old.attribution_algorithm_version is distinct from new.attribution_algorithm_version
    or old.attribution_provenance is distinct from new.attribution_provenance
  ) then
    raise exception 'ADLE Review writing disposition is immutable';
  end if;
  if old.original_outcome <> 'pending' and (
    old.original_outcome is distinct from new.original_outcome
    or old.original_outcome_source is distinct from new.original_outcome_source
    or old.original_attempt_event_id is distinct from new.original_attempt_event_id
    or old.review_outcome_event_id is distinct from new.review_outcome_event_id
  ) then
    raise exception 'ADLE Review original scheduled-retrieval outcome is immutable';
  end if;
  return new;
end;
$$;

create trigger adle_review_word_encounters_original_outcome_immutable
before update on public.adle_review_word_encounters
for each row execute function public.prevent_adle_review_original_outcome_rewrite();

create table if not exists public.adle_review_transition_receipts (
  id uuid primary key default gen_random_uuid(),
  review_session_id uuid not null
    references public.adle_review_sessions(id) on delete cascade,
  idempotency_key text not null,
  transition_kind text not null,
  request_fingerprint text not null,
  resulting_state_version integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_transition_receipts_semantic_unique
    unique (review_session_id, idempotency_key),
  constraint adle_review_transition_receipts_key_check
    check (btrim(idempotency_key) <> ''),
  constraint adle_review_transition_receipts_kind_check
    check (transition_kind = any (array[
      'select_prompt', 'start_writing', 'save_draft', 'extend_writing',
      'submit_writing', 'submit_audio_check', 'reveal_word',
      'save_tricky_part', 'save_memory_cue', 'submit_repair_retry',
      'complete_review'
    ])),
  constraint adle_review_transition_receipts_fingerprint_check
    check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint adle_review_transition_receipts_version_check
    check (resulting_state_version >= 0)
);

create index if not exists adle_review_transition_receipts_session_idx
  on public.adle_review_transition_receipts(review_session_id, created_at);

create or replace function public.prevent_adle_review_transition_receipt_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'ADLE Review transition receipts are append-only';
end;
$$;

create trigger adle_review_transition_receipts_append_only
before update or delete on public.adle_review_transition_receipts
for each row execute function public.prevent_adle_review_transition_receipt_mutation();

-- Nullable shadow state. Existing rows remain bundle-authoritative until the
-- later R5 convergence explicitly populates and activates this version.
alter table public.adle_review_schedule_words
  add column if not exists word_schedule_version text,
  add column if not exists word_interval_index integer,
  add column if not exists word_next_due_on date,
  add column if not exists word_schedule_policy_version text
    references public.adle_review_policy_versions(schedule_policy_version)
    on delete restrict;

alter table public.adle_review_schedule_words
  drop constraint if exists adle_review_schedule_words_word_authority_check;
alter table public.adle_review_schedule_words
  add constraint adle_review_schedule_words_word_authority_check
  check (
    (word_schedule_version is null
      and word_interval_index is null
      and word_next_due_on is null
      and word_schedule_policy_version is null)
    or
    (word_schedule_version = 'adle_review_per_word_schedule_v1'
      and word_interval_index >= 0
      and word_schedule_policy_version is not null
      and (
        (membership_status = 'scheduled' and word_next_due_on is not null)
        or
        (membership_status <> 'scheduled' and word_next_due_on is null)
      ))
  );

create index if not exists adle_review_schedule_words_per_word_due_idx
  on public.adle_review_schedule_words(child_id, word_next_due_on, canonical_word_id)
  where word_schedule_version = 'adle_review_per_word_schedule_v1'
    and row_status = 'active';

comment on column public.daily_assignments.compiled_review_snapshot is
  'Independent immutable Review Snapshot v3. Nullable until the later guarded Review writer is activated.';
comment on column public.adle_review_schedule_words.word_schedule_version is
  'Nullable R1 shadow authority. NULL preserves legacy bundle scheduling; R5 owns activation.';

alter table public.adle_review_prompt_versions enable row level security;
alter table public.adle_review_sessions enable row level security;
alter table public.adle_review_word_encounters enable row level security;
alter table public.adle_review_transition_receipts enable row level security;

revoke all on table public.adle_review_prompt_versions from anon, authenticated;
revoke all on table public.adle_review_sessions from anon, authenticated;
revoke all on table public.adle_review_word_encounters from anon, authenticated;
revoke all on table public.adle_review_transition_receipts from anon, authenticated;

grant all on table public.adle_review_prompt_versions to service_role;
grant all on table public.adle_review_sessions to service_role;
grant all on table public.adle_review_word_encounters to service_role;
grant all on table public.adle_review_transition_receipts to service_role;
