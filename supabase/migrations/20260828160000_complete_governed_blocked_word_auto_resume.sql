-- Complete blocked-word auto-resume without broad historical discovery.
--
-- This migration adds three narrow boundaries:
--   1. materialise one exact occurrence after a governed Stage-F admin replay;
--   2. authorise one exact governed source for the existing candidate seeder;
--   3. enqueue existing candidates when generic profile/content authority
--      crosses its legitimate release threshold.
--
-- None of these functions evaluates readiness or writes an ADLE target. The
-- released canonical-intake state machine remains the sole readiness authority.

begin;

create function public.materialize_resolved_stage_f_spelling_occurrence_source(
  p_source_misspelling_instance_id uuid,
  p_expected_parent_user_id uuid,
  p_expected_child_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_issue public.writing_issues%rowtype;
  v_misspelling public.misspelling_instances%rowtype;
  v_case public.spelling_catalog_review_cases%rowtype;
  v_decision public.spelling_catalog_review_case_decisions%rowtype;
  v_mapping public.spelling_canonical_mappings%rowtype;
  v_existing public.parent_verified_spelling_candidate_mappings%rowtype;
  v_verification public.parent_verifications%rowtype;
  v_source_submission_id uuid;
  v_candidate_id uuid;
  v_verification_id uuid;
  v_admin_case_id uuid;
  v_admin_decision_id uuid;
  v_canonical_mapping_id uuid;
  v_misspelling_normalized text;
  v_correct_spelling_normalized text;
  v_source_entity_id text;
  v_source_provenance text;
  v_decision_count integer;
  v_issue_count integer;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is not null then
    raise exception 'Stage-F occurrence continuation is service governance only.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat('stage-f-auto-resume:', p_source_misspelling_instance_id::text),
      0
    )
  );

  select count(*)::integer
  into v_issue_count
  from public.writing_issues issue
  where issue.source_misspelling_instance_id = p_source_misspelling_instance_id
    and issue.parent_user_id = p_expected_parent_user_id
    and issue.child_id = p_expected_child_id;
  if v_issue_count <> 1 then
    raise exception 'The exact occurrence has missing or ambiguous writing-issue authority.';
  end if;

  select issue.*
  into v_issue
  from public.writing_issues issue
  where issue.source_misspelling_instance_id = p_source_misspelling_instance_id
    and issue.parent_user_id = p_expected_parent_user_id
    and issue.child_id = p_expected_child_id
  for update;
  if not found then
    raise exception 'The exact governed writing issue does not exist for that learner.';
  end if;

  if v_issue.issue_status <> 'finalised'
    or v_issue.final_classification not in (
      'fragile_knowledge', 'concept_gap', 'transfer_failure'
    )
    or v_issue.source_misspelling_instance_id is null
  then
    raise exception 'The occurrence is not a final learning spelling occurrence.';
  end if;

  select misspelling.*
  into v_misspelling
  from public.misspelling_instances misspelling
  where misspelling.id = v_issue.source_misspelling_instance_id
    and misspelling.parent_user_id = p_expected_parent_user_id
    and misspelling.child_id = p_expected_child_id
  for update;
  if not found then
    raise exception 'The exact misspelling occurrence is missing or belongs to another learner.';
  end if;

  v_misspelling_normalized := lower(btrim(coalesce(
    nullif(v_issue.observed_text, ''), v_misspelling.misspelled_word
  )));
  v_correct_spelling_normalized := lower(btrim(coalesce(
    nullif(v_issue.approved_replacement, ''),
    nullif(v_issue.suggested_replacement, '')
  )));

  if coalesce(v_misspelling_normalized, '') = ''
    or coalesce(v_correct_spelling_normalized, '') = ''
    or v_misspelling_normalized = v_correct_spelling_normalized
    or not exists (
      select 1
      from public.micro_skill_catalog catalog
      where catalog.micro_skill_key = v_issue.micro_skill_key
        and catalog.mastery_domain_key = 'D4'
        and catalog.is_active = true
        and catalog.is_assignable = true
    )
  then
    raise exception 'The replayed occurrence lacks an exact active D4 learning identity.';
  end if;

  if coalesce(
      v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'action', ''
    ) <> 'attached_verified_route'
    or coalesce(
      v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'route_source', ''
    ) <> 'admin_decision'
    or coalesce(
      (v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'dry_run_first')::boolean,
      false
    ) is not true
    or coalesce(
      v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'replayed_at', ''
    ) = ''
  then
    raise exception 'The exact controlled Stage-F admin replay receipt is absent.';
  end if;

  begin
    v_admin_case_id := (
      v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'admin_case_id'
    )::uuid;
    v_admin_decision_id := (
      v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'admin_decision_id'
    )::uuid;
    v_canonical_mapping_id := nullif(
      v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'canonical_mapping_id',
      ''
    )::uuid;
  exception when invalid_text_representation then
    raise exception 'The Stage-F replay receipt contains an invalid authority ID.';
  end;

  if v_admin_case_id is null or v_admin_decision_id is null then
    raise exception 'The Stage-F replay receipt lacks exact admin authority.';
  end if;

  select review_case.*
  into v_case
  from public.spelling_catalog_review_cases review_case
  where review_case.id = v_admin_case_id
    and review_case.parent_user_id = p_expected_parent_user_id
    and review_case.child_id = p_expected_child_id
    and review_case.source_misspelling_instance_id = v_issue.source_misspelling_instance_id
    and review_case.misspelling_normalized = v_misspelling_normalized
    and review_case.correct_spelling_normalized = v_correct_spelling_normalized
    and review_case.case_status in ('linked_existing_skill', 'add_canonical_mapping')
  for share;
  if not found then
    raise exception 'The terminal admin case does not govern the exact occurrence identity.';
  end if;

  select decision.*
  into v_decision
  from public.spelling_catalog_review_case_decisions decision
  where decision.id = v_admin_decision_id
    and decision.case_id = v_case.id
    and decision.previous_status = 'open'
    and decision.new_status = v_case.case_status
    and decision.decision_type = v_case.case_status
    and decision.decision_type in ('linked_existing_skill', 'add_canonical_mapping')
    and decision.linked_micro_skill_key = v_issue.micro_skill_key
    and decision.canonical_mapping_id is not distinct from v_canonical_mapping_id
  for share;
  if not found then
    raise exception 'The exact terminal admin decision does not govern the replayed micro-skill.';
  end if;

  select count(*)::integer
  into v_decision_count
  from public.spelling_catalog_review_case_decisions decision
  where decision.case_id = v_case.id
    and decision.previous_status = 'open'
    and decision.decision_type in ('linked_existing_skill', 'add_canonical_mapping');
  if v_decision_count <> 1 then
    raise exception 'The occurrence has ambiguous terminal admin route authority.';
  end if;

  if v_decision.decision_type = 'linked_existing_skill'
    and v_canonical_mapping_id is not null
  then
    raise exception 'A linked-skill decision cannot substitute canonical mapping authority.';
  end if;

  if v_canonical_mapping_id is not null then
    select mapping.*
    into v_mapping
    from public.spelling_canonical_mappings mapping
    where mapping.id = v_canonical_mapping_id
      and mapping.source_case_id = v_case.id
      and mapping.source_decision_id = v_decision.id
      and mapping.misspelling_normalized = v_misspelling_normalized
      and mapping.correct_spelling_normalized = v_correct_spelling_normalized
      and mapping.micro_skill_key = v_issue.micro_skill_key
    for share;
    if not found then
      raise exception 'The replay receipt canonical mapping disagrees with the exact occurrence.';
    end if;
  end if;

  select candidate.*
  into v_existing
  from public.parent_verified_spelling_candidate_mappings candidate
  where candidate.parent_user_id = p_expected_parent_user_id
    and candidate.child_id = p_expected_child_id
    and candidate.source_misspelling_instance_id = v_issue.source_misspelling_instance_id
    and candidate.candidate_status in (
      'pending_parent_promotion', 'parent_local_promoted',
      'admin_review_requested', 'global_canonical_promoted'
    )
  for update;

  if v_existing.id is not null then
    if v_existing.misspelling_normalized <> v_misspelling_normalized
      or v_existing.correct_spelling_normalized <> v_correct_spelling_normalized
      or v_existing.micro_skill_key <> v_issue.micro_skill_key
    then
      raise exception 'A live governed source already represents a conflicting occurrence identity.';
    end if;
    return jsonb_build_object(
      'action', 'reused',
      'candidate_mapping_id', v_existing.id,
      'source_misspelling_instance_id', v_issue.source_misspelling_instance_id,
      'route_authority', 'governed_stage_f_admin_replay_continuation'
    );
  end if;

  select attempt.task_submission_id
  into v_source_submission_id
  from public.writing_issue_correction_attempts attempt
  join public.task_submissions attempt_submission
    on attempt_submission.id = attempt.task_submission_id
  join public.task_submissions issue_submission
    on issue_submission.id = v_issue.task_submission_id
  where attempt.writing_issue_id = v_issue.id
    and attempt.parent_user_id = p_expected_parent_user_id
    and attempt.child_id = p_expected_child_id
    and attempt_submission.parent_user_id = p_expected_parent_user_id
    and attempt_submission.child_id = p_expected_child_id
    and attempt_submission.task_id = issue_submission.task_id
  order by attempt.created_at desc, attempt.id desc
  limit 1;
  if v_source_submission_id is null then
    raise exception 'The occurrence has no exact returned-correction task-thread evidence.';
  end if;

  v_source_provenance := case
    when v_issue.metadata ->> 'source_kind' = 'parent_authored_missed_word'
      or coalesce((v_issue.metadata ->> 'parent_authored_missed_word')::boolean, false)
      then 'lesson_submission_parent_added_missed_word'
    else 'lesson_submission_existing_output'
  end;
  v_source_entity_id := case
    when v_misspelling.position_start is not null
      and v_misspelling.position_end is not null
      and v_misspelling.position_end > v_misspelling.position_start
      then concat_ws(
        '::', 'authentic_writing', v_issue.task_submission_id::text,
        coalesce(v_misspelling.writing_sample_id::text, 'no_sample'),
        concat(v_misspelling.position_start, '-', v_misspelling.position_end),
        v_misspelling_normalized, v_correct_spelling_normalized
      )
    else concat('spelling_occurrence::', v_issue.source_misspelling_instance_id::text)
  end;

  select verification.*
  into v_verification
  from public.parent_verifications verification
  where verification.parent_user_id = p_expected_parent_user_id
    and verification.child_id = p_expected_child_id
    and verification.domain_module = 'spelling'
    and verification.source_type = 'authentic_writing'
    and verification.source_entity_id = v_source_entity_id
  for update;

  if v_verification.id is not null then
    if v_verification.decision not in ('accepted', 'overridden')
      or coalesce(
        v_verification.verified_micro_skill_key,
        v_verification.suggested_micro_skill_key
      ) <> v_issue.micro_skill_key
    then
      raise exception 'A parent verification already exists with conflicting learning authority.';
    end if;
    v_verification_id := v_verification.id;
  else
    insert into public.parent_verifications (
      child_id, parent_user_id, domain_module, source_type, source_entity_id,
      task_submission_id, writing_sample_id, suggested_micro_skill_key,
      suggestion_payload, decision, verified_micro_skill_key,
      verification_notes, metadata, verified_at, created_at, updated_at
    ) values (
      p_expected_child_id, p_expected_parent_user_id, 'spelling',
      'authentic_writing', v_source_entity_id, v_issue.task_submission_id,
      v_misspelling.writing_sample_id, v_issue.micro_skill_key,
      jsonb_build_object(
        'observed_text', v_misspelling_normalized,
        'suggested_replacement', v_correct_spelling_normalized,
        'source_misspelling_instance_id', v_issue.source_misspelling_instance_id
      ),
      'overridden', v_issue.micro_skill_key,
      'Governed continuation after exact controlled Stage-F admin replay.',
      jsonb_build_object(
        'blocked_word_auto_resume_version', 1,
        'writing_issue_id', v_issue.id,
        'source_misspelling_instance_id', v_issue.source_misspelling_instance_id,
        'admin_case_id', v_case.id,
        'admin_decision_id', v_decision.id,
        'canonical_mapping_id', v_canonical_mapping_id,
        'continued_at', v_now
      ),
      v_now, v_now, v_now
    ) returning id into v_verification_id;
  end if;

  insert into public.parent_verified_spelling_candidate_mappings (
    parent_user_id, child_id, parent_verification_id, task_submission_id,
    writing_sample_id, source_suggestion_id, source_misspelling_instance_id,
    source_provenance, reviewed_event_source_entity_id,
    original_child_spelling, original_correct_spelling,
    misspelling_normalized, correct_spelling_normalized, micro_skill_key,
    candidate_status, promotion_scope, canonical_intake_handoff_state,
    metadata, created_at, updated_at
  ) values (
    p_expected_parent_user_id, p_expected_child_id, v_verification_id,
    v_source_submission_id, v_misspelling.writing_sample_id,
    v_issue.source_suggestion_id, v_issue.source_misspelling_instance_id,
    v_source_provenance, v_source_entity_id,
    v_misspelling.misspelled_word, v_correct_spelling_normalized,
    v_misspelling_normalized, v_correct_spelling_normalized,
    v_issue.micro_skill_key, 'parent_local_promoted', 'parent_local',
    'awaiting_r8c_exact_id_handoff',
    jsonb_build_object(
      'blocked_word_auto_resume_version', 1,
      'route_authority', 'governed_stage_f_admin_replay_continuation',
      'known_canonical_mapping_id', v_canonical_mapping_id,
      'final_classification', v_issue.final_classification,
      'stage_f_replay', jsonb_build_object(
        'writing_issue_id', v_issue.id,
        'admin_case_id', v_case.id,
        'admin_decision_id', v_decision.id,
        'canonical_mapping_id', v_canonical_mapping_id,
        'replayed_at',
          v_issue.metadata -> 'returned_correction_stage_f_replay' ->> 'replayed_at'
      )
    ),
    v_now, v_now
  ) returning id into v_candidate_id;

  return jsonb_build_object(
    'action', 'materialized',
    'candidate_mapping_id', v_candidate_id,
    'parent_verification_id', v_verification_id,
    'source_misspelling_instance_id', v_issue.source_misspelling_instance_id,
    'route_authority', 'governed_stage_f_admin_replay_continuation'
  );
end;
$$;

revoke all on function public.materialize_resolved_stage_f_spelling_occurrence_source(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.materialize_resolved_stage_f_spelling_occurrence_source(
  uuid, uuid, uuid
) to service_role;

create function public.adle_authorize_governed_source_continuation(
  p_candidate_mapping_id uuid,
  p_expected_parent_user_id uuid,
  p_expected_child_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.parent_verified_spelling_candidate_mappings%rowtype;
  v_verification public.parent_verifications%rowtype;
  v_issue_id uuid;
  v_issue_count integer;
  v_occurrence_issue_count integer;
  v_transitioned integer := 0;
  v_effective_handoff_state text;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is not null then
    raise exception 'Governed-source continuation is service governance only.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(concat('canonical-intake-source:', p_candidate_mapping_id::text), 0)
  );

  select source.*
  into v_source
  from public.parent_verified_spelling_candidate_mappings source
  where source.id = p_candidate_mapping_id
    and source.parent_user_id = p_expected_parent_user_id
    and source.child_id = p_expected_child_id
  for update;
  if not found then
    raise exception 'The exact governed source does not exist for that learner.';
  end if;

  if v_source.candidate_status not in (
      'parent_local_promoted', 'global_canonical_promoted'
    )
    or num_nonnulls(
      v_source.task_submission_id, v_source.source_adle_review_session_id
    ) <> 1
    or coalesce(btrim(v_source.misspelling_normalized), '') = ''
    or coalesce(btrim(v_source.correct_spelling_normalized), '') = ''
    or v_source.misspelling_normalized = v_source.correct_spelling_normalized
    or not exists (
      select 1
      from public.micro_skill_catalog catalog
      where catalog.micro_skill_key = v_source.micro_skill_key
        and catalog.mastery_domain_key = 'D4'
        and catalog.is_active = true
        and catalog.is_assignable = true
    )
  then
    raise exception 'The exact source is not eligible canonical-intake authority.';
  end if;

  select verification.*
  into v_verification
  from public.parent_verifications verification
  where verification.id = v_source.parent_verification_id
    and verification.parent_user_id = p_expected_parent_user_id
    and verification.child_id = p_expected_child_id
    and verification.decision in ('accepted', 'overridden')
    and verification.domain_module = 'spelling'
    and verification.source_entity_id = v_source.reviewed_event_source_entity_id
    and coalesce(
      verification.verified_micro_skill_key,
      verification.suggested_micro_skill_key
    ) = v_source.micro_skill_key
  for share;
  if not found then
    raise exception 'The governed source lacks an accepted parent verification.';
  end if;

  if v_source.task_submission_id is not null then
    if v_source.source_misspelling_instance_id is null
      or v_source.source_provenance not in (
        'lesson_submission_existing_output',
        'lesson_submission_parent_added_missed_word'
      )
      or not exists (
        select 1
        from public.task_submissions source_submission
        where source_submission.id = v_source.task_submission_id
          and source_submission.parent_user_id = p_expected_parent_user_id
          and source_submission.child_id = p_expected_child_id
      )
      or not exists (
        select 1
        from public.misspelling_instances occurrence
        where occurrence.id = v_source.source_misspelling_instance_id
          and occurrence.parent_user_id = p_expected_parent_user_id
          and occurrence.child_id = p_expected_child_id
          and lower(btrim(occurrence.misspelled_word))
            = v_source.misspelling_normalized
          and (
            nullif(btrim(occurrence.corrected_word), '') is null
            or lower(btrim(occurrence.corrected_word))
              = v_source.correct_spelling_normalized
          )
      )
    then
      raise exception 'The lesson source has incomplete exact occurrence authority.';
    end if;

    select count(*)::integer
    into v_occurrence_issue_count
    from public.writing_issues issue
    where issue.parent_user_id = p_expected_parent_user_id
      and issue.child_id = p_expected_child_id
      and issue.source_misspelling_instance_id = v_source.source_misspelling_instance_id;

    select count(*)::integer, (array_agg(issue.id order by issue.id))[1]
    into v_issue_count, v_issue_id
    from public.writing_issues issue
    join public.task_submissions issue_submission
      on issue_submission.id = issue.task_submission_id
    join public.task_submissions source_submission
      on source_submission.id = v_source.task_submission_id
    where issue.parent_user_id = p_expected_parent_user_id
      and issue.child_id = p_expected_child_id
      and issue.source_misspelling_instance_id = v_source.source_misspelling_instance_id
      and issue.issue_status = 'finalised'
      and issue.final_classification in (
        'fragile_knowledge', 'concept_gap', 'transfer_failure'
      )
      and lower(btrim(coalesce(nullif(issue.observed_text, ''), '')))
        = v_source.misspelling_normalized
      and lower(btrim(coalesce(
        nullif(issue.approved_replacement, ''),
        nullif(issue.suggested_replacement, '')
      ))) = v_source.correct_spelling_normalized
      and issue.micro_skill_key = v_source.micro_skill_key
      and issue_submission.parent_user_id = p_expected_parent_user_id
      and issue_submission.child_id = p_expected_child_id
      and source_submission.task_id = issue_submission.task_id;
    if v_occurrence_issue_count > 1
      or (v_occurrence_issue_count = 1 and v_issue_count <> 1)
    then
      raise exception 'The lesson source has changed or ambiguous final occurrence authority.';
    end if;

    if v_occurrence_issue_count = 1 and not exists (
      select 1
      from public.writing_issue_correction_attempts attempt
      join public.task_submissions attempt_submission
        on attempt_submission.id = attempt.task_submission_id
      join public.task_submissions source_submission
        on source_submission.id = v_source.task_submission_id
      where attempt.writing_issue_id = v_issue_id
        and attempt.parent_user_id = p_expected_parent_user_id
        and attempt.child_id = p_expected_child_id
        and attempt_submission.parent_user_id = p_expected_parent_user_id
        and attempt_submission.child_id = p_expected_child_id
        and attempt_submission.task_id = source_submission.task_id
    ) then
      raise exception 'The lesson source lacks returned-correction task-thread evidence.';
    end if;

    if v_occurrence_issue_count = 0 and (
      v_source.canonical_intake_handoff_state is not null
      or v_verification.source_type <> 'authentic_writing'
      or not exists (
        select 1
        from public.task_submissions verification_submission
        join public.task_submissions source_submission
          on source_submission.id = v_source.task_submission_id
        where verification_submission.id = v_verification.task_submission_id
          and verification_submission.parent_user_id = p_expected_parent_user_id
          and verification_submission.child_id = p_expected_child_id
          and verification_submission.task_id = source_submission.task_id
      )
    ) then
      raise exception 'The legacy source without an issue row lacks exact parent-verification authority.';
    end if;
  else
    if v_source.source_provenance <> 'adle_review_submitted_writing_parent_identified'
      or v_source.source_misspelling_instance_id is not null
      or not exists (
        select 1
        from public.adle_review_sessions session
        where session.id = v_source.source_adle_review_session_id
          and session.parent_user_id = p_expected_parent_user_id
          and session.child_id = p_expected_child_id
          and session.stage = 'completed'
          and session.completed_at is not null
      )
    then
      raise exception 'The ADLE Review source lacks exact completed-session authority.';
    end if;
  end if;

  if v_source.canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff' then
    update public.parent_verified_spelling_candidate_mappings source
    set canonical_intake_handoff_state = 'r8c_exact_id_handed_off',
        metadata = coalesce(source.metadata, '{}'::jsonb) || jsonb_build_object(
          'governed_source_continuation_version', 1,
          'governed_source_continued_at', v_now
        ),
        updated_at = v_now
    where source.id = v_source.id
      and source.canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff';
    get diagnostics v_transitioned = row_count;
  else
    if v_source.canonical_intake_handoff_state is not null
      and v_source.canonical_intake_handoff_state <> 'r8c_exact_id_handed_off'
    then
      raise exception 'The governed source has an unsupported handoff state.';
    end if;
  end if;

  v_effective_handoff_state := null;
  if v_source.canonical_intake_handoff_state is not null then
    v_effective_handoff_state := 'r8c_exact_id_handed_off';
  end if;

  return jsonb_build_object(
    'candidate_mapping_id', v_source.id,
    'parent_user_id', v_source.parent_user_id,
    'child_id', v_source.child_id,
    'task_submission_id', v_source.task_submission_id,
    'source_adle_review_session_id', v_source.source_adle_review_session_id,
    'source_misspelling_instance_id', v_source.source_misspelling_instance_id,
    'misspelling_normalized', v_source.misspelling_normalized,
    'correct_spelling_normalized', v_source.correct_spelling_normalized,
    'micro_skill_key', v_source.micro_skill_key,
    'transitioned_count', v_transitioned,
    'handoff_state', v_effective_handoff_state
  );
end;
$$;

revoke all on function public.adle_authorize_governed_source_continuation(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.adle_authorize_governed_source_continuation(
  uuid, uuid, uuid
) to service_role;

create function public.adle_enqueue_existing_candidates_for_micro_skill_release(
  p_micro_skill_key text,
  p_trigger_type text,
  p_source_ref text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate record;
  v_count integer := 0;
begin
  if auth.uid() is not null then
    raise exception 'Canonical-intake release enqueue is service governance only.';
  end if;
  if coalesce(btrim(p_micro_skill_key), '') = ''
    or coalesce(btrim(p_trigger_type), '') = ''
    or coalesce(btrim(p_source_ref), '') = ''
  then
    raise exception 'A governed release enqueue requires exact skill, trigger, and authority reference.';
  end if;

  for v_candidate in
    select candidate.id
    from public.adle_canonical_intake_candidates candidate
    where candidate.micro_skill_key = p_micro_skill_key
      and candidate.candidate_state in (
        'pending_content', 'pending_mapping', 'error_retryable'
      )
    order by candidate.id
  loop
    perform public.adle_enqueue_canonical_intake_candidate(
      v_candidate.id, p_trigger_type, p_source_ref
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.adle_enqueue_existing_candidates_for_micro_skill_release(
  text, text, text
) from public, anon, authenticated;
grant execute on function public.adle_enqueue_existing_candidates_for_micro_skill_release(
  text, text, text
) to service_role;

create function public.enqueue_adle_candidates_on_governed_readiness_release()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_ready boolean := false;
  v_new_ready boolean := false;
  v_trigger text;
begin
  if tg_table_name = 'canonical_teaching_dictionary_transfer_selector_profiles' then
    v_new_ready := new.row_status = 'active'
      and new.review_status = 'approved_for_first_exposure';
    if tg_op = 'UPDATE' then
      v_old_ready := old.row_status = 'active'
        and old.review_status = 'approved_for_first_exposure';
    end if;
    v_trigger := 'generic_profile_release';
  elsif tg_table_name = 'canonical_teaching_dictionary_content_versions' then
    v_new_ready := new.version_status = 'active'
      and new.is_active = true
      and new.final_readiness_review_status = 'signed_off'
      and coalesce(btrim(new.child_friendly_explanation), '') <> ''
      and coalesce(btrim(new.rule_explanation), '') <> '';
    if tg_op = 'UPDATE' then
      v_old_ready := old.version_status = 'active'
        and old.is_active = true
        and old.final_readiness_review_status = 'signed_off'
        and coalesce(btrim(old.child_friendly_explanation), '') <> ''
        and coalesce(btrim(old.rule_explanation), '') <> '';
    end if;
    v_trigger := 'teaching_content_release';
  else
    raise exception 'Unsupported governed readiness release table.';
  end if;

  if v_new_ready and not v_old_ready then
    perform public.adle_enqueue_existing_candidates_for_micro_skill_release(
      new.micro_skill_key,
      v_trigger,
      concat(tg_table_name, ':', new.id::text)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_adle_candidates_on_governed_readiness_release()
  from public, anon, authenticated;

create trigger ctd_transfer_profile_enqueue_canonical_intake
after insert or update of row_status, review_status
on public.canonical_teaching_dictionary_transfer_selector_profiles
for each row execute function public.enqueue_adle_candidates_on_governed_readiness_release();

create trigger ctd_content_release_enqueue_canonical_intake
after insert or update of version_status, is_active,
  final_readiness_review_status, child_friendly_explanation, rule_explanation
on public.canonical_teaching_dictionary_content_versions
for each row execute function public.enqueue_adle_candidates_on_governed_readiness_release();

create function public.adle_enqueue_existing_candidates_for_word_skill_release(
  p_canonical_word_id uuid,
  p_micro_skill_key text,
  p_trigger_type text,
  p_source_ref text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate record;
  v_count integer := 0;
begin
  if auth.uid() is not null then
    raise exception 'Canonical-intake target release enqueue is service governance only.';
  end if;
  if p_canonical_word_id is null
    or coalesce(btrim(p_micro_skill_key), '') = ''
    or coalesce(btrim(p_trigger_type), '') = ''
    or coalesce(btrim(p_source_ref), '') = ''
  then
    raise exception 'A governed target release enqueue requires exact word, skill, trigger, and authority reference.';
  end if;

  for v_candidate in
    select candidate.id
    from public.adle_canonical_intake_candidates candidate
    where candidate.canonical_word_id = p_canonical_word_id
      and candidate.micro_skill_key = p_micro_skill_key
      and candidate.candidate_state in (
        'pending_content', 'pending_mapping', 'error_retryable'
      )
    order by candidate.id
  loop
    perform public.adle_enqueue_canonical_intake_candidate(
      v_candidate.id, p_trigger_type, p_source_ref
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.adle_enqueue_existing_candidates_for_word_skill_release(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.adle_enqueue_existing_candidates_for_word_skill_release(
  uuid, text, text, text
) to service_role;

create function public.enqueue_adle_candidates_on_suffix_profile_release()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.canonical_teaching_dictionary_suffix_profiles%rowtype;
  v_old_ready boolean := false;
  v_new_ready boolean := false;
begin
  if tg_table_name = 'canonical_teaching_dictionary_suffix_profiles' then
    v_new_ready := new.production_enabled
      and new.row_status = 'active'
      and new.review_status = 'approved_for_first_exposure';
    if tg_op = 'UPDATE' then
      v_old_ready := old.production_enabled
        and old.row_status = 'active'
        and old.review_status = 'approved_for_first_exposure';
    end if;
    if v_new_ready and not v_old_ready then
      perform public.adle_enqueue_existing_candidates_for_micro_skill_release(
        new.micro_skill_key,
        'dynamic_suffix_profile_release',
        concat(tg_table_name, ':', new.id::text)
      );
    end if;
    return new;
  end if;

  select profile.*
  into strict v_profile
  from public.canonical_teaching_dictionary_suffix_profiles profile
  where profile.id = new.suffix_profile_id;
  v_new_ready := v_profile.production_enabled
    and v_profile.row_status = 'active'
    and v_profile.review_status = 'approved_for_first_exposure'
    and new.assignment_eligible
    and new.row_status = 'active'
    and new.review_status = 'approved_for_first_exposure';
  if tg_op = 'UPDATE' and old.suffix_profile_id = new.suffix_profile_id then
    v_old_ready := v_profile.production_enabled
      and v_profile.row_status = 'active'
      and v_profile.review_status = 'approved_for_first_exposure'
      and old.assignment_eligible
      and old.row_status = 'active'
      and old.review_status = 'approved_for_first_exposure';
  end if;
  if v_new_ready and not v_old_ready then
    perform public.adle_enqueue_existing_candidates_for_word_skill_release(
      new.canonical_word_id,
      v_profile.micro_skill_key,
      'dynamic_suffix_member_release',
      concat(tg_table_name, ':', new.id::text)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_adle_candidates_on_suffix_profile_release()
  from public, anon, authenticated;

create trigger ctd_suffix_profile_enqueue_canonical_intake
after insert or update of production_enabled, row_status, review_status
on public.canonical_teaching_dictionary_suffix_profiles
for each row execute function public.enqueue_adle_candidates_on_suffix_profile_release();

create trigger ctd_suffix_member_enqueue_canonical_intake
after insert or update of suffix_profile_id, canonical_word_id,
  assignment_eligible, row_status, review_status
on public.canonical_teaching_dictionary_suffix_members
for each row execute function public.enqueue_adle_candidates_on_suffix_profile_release();

create function public.enqueue_adle_candidates_on_curriculum_release()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revision public.adle_route_activation_revisions%rowtype;
begin
  if tg_table_name = 'adle_curriculum_release_dependencies' then
    perform public.adle_enqueue_existing_candidates_for_micro_skill_release(
      new.micro_skill_key,
      'curriculum_release_dependency',
      concat(tg_table_name, ':', new.release_manifest_id::text, ':', new.authority_type)
    );
    return new;
  end if;

  select revision.*
  into strict v_revision
  from public.adle_route_activation_revisions revision
  where revision.id = new.current_revision_id
    and revision.environment_key = new.environment_key
    and revision.route_id = new.route_id
    and revision.route_version = new.route_version
    and revision.micro_skill_key = new.micro_skill_key;
  if v_revision.activation_status = 'enabled' then
    perform public.adle_enqueue_existing_candidates_for_micro_skill_release(
      new.micro_skill_key,
      'route_activation_release',
      concat(tg_table_name, ':', new.current_revision_id::text)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_adle_candidates_on_curriculum_release()
  from public, anon, authenticated;

create trigger adle_curriculum_dependency_enqueue_canonical_intake
after insert on public.adle_curriculum_release_dependencies
for each row execute function public.enqueue_adle_candidates_on_curriculum_release();

create trigger adle_activation_head_enqueue_canonical_intake
after insert or update of current_revision_id
on public.adle_route_activation_heads
for each row execute function public.enqueue_adle_candidates_on_curriculum_release();

commit;
