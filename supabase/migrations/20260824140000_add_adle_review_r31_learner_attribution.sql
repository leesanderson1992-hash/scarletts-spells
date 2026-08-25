-- R3.1 only: learner-confirmed attribution for still-pending Review writing
-- encounters. No scheduler, final outcome ledger, authentic-use, repair,
-- assignment, taught-history, mastery, or reward authority is activated here.

alter table public.adle_review_transition_receipts
  drop constraint if exists adle_review_transition_receipts_kind_check;
alter table public.adle_review_transition_receipts
  add constraint adle_review_transition_receipts_kind_check
  check (transition_kind = any (array[
    'select_prompt', 'start_writing', 'save_draft', 'extend_writing',
    'submit_writing', 'submit_audio_check', 'reveal_word',
    'confirm_writing_suggestion', 'answer_writing_attempt_question',
    'confirm_writing_span',
    'save_tricky_part', 'save_memory_cue', 'submit_repair_retry',
    'complete_review'
  ]));

create or replace function public.prevent_adle_review_original_outcome_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pending_r31_refinement boolean;
begin
  if old.review_session_id is distinct from new.review_session_id
    or old.schedule_word_id is distinct from new.schedule_word_id
    or old.canonical_word_id is distinct from new.canonical_word_id
    or old.target_order is distinct from new.target_order
  then
    raise exception 'ADLE Review encounter identity is immutable';
  end if;

  v_pending_r31_refinement :=
    old.writing_disposition = 'unaccounted_for'
    and old.original_outcome = 'pending'
    and old.original_outcome_source is null
    and (
      (new.writing_disposition = 'unaccounted_for'
        and new.original_outcome = 'pending'
        and new.original_outcome_source is null
        and new.original_attempt_event_id is null
        and new.repair_state = 'not_required')
      or
      (new.writing_disposition = 'attributable_misspelling'
        and new.original_outcome = 'failure'
        and new.original_outcome_source = 'writing'
        and new.original_attempt_event_id is not null
        and new.repair_state = 'required'
        and new.attribution_algorithm_version = 'learner_confirmed_writing_intent_v1')
    );

  if old.writing_disposition is not null
    and not v_pending_r31_refinement
    and (
      old.writing_disposition is distinct from new.writing_disposition
      or old.attribution_algorithm_version is distinct from new.attribution_algorithm_version
      or old.attribution_provenance is distinct from new.attribution_provenance
    )
  then
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
  if old.writing_disposition = 'unaccounted_for'
    and old.original_outcome = 'pending'
    and new.original_outcome_source = 'audio_retrieval_check'
    and old.attribution_provenance ? 'r31ConfirmationState'
    and old.attribution_provenance->>'r31ConfirmationState' <> 'no_attempt_confirmed'
  then
    raise exception 'audio_check_not_eligible';
  end if;
  return new;
end;
$$;

create or replace function public.transition_adle_review_writing_attribution_r31(
  p_review_session_id uuid,
  p_encounter_id uuid,
  p_snapshot_fingerprint text,
  p_transition_kind text,
  p_decision text,
  p_start_offset integer,
  p_end_offset integer,
  p_selected_text text,
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
  v_request_fingerprint text;
  v_state text;
  v_provenance jsonb;
  v_attempt_id uuid;
  v_target_word text;
  v_start integer;
  v_end integer;
  v_observed text;
  v_confirmation_source text;
begin
  if p_transition_kind not in (
      'confirm_writing_suggestion',
      'answer_writing_attempt_question',
      'confirm_writing_span'
    )
    or nullif(btrim(p_snapshot_fingerprint), '') is null
    or nullif(btrim(p_idempotency_key), '') is null
  then
    raise exception 'invalid_review_writing_attribution_transition';
  end if;
  if p_transition_kind in (
      'confirm_writing_suggestion', 'answer_writing_attempt_question'
    ) and p_decision not in ('yes', 'no')
  then
    raise exception 'invalid_review_writing_attribution_decision';
  end if;

  select * into v_session from public.adle_review_sessions
  where id = p_review_session_id for update;
  if not found
    or v_session.snapshot_fingerprint <> p_snapshot_fingerprint
    or v_session.submitted_writing_text is null
  then
    raise exception 'review_session_not_ready_for_writing_attribution';
  end if;
  select * into v_encounter from public.adle_review_word_encounters
  where id = p_encounter_id and review_session_id = p_review_session_id
  for update;
  if not found then raise exception 'review_encounter_not_found'; end if;

  v_request_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'kind', p_transition_kind, 'sessionId', p_review_session_id,
    'encounterId', p_encounter_id, 'snapshotFingerprint', p_snapshot_fingerprint,
    'decision', p_decision, 'startOffset', p_start_offset,
    'endOffset', p_end_offset, 'selectedText', p_selected_text
  )::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.adle_review_transition_receipts
  where review_session_id = p_review_session_id
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_request_fingerprint
      or v_receipt.transition_kind <> p_transition_kind
    then raise exception 'review_idempotency_conflict'; end if;
    return jsonb_build_object('ok', true, 'replayed', true,
      'stateVersion', v_receipt.resulting_state_version);
  end if;

  v_provenance := coalesce(v_encounter.attribution_provenance, '{}'::jsonb);
  v_state := v_provenance->>'r31ConfirmationState';
  if v_encounter.original_outcome <> 'pending'
    or v_encounter.writing_disposition <> 'unaccounted_for'
  then
    if p_transition_kind = 'confirm_writing_suggestion'
      and v_provenance->>'confirmationSource' = 'learner_confirmed_suggestion'
      and p_decision = 'yes'
    then return jsonb_build_object('ok', true, 'replayed', true,
      'stateVersion', v_session.state_version); end if;
    if p_transition_kind = 'confirm_writing_span'
      and v_provenance->>'confirmationSource' = 'learner_selected_span'
      and (v_provenance->>'confirmedSpanStart')::integer = p_start_offset
      and (v_provenance->>'confirmedSpanEnd')::integer = p_end_offset
      and v_provenance->>'observedText' = p_selected_text
    then return jsonb_build_object('ok', true, 'replayed', true,
      'stateVersion', v_session.state_version); end if;
    raise exception 'attribution_confirmation_conflict';
  end if;

  if p_transition_kind = 'confirm_writing_suggestion' then
    if v_state <> 'suggestion_confirmation_required' then
      if v_provenance->>'suggestionDecision' = p_decision then
        return jsonb_build_object('ok', true, 'replayed', true,
          'stateVersion', v_session.state_version);
      end if;
      raise exception 'attribution_confirmation_not_eligible';
    end if;
    if p_decision = 'no' then
      v_provenance := v_provenance || jsonb_build_object(
        'suggestionDecision', 'no',
        'r31ConfirmationState', 'attempt_question_required'
      );
    else
      v_start := (v_provenance->>'suggestedSpanStart')::integer;
      v_end := (v_provenance->>'suggestedSpanEnd')::integer;
      v_observed := v_provenance->>'observedText';
      v_confirmation_source := 'learner_confirmed_suggestion';
    end if;
  elsif p_transition_kind = 'answer_writing_attempt_question' then
    if v_state <> 'attempt_question_required' then
      if v_provenance->>'attemptQuestionDecision' = p_decision then
        return jsonb_build_object('ok', true, 'replayed', true,
          'stateVersion', v_session.state_version);
      end if;
      raise exception 'attribution_confirmation_not_eligible';
    end if;
    v_provenance := v_provenance || jsonb_build_object(
      'attemptQuestionDecision', p_decision,
      'r31ConfirmationState', case when p_decision = 'yes'
        then 'span_selection_required' else 'no_attempt_confirmed' end
    );
  else
    if v_state <> 'span_selection_required'
      or p_start_offset is null or p_end_offset is null
      or p_start_offset < 0 or p_end_offset <= p_start_offset
      or nullif(p_selected_text, '') is null
      or position(p_selected_text in v_session.submitted_writing_text) = 0
    then raise exception 'invalid_writing_span'; end if;
    v_start := p_start_offset;
    v_end := p_end_offset;
    v_observed := p_selected_text;
    v_confirmation_source := 'learner_selected_span';
  end if;

  if v_confirmation_source is not null then
    if exists (
      select 1 from public.adle_review_word_encounters other
      where other.review_session_id = p_review_session_id
        and other.id <> p_encounter_id
        and (
          (other.attribution_provenance ? 'confirmedSpanStart'
            and v_start < (other.attribution_provenance->>'confirmedSpanEnd')::integer
            and (other.attribution_provenance->>'confirmedSpanStart')::integer < v_end)
          or
          (other.attribution_provenance ? 'matchedSpanStart'
            and v_start < (other.attribution_provenance->>'matchedSpanEnd')::integer
            and (other.attribution_provenance->>'matchedSpanStart')::integer < v_end)
        )
    ) then raise exception 'writing_span_already_consumed'; end if;
    select target->>'canonicalSpelling' into v_target_word
    from public.daily_assignments assignment,
      jsonb_array_elements(assignment.compiled_review_snapshot->'targets') target
    where assignment.id = v_session.daily_assignment_id
      and target->>'encounterId' = p_encounter_id::text;
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
      'review_learner_confirmed_attribution', v_target_word, v_observed, false,
      'review_production', 'scheduled_review_attempt',
      'review-r31:' || p_review_session_id::text || ':writing:' || p_encounter_id::text
    );
    v_provenance := v_provenance || jsonb_build_object(
      'authorityLevel', 'learner_confirmed',
      'r31ConfirmationState', 'confirmed_writing_failure',
      'confirmationSource', v_confirmation_source,
      'confirmationIdempotencyKey', p_idempotency_key,
      'observedText', v_observed,
      'observedNormalized', lower(v_observed),
      'confirmedSpanStart', v_start,
      'confirmedSpanEnd', v_end
    );
    update public.adle_review_word_encounters set
      writing_disposition = 'attributable_misspelling',
      original_outcome = 'failure',
      original_outcome_source = 'writing',
      attribution_algorithm_version = 'learner_confirmed_writing_intent_v1',
      attribution_provenance = v_provenance,
      original_attempt_event_id = v_attempt_id,
      repair_state = 'required',
      updated_at = timezone('utc', now())
    where id = p_encounter_id;
  else
    update public.adle_review_word_encounters set
      attribution_provenance = v_provenance,
      updated_at = timezone('utc', now())
    where id = p_encounter_id;
  end if;

  update public.adle_review_sessions set
    stage = case
      when exists (select 1 from public.adle_review_word_encounters
        where review_session_id = p_review_session_id and original_outcome = 'pending')
        then 'retrieval_checks'
      when exists (select 1 from public.adle_review_word_encounters
        where review_session_id = p_review_session_id and original_outcome = 'failure')
        then 'repair'
      else 'ready_to_complete'
    end,
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

revoke all on function public.transition_adle_review_writing_attribution_r31(
  uuid, uuid, text, text, text, integer, integer, text, text
) from public, anon, authenticated;
grant execute on function public.transition_adle_review_writing_attribution_r31(
  uuid, uuid, text, text, text, integer, integer, text, text
) to service_role;
