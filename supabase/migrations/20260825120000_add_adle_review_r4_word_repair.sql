-- R4 only: inactive durable Word Reflection & Repair state and versioned
-- learner-word Memory Cues. No scheduler, final Review outcome, authentic-use,
-- assignment completion, mastery, taught-history, or reward authority is added.

alter table public.adle_assignment_attempt_events
  drop constraint if exists adle_assignment_attempt_events_kind_check;
alter table public.adle_assignment_attempt_events
  add constraint adle_assignment_attempt_events_kind_check
  check (attempt_kind = any (array[
    'review_production', 'lesson_production', 'lesson_dictation',
    'lesson_probe', 'guided_practice', 'reflection_retry', 'repair_retry'
  ]));

alter table public.adle_assignment_attempt_events
  drop constraint if exists adle_assignment_attempt_events_class_check;
alter table public.adle_assignment_attempt_events
  add constraint adle_assignment_attempt_events_class_check
  check (evidence_class = any (array[
    'scheduled_review_attempt', 'first_exposure_lesson_attempt',
    'diagnostic_probe_attempt', 'guided_practice_attempt',
    'reflection_attempt', 'immediate_repair_attempt'
  ]));

create table if not exists public.adle_review_memory_cue_versions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  canonical_word_id uuid not null
    references public.canonical_teaching_dictionary_words(id) on delete restrict,
  spelling_authority_reference_id text not null,
  spelling_authority_version text not null,
  tricky_grapheme_start integer not null,
  tricky_grapheme_end integer not null,
  selected_tricky_text text not null,
  cue_text text not null,
  source_review_encounter_id uuid not null
    references public.adle_review_word_encounters(id) on delete restrict,
  version_number integer not null,
  supersedes_cue_version_id uuid
    references public.adle_review_memory_cue_versions(id) on delete restrict,
  version_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  superseded_at timestamptz,
  constraint adle_review_memory_cue_version_unique unique (
    child_id, canonical_word_id, spelling_authority_reference_id,
    spelling_authority_version, version_number
  ),
  constraint adle_review_memory_cue_authority_check check (
    btrim(spelling_authority_reference_id) <> '' and
    btrim(spelling_authority_version) <> ''
  ),
  constraint adle_review_memory_cue_span_check check (
    tricky_grapheme_start >= 0 and
    tricky_grapheme_end > tricky_grapheme_start and
    btrim(selected_tricky_text) <> ''
  ),
  constraint adle_review_memory_cue_text_check check (
    btrim(cue_text) <> '' and char_length(cue_text) <= 240
  ),
  constraint adle_review_memory_cue_version_check check (version_number >= 1),
  constraint adle_review_memory_cue_status_check check (
    version_status in ('active', 'superseded')
  ),
  constraint adle_review_memory_cue_status_time_check check (
    (version_status = 'active' and superseded_at is null) or
    (version_status = 'superseded' and superseded_at is not null)
  )
);

create unique index if not exists adle_review_memory_cue_one_active_idx
  on public.adle_review_memory_cue_versions(
    child_id, canonical_word_id, spelling_authority_reference_id,
    spelling_authority_version
  ) where version_status = 'active';

create index if not exists adle_review_memory_cue_history_idx
  on public.adle_review_memory_cue_versions(
    child_id, canonical_word_id, spelling_authority_reference_id,
    spelling_authority_version, version_number desc
  );

create or replace function public.prevent_adle_review_memory_cue_content_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.child_id is distinct from new.child_id
    or old.canonical_word_id is distinct from new.canonical_word_id
    or old.spelling_authority_reference_id is distinct from new.spelling_authority_reference_id
    or old.spelling_authority_version is distinct from new.spelling_authority_version
    or old.tricky_grapheme_start is distinct from new.tricky_grapheme_start
    or old.tricky_grapheme_end is distinct from new.tricky_grapheme_end
    or old.selected_tricky_text is distinct from new.selected_tricky_text
    or old.cue_text is distinct from new.cue_text
    or old.source_review_encounter_id is distinct from new.source_review_encounter_id
    or old.version_number is distinct from new.version_number
    or old.supersedes_cue_version_id is distinct from new.supersedes_cue_version_id
    or old.created_at is distinct from new.created_at
  then
    raise exception 'ADLE Review Memory Cue versions are immutable';
  end if;
  if old.version_status = 'superseded' and (
    new.version_status is distinct from old.version_status or
    new.superseded_at is distinct from old.superseded_at
  ) then
    raise exception 'Superseded ADLE Review Memory Cues are immutable';
  end if;
  return new;
end;
$$;

create trigger adle_review_memory_cue_content_immutable
before update on public.adle_review_memory_cue_versions
for each row execute function public.prevent_adle_review_memory_cue_content_rewrite();

create table if not exists public.adle_review_repair_attempts (
  id uuid primary key default gen_random_uuid(),
  review_encounter_id uuid not null
    references public.adle_review_word_encounters(id) on delete restrict,
  attempt_number integer not null,
  attempt_text text not null,
  is_correct boolean not null,
  assignment_attempt_event_id uuid not null
    references public.adle_assignment_attempt_events(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_repair_attempt_number_unique
    unique (review_encounter_id, attempt_number),
  constraint adle_review_repair_attempt_number_check check (attempt_number in (1, 2)),
  constraint adle_review_repair_attempt_text_check check (btrim(attempt_text) <> '')
);

create or replace function public.prevent_adle_review_repair_attempt_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'ADLE Review repair attempts are append-only';
end;
$$;

create trigger adle_review_repair_attempts_append_only
before update or delete on public.adle_review_repair_attempts
for each row execute function public.prevent_adle_review_repair_attempt_mutation();

alter table public.adle_review_word_encounters
  add column if not exists repair_stage text,
  add column if not exists repair_tricky_grapheme_start integer,
  add column if not exists repair_tricky_grapheme_end integer,
  add column if not exists repair_tricky_text text,
  add column if not exists repair_memory_cue_version_id uuid
    references public.adle_review_memory_cue_versions(id) on delete restrict,
  add column if not exists repair_attempt_count integer not null default 0;

alter table public.adle_review_word_encounters
  drop constraint if exists adle_review_word_encounters_repair_stage_check;
alter table public.adle_review_word_encounters
  add constraint adle_review_word_encounters_repair_stage_check check (
    repair_stage is null or repair_stage in (
      'compare', 'tricky_part', 'memory_cue', 'look', 'cover',
      'try_again', 'terminal'
    )
  );
alter table public.adle_review_word_encounters
  drop constraint if exists adle_review_word_encounters_repair_span_check;
alter table public.adle_review_word_encounters
  add constraint adle_review_word_encounters_repair_span_check check (
    (repair_tricky_grapheme_start is null and
      repair_tricky_grapheme_end is null and repair_tricky_text is null) or
    (repair_tricky_grapheme_start >= 0 and
      repair_tricky_grapheme_end > repair_tricky_grapheme_start and
      btrim(repair_tricky_text) <> '')
  );
alter table public.adle_review_word_encounters
  drop constraint if exists adle_review_word_encounters_repair_attempt_count_check;
alter table public.adle_review_word_encounters
  add constraint adle_review_word_encounters_repair_attempt_count_check
    check (repair_attempt_count between 0 and 2);
alter table public.adle_review_word_encounters
  drop constraint if exists adle_review_word_encounters_repair_detail_check;
alter table public.adle_review_word_encounters
  add constraint adle_review_word_encounters_repair_detail_check check (
    (repair_stage is null and repair_attempt_count = 0 and
      repair_memory_cue_version_id is null and
      repair_state in ('not_required', 'required')) or
    (original_outcome = 'failure' and (
      (repair_state = 'in_progress' and repair_stage in (
        'compare', 'tricky_part', 'memory_cue', 'look', 'cover', 'try_again'
      )) or
      (repair_state in ('completed_correct', 'attempted_not_secured') and
        repair_stage = 'terminal')
    ))
  );

create or replace function public.prevent_adle_review_repair_terminal_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.repair_attempt_count < old.repair_attempt_count then
    raise exception 'ADLE Review repair attempt count cannot decrease';
  end if;
  if old.repair_state in ('completed_correct', 'attempted_not_secured') and (
    new.repair_state is distinct from old.repair_state or
    new.repair_stage is distinct from old.repair_stage or
    new.repair_terminal_at is distinct from old.repair_terminal_at or
    new.repair_tricky_grapheme_start is distinct from old.repair_tricky_grapheme_start or
    new.repair_tricky_grapheme_end is distinct from old.repair_tricky_grapheme_end or
    new.repair_tricky_text is distinct from old.repair_tricky_text or
    new.repair_memory_cue_version_id is distinct from old.repair_memory_cue_version_id or
    new.repair_attempt_count is distinct from old.repair_attempt_count
  ) then
    raise exception 'Terminal ADLE Review repair state is immutable';
  end if;
  return new;
end;
$$;

create trigger adle_review_repair_terminal_immutable
before update on public.adle_review_word_encounters
for each row execute function public.prevent_adle_review_repair_terminal_rewrite();

alter table public.adle_review_transition_receipts
  drop constraint if exists adle_review_transition_receipts_kind_check;
alter table public.adle_review_transition_receipts
  add constraint adle_review_transition_receipts_kind_check
  check (transition_kind = any (array[
    'select_prompt', 'start_writing', 'save_draft', 'extend_writing',
    'submit_writing', 'submit_audio_check', 'reveal_word',
    'confirm_writing_suggestion', 'answer_writing_attempt_question',
    'confirm_writing_span', 'begin_repair', 'move_to_tricky_part',
    'save_tricky_part', 'save_memory_cue', 'move_to_cover',
    'move_to_try_again', 'submit_repair_retry', 'complete_review'
  ]));

create or replace function public.transition_adle_review_repair_r4(
  p_review_session_id uuid,
  p_encounter_id uuid,
  p_snapshot_fingerprint text,
  p_transition_kind text,
  p_grapheme_start integer,
  p_grapheme_end integer,
  p_selected_text text,
  p_cue_text text,
  p_retain_cue_version_id uuid,
  p_response text,
  p_is_correct boolean,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.adle_review_sessions%rowtype;
  v_encounter public.adle_review_word_encounters%rowtype;
  v_receipt public.adle_review_transition_receipts%rowtype;
  v_target jsonb;
  v_target_word text;
  v_authority_reference text;
  v_authority_version text;
  v_request_fingerprint text;
  v_cue public.adle_review_memory_cue_versions%rowtype;
  v_previous_cue public.adle_review_memory_cue_versions%rowtype;
  v_version_number integer;
  v_attempt_number integer;
  v_attempt_event_id uuid;
  v_terminal_state text;
begin
  if p_transition_kind not in (
      'begin_repair', 'move_to_tricky_part', 'save_tricky_part',
      'save_memory_cue', 'move_to_cover', 'move_to_try_again',
      'submit_repair_retry'
    ) or nullif(btrim(p_snapshot_fingerprint), '') is null
    or nullif(btrim(p_idempotency_key), '') is null
  then raise exception 'invalid_review_repair_transition'; end if;

  select * into v_session from public.adle_review_sessions
  where id = p_review_session_id for update;
  if not found or v_session.snapshot_fingerprint <> p_snapshot_fingerprint
    or v_session.submitted_writing_text is null
  then raise exception 'review_session_not_ready_for_repair'; end if;
  select * into v_encounter from public.adle_review_word_encounters
  where id = p_encounter_id and review_session_id = p_review_session_id for update;
  if not found then raise exception 'review_encounter_not_found'; end if;

  select target into v_target
  from public.daily_assignments assignment,
    jsonb_array_elements(assignment.compiled_review_snapshot->'targets') target
  where assignment.id = v_session.daily_assignment_id
    and target->>'encounterId' = p_encounter_id::text;
  if v_target is null then raise exception 'review_snapshot_target_not_found'; end if;
  v_target_word := v_target->>'canonicalSpelling';
  v_authority_reference := v_target#>>'{answerAuthority,referenceId}';
  v_authority_version := v_target#>>'{answerAuthority,version}';
  if nullif(btrim(v_target_word), '') is null
    or nullif(btrim(v_authority_reference), '') is null
    or nullif(btrim(v_authority_version), '') is null
  then raise exception 'review_snapshot_answer_authority_invalid'; end if;

  v_request_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'kind', p_transition_kind, 'sessionId', p_review_session_id,
    'encounterId', p_encounter_id, 'snapshotFingerprint', p_snapshot_fingerprint,
    'graphemeStart', p_grapheme_start, 'graphemeEnd', p_grapheme_end,
    'selectedText', p_selected_text, 'cueText', p_cue_text,
    'retainCueVersionId', p_retain_cue_version_id,
    'response', p_response, 'isCorrect', p_is_correct
  )::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.adle_review_transition_receipts
  where review_session_id = p_review_session_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_request_fingerprint
      or v_receipt.transition_kind <> p_transition_kind
    then raise exception 'review_idempotency_conflict'; end if;
    return jsonb_build_object('ok', true, 'replayed', true,
      'stateVersion', v_receipt.resulting_state_version);
  end if;

  if v_encounter.original_outcome <> 'failure' then
    raise exception 'repair_not_eligible';
  end if;

  if p_transition_kind = 'begin_repair' then
    if v_encounter.repair_state <> 'required' or v_encounter.repair_stage is not null
    then raise exception 'repair_not_eligible'; end if;
    if exists (
      select 1 from public.adle_review_word_encounters earlier
      where earlier.review_session_id = p_review_session_id
        and earlier.target_order < v_encounter.target_order
        and earlier.original_outcome = 'failure'
        and earlier.repair_state not in ('completed_correct', 'attempted_not_secured')
    ) then raise exception 'repair_order_conflict'; end if;
    update public.adle_review_word_encounters set
      repair_state = 'in_progress', repair_stage = 'compare',
      revealed_at = coalesce(revealed_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
    where id = p_encounter_id;
  elsif p_transition_kind = 'move_to_tricky_part' then
    if v_encounter.repair_state <> 'in_progress' or v_encounter.repair_stage <> 'compare'
    then raise exception 'repair_transition_conflict'; end if;
    update public.adle_review_word_encounters set repair_stage = 'tricky_part',
      updated_at = timezone('utc', now()) where id = p_encounter_id;
  elsif p_transition_kind = 'save_tricky_part' then
    if v_encounter.repair_state <> 'in_progress' or v_encounter.repair_stage <> 'tricky_part'
      or p_grapheme_start is null or p_grapheme_end is null
      or p_grapheme_start < 0 or p_grapheme_end <= p_grapheme_start
      or nullif(p_selected_text, '') is null or position(p_selected_text in v_target_word) = 0
    then raise exception 'invalid_grapheme_span'; end if;
    update public.adle_review_word_encounters set
      repair_stage = 'memory_cue',
      repair_tricky_grapheme_start = p_grapheme_start,
      repair_tricky_grapheme_end = p_grapheme_end,
      repair_tricky_text = p_selected_text,
      updated_at = timezone('utc', now())
    where id = p_encounter_id;
  elsif p_transition_kind = 'save_memory_cue' then
    if v_encounter.repair_state <> 'in_progress' or v_encounter.repair_stage <> 'memory_cue'
      or v_encounter.repair_tricky_grapheme_start is null
    then raise exception 'repair_transition_conflict'; end if;
    if p_retain_cue_version_id is not null then
      select * into v_cue from public.adle_review_memory_cue_versions
      where id = p_retain_cue_version_id and child_id = v_session.child_id
        and canonical_word_id = v_encounter.canonical_word_id
        and spelling_authority_reference_id = v_authority_reference
        and spelling_authority_version = v_authority_version
        and tricky_grapheme_start = v_encounter.repair_tricky_grapheme_start
        and tricky_grapheme_end = v_encounter.repair_tricky_grapheme_end
        and selected_tricky_text = v_encounter.repair_tricky_text
        and version_status = 'active';
      if not found then raise exception 'memory_cue_not_eligible'; end if;
    else
      if nullif(btrim(p_cue_text), '') is null or char_length(btrim(p_cue_text)) > 240
      then raise exception 'invalid_memory_cue'; end if;
      select * into v_previous_cue from public.adle_review_memory_cue_versions
      where child_id = v_session.child_id
        and canonical_word_id = v_encounter.canonical_word_id
        and spelling_authority_reference_id = v_authority_reference
        and spelling_authority_version = v_authority_version
        and version_status = 'active' for update;
      select coalesce(max(version_number), 0) + 1 into v_version_number
      from public.adle_review_memory_cue_versions
      where child_id = v_session.child_id
        and canonical_word_id = v_encounter.canonical_word_id
        and spelling_authority_reference_id = v_authority_reference
        and spelling_authority_version = v_authority_version;
      if v_previous_cue.id is not null then
        update public.adle_review_memory_cue_versions set
          version_status = 'superseded', superseded_at = timezone('utc', now())
        where id = v_previous_cue.id;
      end if;
      insert into public.adle_review_memory_cue_versions(
        child_id, canonical_word_id, spelling_authority_reference_id,
        spelling_authority_version, tricky_grapheme_start, tricky_grapheme_end,
        selected_tricky_text, cue_text, source_review_encounter_id,
        version_number, supersedes_cue_version_id
      ) values (
        v_session.child_id, v_encounter.canonical_word_id, v_authority_reference,
        v_authority_version, v_encounter.repair_tricky_grapheme_start,
        v_encounter.repair_tricky_grapheme_end, v_encounter.repair_tricky_text,
        btrim(p_cue_text), p_encounter_id, v_version_number, v_previous_cue.id
      ) returning * into v_cue;
    end if;
    update public.adle_review_word_encounters set
      repair_stage = 'look', repair_memory_cue_version_id = v_cue.id,
      updated_at = timezone('utc', now()) where id = p_encounter_id;
  elsif p_transition_kind = 'move_to_cover' then
    if v_encounter.repair_state <> 'in_progress' or v_encounter.repair_stage <> 'look'
      or v_encounter.repair_memory_cue_version_id is null
    then raise exception 'repair_transition_conflict'; end if;
    update public.adle_review_word_encounters set repair_stage = 'cover',
      updated_at = timezone('utc', now()) where id = p_encounter_id;
  elsif p_transition_kind = 'move_to_try_again' then
    if v_encounter.repair_state <> 'in_progress' or v_encounter.repair_stage <> 'cover'
    then raise exception 'repair_transition_conflict'; end if;
    update public.adle_review_word_encounters set repair_stage = 'try_again',
      updated_at = timezone('utc', now()) where id = p_encounter_id;
  else
    if v_encounter.repair_state <> 'in_progress' or v_encounter.repair_stage <> 'try_again'
      or v_encounter.repair_attempt_count >= 2 or nullif(btrim(p_response), '') is null
      or p_is_correct is null
    then raise exception 'repair_retry_not_eligible'; end if;
    v_attempt_number := v_encounter.repair_attempt_count + 1;
    v_attempt_event_id := gen_random_uuid();
    insert into public.adle_assignment_attempt_events(
      id, child_id, parent_user_id, daily_assignment_id, assignment_item_id,
      canonical_word_id, micro_skill_key, section_key, template_key,
      target_word, attempt_text, is_correct, attempt_kind, evidence_class, source_ref
    ) values (
      v_attempt_event_id, v_session.child_id, v_session.parent_user_id,
      v_session.daily_assignment_id, v_session.assignment_item_id,
      v_encounter.canonical_word_id, null, 'review_word_repair',
      'review_immediate_repair_retry', v_target_word, btrim(p_response), p_is_correct,
      'repair_retry', 'immediate_repair_attempt',
      'review-r4:' || p_review_session_id::text || ':repair:' || p_encounter_id::text || ':' || v_attempt_number::text
    );
    insert into public.adle_review_repair_attempts(
      review_encounter_id, attempt_number, attempt_text, is_correct,
      assignment_attempt_event_id
    ) values (
      p_encounter_id, v_attempt_number, btrim(p_response), p_is_correct,
      v_attempt_event_id
    );
    v_terminal_state := case
      when p_is_correct then 'completed_correct'
      when v_attempt_number = 2 then 'attempted_not_secured'
      else null
    end;
    update public.adle_review_word_encounters set
      repair_attempt_count = v_attempt_number,
      repair_stage = case when v_terminal_state is null then 'look' else 'terminal' end,
      repair_state = coalesce(v_terminal_state, 'in_progress'),
      repair_terminal_at = case when v_terminal_state is null
        then null else timezone('utc', now()) end,
      updated_at = timezone('utc', now())
    where id = p_encounter_id;
  end if;

  update public.adle_review_sessions set
    stage = case when exists (
      select 1 from public.adle_review_word_encounters
      where review_session_id = p_review_session_id
        and original_outcome = 'failure'
        and repair_state not in ('completed_correct', 'attempted_not_secured')
    ) then 'repair' else 'ready_to_complete' end,
    state_version = state_version + 1,
    updated_at = timezone('utc', now())
  where id = p_review_session_id returning * into v_session;

  insert into public.adle_review_transition_receipts(
    review_session_id, idempotency_key, transition_kind,
    request_fingerprint, resulting_state_version
  ) values (
    p_review_session_id, p_idempotency_key, p_transition_kind,
    v_request_fingerprint, v_session.state_version
  );
  return jsonb_build_object('ok', true, 'replayed', false,
    'stateVersion', v_session.state_version);
end;
$$;

revoke all on function public.transition_adle_review_repair_r4(
  uuid, uuid, text, text, integer, integer, text, text, uuid, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.transition_adle_review_repair_r4(
  uuid, uuid, text, text, integer, integer, text, text, uuid, text, boolean, text
) to service_role;

alter table public.adle_review_memory_cue_versions enable row level security;
alter table public.adle_review_repair_attempts enable row level security;
revoke all on table public.adle_review_memory_cue_versions from anon, authenticated;
revoke all on table public.adle_review_repair_attempts from anon, authenticated;
grant all on table public.adle_review_memory_cue_versions to service_role;
grant all on table public.adle_review_repair_attempts to service_role;
