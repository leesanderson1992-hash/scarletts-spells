-- R3 only: inactive transactional submission boundaries for Review Writing
-- Challenge classification and audio-only retrieval checks. These functions
-- do not write scheduler outcomes, authentic-use evidence, rewards, taught
-- history, assignment completion, or assignment generation state.

create or replace function public.submit_adle_review_writing_r3(
  p_review_session_id uuid,
  p_snapshot_fingerprint text,
  p_submitted_writing_text text,
  p_dispositions jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.adle_review_sessions%rowtype;
  v_row jsonb;
  v_encounter public.adle_review_word_encounters%rowtype;
  v_disposition text;
  v_outcome text;
  v_attempt_id uuid;
  v_target_word text;
  v_request_fingerprint text;
  v_receipt public.adle_review_transition_receipts%rowtype;
begin
  if p_submitted_writing_text is null
    or nullif(btrim(p_snapshot_fingerprint), '') is null
    or nullif(btrim(p_idempotency_key), '') is null
    or jsonb_typeof(p_dispositions) <> 'array'
  then
    raise exception 'invalid_review_writing_submission';
  end if;

  select * into v_session
  from public.adle_review_sessions
  where id = p_review_session_id
  for update;
  if not found or v_session.snapshot_fingerprint <> p_snapshot_fingerprint then
    raise exception 'review_session_not_found_or_fingerprint_mismatch';
  end if;

  v_request_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'kind', 'submit_writing',
    'sessionId', p_review_session_id,
    'snapshotFingerprint', p_snapshot_fingerprint,
    'writing', p_submitted_writing_text,
    'dispositions', p_dispositions
  )::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_receipt
  from public.adle_review_transition_receipts
  where review_session_id = p_review_session_id
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_request_fingerprint
      or v_receipt.transition_kind <> 'submit_writing'
    then
      raise exception 'review_idempotency_conflict';
    end if;
    return jsonb_build_object('ok', true, 'replayed', true,
      'stateVersion', v_receipt.resulting_state_version);
  end if;

  if v_session.submitted_writing_text is not null then
    if v_session.submitted_writing_text is distinct from p_submitted_writing_text then
      raise exception 'writing_submission_conflict';
    end if;
    return jsonb_build_object('ok', true, 'replayed', true,
      'stateVersion', v_session.state_version);
  end if;

  if jsonb_array_length(p_dispositions) <> (
    select count(*) from public.adle_review_word_encounters
    where review_session_id = p_review_session_id
  ) or exists (
    select 1
    from jsonb_array_elements(p_dispositions) item
    where item->>'disposition' not in (
      'correct_in_writing', 'attributable_misspelling', 'unaccounted_for'
    )
      or nullif(btrim(item->>'encounterId'), '') is null
      or nullif(btrim(item->>'attributionAlgorithmVersion'), '') is null
      or jsonb_typeof(coalesce(item->'attributionProvenance', '{}'::jsonb)) <> 'object'
  ) or (
    select count(distinct item->>'encounterId')
    from jsonb_array_elements(p_dispositions) item
  ) <> jsonb_array_length(p_dispositions) then
    raise exception 'invalid_review_writing_dispositions';
  end if;

  for v_row in select value from jsonb_array_elements(p_dispositions)
  loop
    select * into v_encounter
    from public.adle_review_word_encounters
    where id = (v_row->>'encounterId')::uuid
      and review_session_id = p_review_session_id
    for update;
    if not found
      or v_encounter.writing_disposition is not null
      or v_encounter.original_outcome <> 'pending'
    then
      raise exception 'review_writing_encounter_conflict';
    end if;

    v_disposition := v_row->>'disposition';
    if v_disposition = 'unaccounted_for' then
      update public.adle_review_word_encounters
      set writing_disposition = v_disposition,
        attribution_algorithm_version = v_row->>'attributionAlgorithmVersion',
        attribution_provenance = coalesce(v_row->'attributionProvenance', '{}'::jsonb),
        updated_at = timezone('utc', now())
      where id = v_encounter.id;
      continue;
    end if;

    v_outcome := case when v_disposition = 'correct_in_writing'
      then 'success' else 'failure' end;
    select target->>'canonicalSpelling' into v_target_word
    from public.daily_assignments assignment,
      jsonb_array_elements(assignment.compiled_review_snapshot->'targets') target
    where assignment.id = v_session.daily_assignment_id
      and target->>'encounterId' = v_encounter.id::text;
    if nullif(btrim(v_target_word), '') is null then
      raise exception 'review_snapshot_target_not_found';
    end if;

    v_attempt_id := gen_random_uuid();
    insert into public.adle_assignment_attempt_events(
      id, child_id, parent_user_id, daily_assignment_id, assignment_item_id,
      canonical_word_id, micro_skill_key, section_key, template_key,
      target_word, attempt_text, is_correct, attempt_kind, evidence_class, source_ref
    ) values (
      v_attempt_id, v_session.child_id, v_session.parent_user_id,
      v_session.daily_assignment_id, v_session.assignment_item_id,
      v_encounter.canonical_word_id, null, 'review_writing_challenge',
      'review_free_writing', v_target_word,
      nullif(v_row#>>'{attributionProvenance,observedText}', ''),
      v_outcome = 'success', 'review_production', 'scheduled_review_attempt',
      'review-r3:' || p_review_session_id::text || ':writing:' || v_encounter.id::text
    );

    update public.adle_review_word_encounters
    set writing_disposition = v_disposition,
      original_outcome = v_outcome,
      original_outcome_source = 'writing',
      attribution_algorithm_version = v_row->>'attributionAlgorithmVersion',
      attribution_provenance = coalesce(v_row->'attributionProvenance', '{}'::jsonb),
      original_attempt_event_id = v_attempt_id,
      repair_state = case when v_outcome = 'failure' then 'required' else 'not_required' end,
      updated_at = timezone('utc', now())
    where id = v_encounter.id;
  end loop;

  update public.adle_review_sessions
  set submitted_writing_text = p_submitted_writing_text,
    writing_submitted_at = timezone('utc', now()),
    draft_text = p_submitted_writing_text,
    stage = case
      when exists (
        select 1 from public.adle_review_word_encounters
        where review_session_id = p_review_session_id
          and original_outcome = 'pending'
      ) then 'retrieval_checks'
      when exists (
        select 1 from public.adle_review_word_encounters
        where review_session_id = p_review_session_id
          and original_outcome = 'failure'
      ) then 'repair'
      else 'ready_to_complete'
    end,
    state_version = state_version + 1,
    updated_at = timezone('utc', now())
  where id = p_review_session_id
  returning * into v_session;

  insert into public.adle_review_transition_receipts(
    review_session_id, idempotency_key, transition_kind,
    request_fingerprint, resulting_state_version
  ) values (
    p_review_session_id, p_idempotency_key, 'submit_writing',
    v_request_fingerprint, v_session.state_version
  );

  return jsonb_build_object('ok', true, 'replayed', false,
    'stateVersion', v_session.state_version);
end;
$$;

create or replace function public.submit_adle_review_audio_check_r3(
  p_review_session_id uuid,
  p_encounter_id uuid,
  p_snapshot_fingerprint text,
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
  v_attempt public.adle_assignment_attempt_events%rowtype;
  v_attempt_id uuid;
  v_target_word text;
  v_request_fingerprint text;
  v_receipt public.adle_review_transition_receipts%rowtype;
begin
  if p_is_correct is null
    or nullif(btrim(p_snapshot_fingerprint), '') is null
    or nullif(btrim(p_response), '') is null
    or nullif(btrim(p_idempotency_key), '') is null
  then
    raise exception 'invalid_review_audio_submission';
  end if;

  select * into v_session from public.adle_review_sessions
  where id = p_review_session_id for update;
  if not found
    or v_session.snapshot_fingerprint <> p_snapshot_fingerprint
    or v_session.submitted_writing_text is null
  then
    raise exception 'review_session_not_ready_for_audio_check';
  end if;

  v_request_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'kind', 'submit_audio_check', 'sessionId', p_review_session_id,
    'encounterId', p_encounter_id, 'snapshotFingerprint', p_snapshot_fingerprint,
    'response', p_response, 'isCorrect', p_is_correct
  )::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.adle_review_transition_receipts
  where review_session_id = p_review_session_id
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_request_fingerprint
      or v_receipt.transition_kind <> 'submit_audio_check'
    then
      raise exception 'review_idempotency_conflict';
    end if;
    return jsonb_build_object('ok', true, 'replayed', true,
      'stateVersion', v_receipt.resulting_state_version);
  end if;

  select * into v_encounter from public.adle_review_word_encounters
  where id = p_encounter_id and review_session_id = p_review_session_id
  for update;
  if not found then raise exception 'review_encounter_not_found'; end if;

  if v_encounter.original_outcome <> 'pending' then
    if v_encounter.original_outcome_source <> 'audio_retrieval_check'
      or v_encounter.original_attempt_event_id is null
    then
      raise exception 'audio_check_not_eligible';
    end if;
    select * into v_attempt from public.adle_assignment_attempt_events
    where id = v_encounter.original_attempt_event_id;
    if v_attempt.attempt_text is distinct from p_response
      or v_attempt.is_correct is distinct from p_is_correct
    then
      raise exception 'audio_response_conflict';
    end if;
    return jsonb_build_object('ok', true, 'replayed', true,
      'stateVersion', v_session.state_version);
  end if;
  if v_encounter.writing_disposition <> 'unaccounted_for' then
    raise exception 'audio_check_not_eligible';
  end if;

  select target->>'canonicalSpelling' into v_target_word
  from public.daily_assignments assignment,
    jsonb_array_elements(assignment.compiled_review_snapshot->'targets') target
  where assignment.id = v_session.daily_assignment_id
    and target->>'encounterId' = v_encounter.id::text;
  if nullif(btrim(v_target_word), '') is null then
    raise exception 'review_snapshot_target_not_found';
  end if;

  v_attempt_id := gen_random_uuid();
  insert into public.adle_assignment_attempt_events(
    id, child_id, parent_user_id, daily_assignment_id, assignment_item_id,
    canonical_word_id, micro_skill_key, section_key, template_key,
    target_word, attempt_text, is_correct, attempt_kind, evidence_class, source_ref
  ) values (
    v_attempt_id, v_session.child_id, v_session.parent_user_id,
    v_session.daily_assignment_id, v_session.assignment_item_id,
    v_encounter.canonical_word_id, null, 'review_audio_check',
    'review_audio_only_retrieval', v_target_word, p_response, p_is_correct,
    'review_production', 'scheduled_review_attempt',
    'review-r3:' || p_review_session_id::text || ':audio:' || v_encounter.id::text
  );

  update public.adle_review_word_encounters
  set original_outcome = case when p_is_correct then 'success' else 'failure' end,
    original_outcome_source = 'audio_retrieval_check',
    original_attempt_event_id = v_attempt_id,
    revealed_at = case when p_is_correct then null else timezone('utc', now()) end,
    repair_state = case when p_is_correct then 'not_required' else 'required' end,
    updated_at = timezone('utc', now())
  where id = p_encounter_id;

  update public.adle_review_sessions
  set stage = case
      when exists (
        select 1 from public.adle_review_word_encounters
        where review_session_id = p_review_session_id
          and id <> p_encounter_id and original_outcome = 'pending'
      ) then 'retrieval_checks'
      when exists (
        select 1 from public.adle_review_word_encounters
        where review_session_id = p_review_session_id
          and (id = p_encounter_id and not p_is_correct or original_outcome = 'failure')
      ) then 'repair'
      else 'ready_to_complete'
    end,
    state_version = state_version + 1,
    updated_at = timezone('utc', now())
  where id = p_review_session_id
  returning * into v_session;

  insert into public.adle_review_transition_receipts(
    review_session_id, idempotency_key, transition_kind,
    request_fingerprint, resulting_state_version
  ) values (
    p_review_session_id, p_idempotency_key, 'submit_audio_check',
    v_request_fingerprint, v_session.state_version
  );

  return jsonb_build_object('ok', true, 'replayed', false,
    'stateVersion', v_session.state_version);
end;
$$;

revoke all on function public.submit_adle_review_writing_r3(uuid, text, text, jsonb, text)
from public, anon, authenticated;
revoke all on function public.submit_adle_review_audio_check_r3(uuid, uuid, text, text, boolean, text)
from public, anon, authenticated;
grant execute on function public.submit_adle_review_writing_r3(uuid, text, text, jsonb, text)
to service_role;
grant execute on function public.submit_adle_review_audio_check_r3(uuid, uuid, text, text, boolean, text)
to service_role;
