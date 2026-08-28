-- R8C: authorise canonical intake only for the exact governed occurrence-source
-- set returned by the parent-approval transaction. R8B remains immutable.

begin;

alter table public.parent_verified_spelling_candidate_mappings
  drop constraint parent_verified_spelling_candidate_mappings_handoff_state_check;

alter table public.parent_verified_spelling_candidate_mappings
  add constraint parent_verified_spelling_candidate_mappings_handoff_state_check
  check (
    canonical_intake_handoff_state is null
    or canonical_intake_handoff_state in (
      'awaiting_r8c_exact_id_handoff',
      'r8c_exact_id_handed_off'
    )
  );

-- The released R8B trigger remains the column/identity trust boundary. R8C
-- opens exactly one transition, and only while executing the service-only,
-- approval-bound security-definer function declared below.
create or replace function public.protect_r8b_canonical_intake_handoff_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_handoff_authority_owner name;
begin
  select pg_get_userbyid(procedure.proowner)
  into v_handoff_authority_owner
  from pg_proc procedure
  where procedure.oid =
    'public.adle_authorize_parent_approval_exact_id_handoff(uuid,uuid,uuid,uuid[])'::regprocedure;

  if tg_op = 'UPDATE'
    and new.canonical_intake_handoff_state
      is distinct from old.canonical_intake_handoff_state
  then
    if current_user is distinct from v_handoff_authority_owner then
      raise exception 'Canonical intake handoff state is server-controlled.';
    end if;

    if old.canonical_intake_handoff_state
        is distinct from 'awaiting_r8c_exact_id_handoff'
      or new.canonical_intake_handoff_state
        is distinct from 'r8c_exact_id_handed_off'
    then
      raise exception 'Canonical intake handoff state has no authorised transition.';
    end if;
  end if;

  if tg_op = 'UPDATE'
    and old.canonical_intake_handoff_state is not null
    and current_user is distinct from v_handoff_authority_owner
    and (
      new.id is distinct from old.id
      or new.parent_user_id is distinct from old.parent_user_id
      or new.child_id is distinct from old.child_id
      or new.parent_verification_id is distinct from old.parent_verification_id
      or new.task_submission_id is distinct from old.task_submission_id
      or new.writing_sample_id is distinct from old.writing_sample_id
      or new.source_suggestion_id is distinct from old.source_suggestion_id
      or new.source_misspelling_instance_id is distinct from old.source_misspelling_instance_id
      or new.source_adle_review_session_id is distinct from old.source_adle_review_session_id
      or new.source_provenance is distinct from old.source_provenance
      or new.reviewed_event_source_entity_id is distinct from old.reviewed_event_source_entity_id
      or new.original_child_spelling is distinct from old.original_child_spelling
      or new.original_correct_spelling is distinct from old.original_correct_spelling
      or new.misspelling_normalized is distinct from old.misspelling_normalized
      or new.correct_spelling_normalized is distinct from old.correct_spelling_normalized
      or new.micro_skill_key is distinct from old.micro_skill_key
      or new.candidate_status is distinct from old.candidate_status
      or new.promotion_scope is distinct from old.promotion_scope
      or new.created_at is distinct from old.created_at
    )
  then
    raise exception 'A governed occurrence source identity and live status are server-controlled.';
  end if;

  if tg_op = 'DELETE'
    and old.canonical_intake_handoff_state is not null
  then
    raise exception 'A governed R8B/R8C occurrence source cannot be deleted.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.protect_r8b_canonical_intake_handoff_state()
  from public, anon, authenticated;

create function public.adle_authorize_parent_approval_exact_id_handoff(
  p_submission_id uuid,
  p_parent_user_id uuid,
  p_child_id uuid,
  p_candidate_mapping_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.task_submissions%rowtype;
  v_governed_sources jsonb;
  v_input_ids uuid[];
  v_governed_ids uuid[];
  v_input_count integer;
  v_locked_count integer;
  v_valid_count integer;
  v_distinct_valid_count integer;
  v_transitioned_count integer;
  v_now timestamptz := timezone('utc', now());
begin
  if p_candidate_mapping_ids is null
    or cardinality(p_candidate_mapping_ids) = 0
  then
    raise exception 'R8C exact-ID handoff requires at least one candidate mapping ID.';
  end if;

  if array_position(p_candidate_mapping_ids, null) is not null then
    raise exception 'R8C exact-ID handoff candidate IDs cannot contain null.';
  end if;

  select array_agg(candidate_id order by candidate_id), count(*)
  into v_input_ids, v_input_count
  from (
    select distinct unnest(p_candidate_mapping_ids) as candidate_id
  ) input_ids;

  if v_input_count <> cardinality(p_candidate_mapping_ids) then
    raise exception 'R8C exact-ID handoff candidate IDs must be unique.';
  end if;

  select submission.*
  into v_submission
  from public.task_submissions submission
  where submission.id = p_submission_id
    and submission.parent_user_id = p_parent_user_id
    and submission.child_id = p_child_id
    and submission.parent_review_status = 'approved'
  for update;

  if not found then
    raise exception 'R8C exact-ID handoff requires the owning approved submission.';
  end if;

  perform 1
  from public.parent_verified_spelling_candidate_mappings candidate
  where candidate.id = any(v_input_ids)
  order by candidate.id
  for update;
  get diagnostics v_locked_count = row_count;

  if v_locked_count <> v_input_count then
    raise exception 'R8C exact-ID handoff contains a missing candidate mapping.';
  end if;

  perform 1
  from public.writing_issues issue
  join public.parent_verified_spelling_candidate_mappings candidate
    on candidate.parent_user_id = issue.parent_user_id
    and candidate.child_id = issue.child_id
    and candidate.source_misspelling_instance_id = issue.source_misspelling_instance_id
  where candidate.id = any(v_input_ids)
  order by issue.id
  for update of issue;

  v_governed_sources := public.collect_submission_thread_occurrence_sources(
    v_submission.task_id,
    p_parent_user_id,
    p_child_id
  );

  begin
    select array_agg(candidate_id order by candidate_id)
    into v_governed_ids
    from (
      select distinct (source ->> 'candidate_mapping_id')::uuid as candidate_id
      from jsonb_array_elements(v_governed_sources) source
    ) governed;
  exception when invalid_text_representation then
    raise exception 'The governed approval source set contains an invalid candidate identity.';
  end;

  v_governed_ids := coalesce(v_governed_ids, '{}'::uuid[]);
  if v_governed_ids is distinct from v_input_ids then
    raise exception 'R8C candidate IDs must exactly match the governed approval source set.';
  end if;

  select count(*), count(distinct candidate.id)
  into v_valid_count, v_distinct_valid_count
  from public.parent_verified_spelling_candidate_mappings candidate
  join public.writing_issues issue
    on issue.parent_user_id = candidate.parent_user_id
    and issue.child_id = candidate.child_id
    and issue.source_misspelling_instance_id = candidate.source_misspelling_instance_id
  where candidate.id = any(v_input_ids)
    and candidate.parent_user_id = p_parent_user_id
    and candidate.child_id = p_child_id
    and candidate.source_misspelling_instance_id is not null
    and candidate.candidate_status in (
      'parent_local_promoted',
      'global_canonical_promoted'
    )
    and (
      candidate.canonical_intake_handoff_state is null
      or candidate.canonical_intake_handoff_state in (
        'awaiting_r8c_exact_id_handoff',
        'r8c_exact_id_handed_off'
      )
    )
    and issue.issue_status = 'finalised'
    and issue.final_classification in (
      'fragile_knowledge',
      'concept_gap',
      'transfer_failure'
    )
    and lower(btrim(coalesce(nullif(issue.observed_text, ''), '')))
      = candidate.misspelling_normalized
    and lower(btrim(coalesce(
      nullif(issue.approved_replacement, ''),
      nullif(issue.suggested_replacement, '')
    ))) = candidate.correct_spelling_normalized
    and issue.micro_skill_key = candidate.micro_skill_key
    and exists (
      select 1
      from public.task_submissions candidate_submission
      where candidate_submission.id = candidate.task_submission_id
        and candidate_submission.parent_user_id = p_parent_user_id
        and candidate_submission.child_id = p_child_id
        and candidate_submission.task_id = v_submission.task_id
    )
    and exists (
      select 1
      from public.writing_issue_correction_attempts attempt
      join public.task_submissions attempt_submission
        on attempt_submission.id = attempt.task_submission_id
      where attempt.writing_issue_id = issue.id
        and attempt.parent_user_id = p_parent_user_id
        and attempt.child_id = p_child_id
        and attempt_submission.parent_user_id = p_parent_user_id
        and attempt_submission.child_id = p_child_id
        and attempt_submission.task_id = v_submission.task_id
    );

  if v_valid_count <> v_input_count
    or v_distinct_valid_count <> v_input_count
  then
    raise exception 'R8C exact-ID handoff source identity or final learning intent changed.';
  end if;

  update public.parent_verified_spelling_candidate_mappings candidate
  set
    canonical_intake_handoff_state = 'r8c_exact_id_handed_off',
    metadata = coalesce(candidate.metadata, '{}'::jsonb) || jsonb_build_object(
      'r8c_exact_id_handoff_version', 1,
      'r8c_exact_id_handoff_submission_id', p_submission_id,
      'r8c_exact_id_handed_off_at', v_now
    )
  where candidate.id = any(v_input_ids)
    and candidate.canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff';
  get diagnostics v_transitioned_count = row_count;

  return jsonb_build_object(
    'submission_id', p_submission_id,
    'candidate_mapping_ids', to_jsonb(v_input_ids),
    'governed_occurrence_sources', v_governed_sources,
    'transitioned_count', v_transitioned_count,
    'accepted_count', v_input_count,
    'handoff_state', 'r8c_exact_id_handed_off'
  );
end;
$$;

revoke all on function public.adle_authorize_parent_approval_exact_id_handoff(
  uuid, uuid, uuid, uuid[]
) from public, anon, authenticated;
grant execute on function public.adle_authorize_parent_approval_exact_id_handoff(
  uuid, uuid, uuid, uuid[]
) to service_role;

commit;
