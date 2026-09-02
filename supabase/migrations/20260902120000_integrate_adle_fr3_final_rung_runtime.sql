-- ADLE FR.3: mixed target-v2 final-rung runtime integration.
-- FR.1 decides; FR.2 verifies/persists; this migration only admits the
-- governed due shapes and routes supplied retirement plans atomically.
-- No policy/default flag or existing learner row is changed.

begin;

create or replace function public.persist_adle_review_assignment_c2b6(
  p_parent_user_id uuid,
  p_child_id uuid,
  p_plan_date date,
  p_assignment_id uuid,
  p_review_item_id uuid,
  p_review_session_id uuid,
  p_snapshot jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.adle_review_sessions%rowtype;
  v_rollout_state text;
  v_target jsonb;
  v_word public.adle_review_schedule_words%rowtype;
  v_due_kind text;
  v_due_on date;
  v_prompt jsonb;
  v_target_words text[];
  v_expected_ids uuid[];
  v_snapshot_ids uuid[];
  v_cap integer;
begin
  if p_parent_user_id is null or p_child_id is null or p_plan_date is null
    or p_assignment_id is null or p_review_item_id is null or p_review_session_id is null
    or not public.adle_review_snapshot_is_structurally_valid_v3(p_snapshot)
    or p_snapshot#>>'{assignment,assignmentId}' <> p_assignment_id::text
    or p_snapshot#>>'{assignment,reviewItemId}' <> p_review_item_id::text
  then raise exception 'invalid_review_c2b6_assignment_contract'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_child_id::text || ':' || p_plan_date::text || ':adle-review-r6', 0));
  if not exists (select 1 from public.children child where child.id=p_child_id
    and child.parent_user_id=p_parent_user_id and child.is_archived=false)
  then raise exception 'review_r6_child_not_owned_or_inactive'; end if;
  select rollout_state into v_rollout_state from public.adle_review_r6_child_rollouts
  where child_id=p_child_id;
  if v_rollout_state is distinct from 'active' then raise exception 'review_r6_scope_inactive'; end if;

  select * into v_existing from public.adle_review_sessions
  where child_id=p_child_id and completed_at is null order by created_at,id limit 1 for update;
  if found then return jsonb_build_object('outcome','reused_incomplete',
    'assignmentId',v_existing.daily_assignment_id,'reviewSessionId',v_existing.id); end if;
  if exists (select 1 from public.daily_assignments assignment
    where assignment.child_id=p_child_id and assignment.assignment_date=p_plan_date
      and ((assignment.title='ADLE Daily Plan' and assignment.assignment_generation_source='adle_composer_v1')
        or (assignment.title='ADLE Base-word Family Pilot' and assignment.assignment_generation_source='adle_base_word_family_pilot_v1')))
  then raise exception 'review_r6_assignment_day_conflict'; end if;

  select session_cap into v_cap from public.adle_review_policy_versions
  where schedule_policy_version='review_policy_v1_2026-07-04';
  if v_cap is null or jsonb_array_length(p_snapshot->'targets') > least(10,v_cap)
  then raise exception 'review_r6_target_cap_conflict'; end if;
  if not exists (select 1 from jsonb_array_elements(p_snapshot->'targets') target
    where target#>>'{schedule,schedulePolicyVersion}'='ADLE_SPACED_REVIEW_REGRESSION_V1'
      and target#>>'{schedule,wordScheduleVersion}'='adle_review_per_word_schedule_v2')
  then raise exception 'review_c2b6_target_pin_required'; end if;

  with due_words as (
    select word.id,word.taught_on,word.canonical_word_id,
      case
        when word.word_schedule_version='adle_review_per_word_schedule_v1' and word.membership_status='scheduled' then word.word_next_due_on
        when word.word_schedule_version='adle_review_per_word_schedule_v1' and word.membership_status='catch_up' then word.next_retest_due_on
        when word.word_schedule_version='adle_review_per_word_schedule_v1' and word.membership_status='awaiting_pre_retirement_check' then word.pre_retirement_check_due_on
        when word.word_schedule_version='adle_review_per_word_schedule_v2' and word.membership_status in ('scheduled','next_day_recovery') then word.word_next_due_on
        when word.word_schedule_version='adle_review_per_word_schedule_v2' and word.membership_status='awaiting_pre_retirement_check' then word.pre_retirement_check_due_on
        else null end due_on
    from public.adle_review_schedule_words word
    where word.child_id=p_child_id and word.row_status='active' and (
      (word.word_schedule_version='adle_review_per_word_schedule_v1' and word.word_schedule_policy_version='review_policy_v1_2026-07-04')
      or (word.word_schedule_version='adle_review_per_word_schedule_v2' and word.word_schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1'))
  ), selected as (
    select * from due_words where due_on<=p_plan_date
    order by due_on,taught_on,canonical_word_id,id limit least(10,v_cap)
  ) select array_agg(id order by due_on,taught_on,canonical_word_id,id)
    into v_expected_ids from selected;
  select array_agg((target#>>'{schedule,scheduleWordId}')::uuid order by (target->>'order')::integer)
    into v_snapshot_ids from jsonb_array_elements(p_snapshot->'targets') target;
  if coalesce(v_expected_ids,'{}'::uuid[]) is distinct from coalesce(v_snapshot_ids,'{}'::uuid[])
  then raise exception 'review_r6_oldest_due_selection_conflict'; end if;

  for v_prompt in select value from jsonb_array_elements(p_snapshot->'promptCandidates') loop
    if not exists (select 1 from public.adle_review_prompt_versions prompt
      where prompt.id=(v_prompt->>'promptVersionId')::uuid
        and prompt.stable_prompt_key=v_prompt->>'stablePromptKey'
        and prompt.challenge_type=v_prompt->>'challengeType'
        and prompt.content_version=v_prompt->>'contentVersion'
        and prompt.source_fingerprint=v_prompt#>>'{authority,sourceFingerprint}'
        and prompt.review_status='approved' and prompt.row_status='active')
    then raise exception 'review_r6_prompt_authority_conflict'; end if;
  end loop;

  for v_target in select value from jsonb_array_elements(p_snapshot->'targets') loop
    select * into v_word from public.adle_review_schedule_words
    where id=(v_target#>>'{schedule,scheduleWordId}')::uuid for update;
    v_due_kind:=v_target#>>'{schedule,dueKind}';
    v_due_on:=(v_target#>>'{schedule,dueOn}')::date;
    if not found or v_word.child_id<>p_child_id or v_word.row_status<>'active'
      or v_word.canonical_word_id<>(v_target->>'canonicalWordId')::uuid
      or v_word.word_schedule_version<>v_target#>>'{schedule,wordScheduleVersion}'
      or v_word.word_schedule_policy_version<>v_target#>>'{schedule,schedulePolicyVersion}'
      or v_word.word_interval_index<>(v_target#>>'{schedule,intervalIndex}')::integer
      or coalesce(v_word.bundle_id::text,'')<>coalesce(v_target#>>'{schedule,sourceBundleId}','')
      or v_due_on>p_plan_date
      or not (
        (v_word.word_schedule_version='adle_review_per_word_schedule_v1'
          and v_word.word_schedule_policy_version='review_policy_v1_2026-07-04'
          and ((v_due_kind='scheduled_review' and v_word.membership_status='scheduled' and v_word.word_next_due_on=v_due_on)
            or (v_due_kind='catch_up_retest' and v_word.membership_status='catch_up' and v_word.next_retest_due_on=v_due_on)
            or (v_due_kind='pre_retirement_check' and v_word.membership_status='awaiting_pre_retirement_check' and v_word.pre_retirement_check_due_on=v_due_on)))
        or (v_word.word_schedule_version='adle_review_per_word_schedule_v2'
          and v_word.word_schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1'
          and ((v_due_kind='scheduled_review' and v_word.membership_status='scheduled' and v_word.word_next_due_on=v_due_on)
            or (v_due_kind='next_day_recovery' and v_word.membership_status='next_day_recovery' and v_word.word_next_due_on=v_due_on)
            or (v_due_kind='pre_retirement_check' and v_word.membership_status='awaiting_pre_retirement_check'
              and v_word.word_interval_index=5 and v_word.pre_retirement_check_due_on=v_due_on)))
      )
    then raise exception 'review_r6_due_word_authority_conflict'; end if;
  end loop;

  select array_agg(target->>'canonicalSpelling' order by (target->>'order')::integer)
  into v_target_words from jsonb_array_elements(p_snapshot->'targets') target;
  insert into public.daily_assignments(id,child_id,parent_user_id,assignment_date,title,status,
    target_words,review_words,assignment_generation_source,lesson_route_metadata,compiled_review_snapshot)
  values(p_assignment_id,p_child_id,p_parent_user_id,p_plan_date,'ADLE Daily Plan','pending',
    v_target_words,v_target_words,'adle_composer_v1',null,p_snapshot);
  insert into public.assignment_items(id,daily_assignment_id,child_id,parent_user_id,domain_module,
    item_type,source_type,source_entity_id,learning_item_id,template_key,target_word,position,status,prompt_data,metadata)
  values(p_review_item_id,p_assignment_id,p_child_id,p_parent_user_id,'spelling',
    'review_writing_challenge','adle_review_session',p_review_session_id::text,null,
    'review_writing_challenge_v3',null,0,'pending',
    jsonb_build_object('snapshotFingerprint',p_snapshot#>>'{provenance,sourceFingerprint}'),
    jsonb_build_object('sectionKey','review_writing_challenge','r6MajorStage','review'));
  insert into public.adle_review_sessions(id,daily_assignment_id,assignment_item_id,child_id,parent_user_id,snapshot_fingerprint,stage)
  values(p_review_session_id,p_assignment_id,p_review_item_id,p_child_id,p_parent_user_id,
    p_snapshot#>>'{provenance,sourceFingerprint}','challenge_selection');
  for v_target in select value from jsonb_array_elements(p_snapshot->'targets') loop
    insert into public.adle_review_word_encounters(id,review_session_id,schedule_word_id,canonical_word_id,target_order,repair_state)
    values((v_target->>'encounterId')::uuid,p_review_session_id,
      (v_target#>>'{schedule,scheduleWordId}')::uuid,(v_target->>'canonicalWordId')::uuid,
      (v_target->>'order')::integer,'not_required');
  end loop;
  insert into public.adle_today_session_orchestrations(daily_assignment_id,child_id,parent_user_id,
    assignment_date,major_stage,review_generation_status,specialist_generation_status)
  values(p_assignment_id,p_child_id,p_parent_user_id,p_plan_date,'review','ready','not_started');
  return jsonb_build_object('outcome','created','assignmentId',p_assignment_id,
    'reviewSessionId',p_review_session_id,'snapshotFingerprint',p_snapshot#>>'{provenance,sourceFingerprint}');
end;
$$;

revoke all on function public.persist_adle_review_assignment_c2b6(uuid,uuid,date,uuid,uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.persist_adle_review_assignment_c2b6(uuid,uuid,date,uuid,uuid,uuid,jsonb)
  to service_role;


-- Atomic mixed-policy finalizer. `p_transition_plans` contains the exact
-- TypeScript reducer results. SQL validates immutable learner facts, exact
-- pins/from-state/revision and typed result shape, then persists the supplied
-- decisions. It contains no target transition table or rung algorithm.
create or replace function public.finalize_adle_review_c2b6(
  p_review_session_id uuid,
  p_snapshot_fingerprint text,
  p_idempotency_key text,
  p_completed_at timestamptz,
  p_review_completed_on date,
  p_transition_plans jsonb,
  p_request_fingerprint text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.adle_review_sessions%rowtype;
  v_assignment public.daily_assignments%rowtype;
  v_receipt public.adle_review_completion_receipts%rowtype;
  v_plan jsonb;
  v_target jsonb;
  v_encounter public.adle_review_word_encounters%rowtype;
  v_word public.adle_review_schedule_words%rowtype;
  v_attempt public.adle_assignment_attempt_events%rowtype;
  v_due_kind text;
  v_result_source text;
  v_expected_event text;
  v_current_state jsonb;
  v_to_state jsonb;
  v_envelope jsonb;
  v_transition_fingerprint text;
  v_retirement_result jsonb;
  v_latest timestamptz;
  v_governed_on date;
  v_grace integer;
  v_success integer:=0;
  v_failure integer:=0;
  v_authentic integer:=0;
  v_result jsonb;
  v_state_version integer;
begin
  if nullif(btrim(p_idempotency_key),'') is null
    or p_snapshot_fingerprint!~'^[a-f0-9]{64}$'
    or p_request_fingerprint!~'^[a-f0-9]{64}$'
    or jsonb_typeof(p_transition_plans)<>'array'
  then raise exception 'review_c2b6_finalization_envelope_malformed'; end if;
  select * into v_session from public.adle_review_sessions where id=p_review_session_id for update;
  if not found then raise exception 'review_session_not_found'; end if;
  select * into v_receipt from public.adle_review_completion_receipts where review_session_id=p_review_session_id;
  if found then
    if v_receipt.idempotency_key<>p_idempotency_key
      or v_receipt.snapshot_fingerprint<>p_snapshot_fingerprint
      or v_receipt.request_fingerprint<>p_request_fingerprint
    then raise exception 'review_finalization_conflict'; end if;
    return v_receipt.result_payload||jsonb_build_object('replayed',true);
  end if;
  select * into v_assignment from public.daily_assignments where id=v_session.daily_assignment_id for share;
  if v_assignment.id is null or v_session.snapshot_fingerprint<>p_snapshot_fingerprint
    or v_session.stage<>'ready_to_complete' or v_session.completed_at is not null
    or not public.adle_review_snapshot_is_structurally_valid_v3(v_assignment.compiled_review_snapshot)
    or jsonb_array_length(v_assignment.compiled_review_snapshot->'targets')<>jsonb_array_length(p_transition_plans)
    or p_completed_at>clock_timestamp()+interval '30 seconds'
    or p_completed_at<clock_timestamp()-interval '5 minutes'
  then raise exception 'review_c2b6_not_finalizable'; end if;
  if public.adle_canonical_json_sha256_v1(jsonb_build_object(
    'reviewSessionId',p_review_session_id,'snapshotFingerprint',p_snapshot_fingerprint,
    'completedAt',p_completed_at,'reviewCompletedOn',p_review_completed_on,
    'plans',p_transition_plans))<>p_request_fingerprint
  then raise exception 'review_c2b6_request_fingerprint_conflict'; end if;

  select completion_grace_minutes into v_grace from public.adle_review_policy_versions
    where schedule_policy_version='review_policy_v1_2026-07-04';
  select greatest(v_session.created_at,v_session.updated_at,v_session.writing_started_at,
    v_session.writing_submitted_at,
    (select max(created_at) from public.adle_review_transition_receipts where review_session_id=p_review_session_id),
    (select max(updated_at) from public.adle_review_word_encounters where review_session_id=p_review_session_id),
    (select max(repair.created_at) from public.adle_review_repair_attempts repair
      join public.adle_review_word_encounters encounter on encounter.id=repair.review_encounter_id
      where encounter.review_session_id=p_review_session_id)) into v_latest;
  if v_latest is null or v_latest>p_completed_at then raise exception 'invalid_review_activity_timeline'; end if;
  v_governed_on:=case
    when v_assignment.assignment_date=(p_completed_at at time zone 'Europe/London')::date
      then (p_completed_at at time zone 'Europe/London')::date
    when v_assignment.assignment_date+1=(p_completed_at at time zone 'Europe/London')::date
      and (v_latest at time zone 'Europe/London')::date=v_assignment.assignment_date
      and p_completed_at-v_latest<=make_interval(mins=>v_grace)
      then v_assignment.assignment_date
    else (p_completed_at at time zone 'Europe/London')::date end;
  if v_governed_on<>p_review_completed_on then raise exception 'review_c2b6_completion_date_conflict'; end if;

  perform 1 from public.adle_review_word_encounters where review_session_id=p_review_session_id order by target_order for update;
  perform 1 from public.adle_review_schedule_words word where word.id in
    (select schedule_word_id from public.adle_review_word_encounters where review_session_id=p_review_session_id)
    order by word.id for update;
  perform set_config('adle.r6_per_word_writer','on',true);

  for v_plan in select value from jsonb_array_elements(p_transition_plans) loop
    select * into v_encounter from public.adle_review_word_encounters
      where id=(v_plan->>'encounterId')::uuid and review_session_id=p_review_session_id;
    select value into v_target from jsonb_array_elements(v_assignment.compiled_review_snapshot->'targets')
      where value->>'encounterId'=v_plan->>'encounterId';
    select * into v_word from public.adle_review_schedule_words
      where id=(v_plan->>'scheduleWordId')::uuid;
    if v_encounter.id is null or v_target is null or v_word.id is null
      or v_encounter.schedule_word_id<>v_word.id
      or v_word.id<>(v_target#>>'{schedule,scheduleWordId}')::uuid
      or v_word.canonical_word_id<>v_encounter.canonical_word_id
      or v_word.child_id<>v_session.child_id or v_word.row_status<>'active'
      or v_word.word_schedule_transition_count<>(v_plan->>'expectedStateRevision')::bigint
      or v_word.word_schedule_version<>v_target#>>'{schedule,wordScheduleVersion}'
      or v_word.word_schedule_policy_version<>v_target#>>'{schedule,schedulePolicyVersion}'
      or v_word.word_interval_index<>(v_target#>>'{schedule,intervalIndex}')::integer
    then raise exception 'review_c2b6_plan_authority_conflict'; end if;
    if v_encounter.original_outcome not in ('success','failure')
      or v_encounter.original_outcome_source not in ('writing','audio_retrieval_check')
      or v_encounter.original_attempt_event_id is null
      or (v_encounter.original_outcome='failure' and v_encounter.repair_state not in ('completed_correct','attempted_not_secured'))
      or (v_encounter.original_outcome='success' and v_encounter.repair_state<>'not_required')
    then raise exception 'immutable_original_outcome_or_repair_incomplete'; end if;
    select * into v_attempt from public.adle_assignment_attempt_events where id=v_encounter.original_attempt_event_id;
    if v_attempt.id is null or v_attempt.child_id<>v_session.child_id
      or v_attempt.canonical_word_id<>v_word.canonical_word_id
      or v_attempt.daily_assignment_id<>v_session.daily_assignment_id
      or v_attempt.assignment_item_id<>v_session.assignment_item_id
      or v_attempt.evidence_class<>'scheduled_review_attempt'
    then raise exception 'original_attempt_provenance_conflict'; end if;

    v_due_kind:=v_target#>>'{schedule,dueKind}';
    if (v_target#>>'{schedule,dueOn}')::date>p_review_completed_on
    then raise exception 'review_frozen_due_identity_conflict'; end if;
    v_expected_event:=case
      when v_due_kind in ('scheduled_review','next_day_recovery') and v_encounter.original_outcome='success' then 'review_pass'
      when v_due_kind in ('scheduled_review','next_day_recovery') then 'review_fail'
      when v_due_kind='catch_up_retest' and v_encounter.original_outcome='success' then 'retest_pass'
      when v_due_kind='catch_up_retest' then 'retest_fail'
      when v_encounter.original_outcome='success' then 'retirement_check_pass'
      else 'retirement_check_fail' end;
    if v_plan->>'eventType'<>v_expected_event then raise exception 'review_c2b6_outcome_event_conflict'; end if;
    v_result_source:=case v_encounter.original_outcome_source when 'writing' then 'review_writing' else 'review_audio_check' end;

    insert into public.adle_review_outcome_events(id,child_id,canonical_word_id,bundle_id,event_type,occurred_on,
      interval_index,schedule_policy_version,daily_assignment_id,assignment_item_id,review_session_id,
      review_encounter_id,schedule_word_id,original_result,result_source,due_kind,frozen_due_on,
      frozen_interval_index,word_schedule_version,assignment_practice_date,review_completed_on,
      completed_at,original_attempted_at,writing_submitted_at,source_provenance)
    values((v_plan->>'outcomeEventId')::uuid,v_session.child_id,v_word.canonical_word_id,v_word.bundle_id,
      v_expected_event,p_review_completed_on,v_word.word_interval_index,v_word.word_schedule_policy_version,
      v_session.daily_assignment_id,v_session.assignment_item_id,p_review_session_id,v_encounter.id,v_word.id,
      v_encounter.original_outcome,v_result_source,v_due_kind,(v_target#>>'{schedule,dueOn}')::date,
      v_word.word_interval_index,v_word.word_schedule_version,v_assignment.assignment_date,
      p_review_completed_on,p_completed_at,v_attempt.created_at,v_session.writing_submitted_at,
      jsonb_build_object('authority','immutable_r3_r31_original_retrieval','originalAttemptEventId',v_encounter.original_attempt_event_id,
        'repairState',v_encounter.repair_state,'assignmentPracticeDate',v_assignment.assignment_date,
        'actualCompletedAt',p_completed_at,'governedReviewCompletedOn',p_review_completed_on));
    insert into public.adle_review_outcome_event_routes(outcome_event_id,learning_item_id,micro_skill_key)
      select (v_plan->>'outcomeEventId')::uuid,route.learning_item_id,route.micro_skill_key
      from public.adle_review_schedule_word_routes route where route.schedule_word_id=v_word.id and route.row_status='active'
      on conflict do nothing;

    if v_encounter.writing_disposition='correct_in_writing' and v_encounter.original_outcome='success'
      and v_encounter.original_outcome_source='writing' then
      insert into public.adle_authentic_use_events(child_id,canonical_word_id,occurred_on,use_kind,parent_verified,
        verified_at,piece_ref,source_ref,row_status,provenance_kind,review_session_id,review_encounter_id,
        daily_assignment_id,assignment_item_id,snapshot_fingerprint,prompt_version_id,writing_submitted_at,provenance)
      values(v_session.child_id,v_word.canonical_word_id,(v_session.writing_submitted_at at time zone 'Europe/London')::date,
        'authentic_correct_use',false,null,'review-r5-writing:'||p_review_session_id,
        'review-r5:'||p_review_session_id||':encounter:'||v_encounter.id,'active','prompted_review_writing_application',
        p_review_session_id,v_encounter.id,v_session.daily_assignment_id,v_session.assignment_item_id,
        p_snapshot_fingerprint,v_session.selected_prompt_version_id,v_session.writing_submitted_at,
        jsonb_build_object('evidenceRole','prompted_review_writing_application_only'));
      v_authentic:=v_authentic+1;
    end if;

    v_to_state:=v_plan->'toState';
    if v_plan->>'authority'='CURRENT_V1' then
      if v_word.word_schedule_version<>'adle_review_per_word_schedule_v1'
        or v_word.word_schedule_policy_version<>'review_policy_v1_2026-07-04'
        or v_to_state->>'stateShapeVersion'<>'adle_review_per_word_schedule_v1'
        or v_to_state->>'schedulePolicyVersion'<>'review_policy_v1_2026-07-04'
      then raise exception 'review_c2b6_current_plan_conflict'; end if;
      update public.adle_review_schedule_words set
        membership_status=v_to_state->>'membershipStatus',word_interval_index=(v_to_state->>'wordIntervalIndex')::integer,
        word_next_due_on=nullif(v_to_state->>'wordNextDueOn','')::date,
        catch_up_stage=(v_to_state->>'catchUpStage')::smallint,
        next_retest_due_on=nullif(v_to_state->>'nextRetestDueOn','')::date,
        failed_review_on=nullif(v_to_state->>'failedReviewOn','')::date,
        pre_retirement_check_due_on=nullif(v_to_state->>'preRetirementCheckDueOn','')::date,
        last_28_day_review_on=nullif(v_to_state->>'last28DayReviewOn','')::date,
        word_last_review_completed_on=p_review_completed_on,word_last_review_completed_at=p_completed_at,
        word_schedule_transition_count=word_schedule_transition_count+1,updated_at=timezone('utc',now())
      where id=v_word.id and word_schedule_transition_count=(v_plan->>'expectedStateRevision')::bigint;
      if not found then raise exception 'review_c2b6_stale_state_revision'; end if;
    elsif v_plan->>'authority'='TARGET_REGRESSION_V1' then
      if v_word.word_schedule_version<>'adle_review_per_word_schedule_v2'
        or v_word.word_schedule_policy_version<>'ADLE_SPACED_REVIEW_REGRESSION_V1'
      then raise exception 'review_c2b6_target_plan_conflict'; end if;
      v_current_state:=jsonb_build_object('stateShapeVersion',v_word.word_schedule_version,
        'schedulePolicyVersion',v_word.word_schedule_policy_version,'membershipStatus',v_word.membership_status,
        'wordIntervalIndex',v_word.word_interval_index,'wordNextDueOn',v_word.word_next_due_on,
        'consecutiveIndependentFailures',v_word.consecutive_independent_failures,'failureEpisodeId',v_word.failure_episode_id,
        'preRetirementCheckDueOn',v_word.pre_retirement_check_due_on,'last28DayReviewOn',v_word.last_28_day_review_on,
        'wordLastReviewCompletedOn',v_word.word_last_review_completed_on,'wordLastReviewCompletedAt',v_word.word_last_review_completed_at);
      if v_plan->'fromState'<>v_current_state or v_to_state->>'stateShapeVersion'<>'adle_review_per_word_schedule_v2'
        or v_to_state->>'schedulePolicyVersion'<>'ADLE_SPACED_REVIEW_REGRESSION_V1'
      then raise exception 'review_c2b6_target_state_conflict'; end if;
      v_envelope:=jsonb_build_object('scheduleWordId',v_word.id,'transitionKind','REVIEW_OUTCOME_APPLIED',
        'sourceReviewOutcomeEventId',(v_plan->>'outcomeEventId')::uuid,'sourceControlledGraduationReceiptId',null,
        'idempotencyKey',v_plan->>'idempotencyKey','expectedStateRevision',v_word.word_schedule_transition_count,
        'fromState',v_current_state,'toState',v_to_state,'transitionReason',v_plan->>'transitionReason',
        'reducerVersion',v_plan->>'reducerVersion','occurredAt',p_completed_at);
      v_transition_fingerprint:=public.adle_canonical_json_sha256_v1(v_envelope);
      if v_transition_fingerprint<>v_plan->>'sourceFingerprint' then raise exception 'review_c2b6_target_fingerprint_conflict'; end if;
      update public.adle_review_schedule_words set
        membership_status=v_to_state->>'membershipStatus',word_interval_index=(v_to_state->>'wordIntervalIndex')::integer,
        word_next_due_on=nullif(v_to_state->>'wordNextDueOn','')::date,
        consecutive_independent_failures=(v_to_state->>'consecutiveIndependentFailures')::smallint,
        failure_episode_id=nullif(v_to_state->>'failureEpisodeId','')::uuid,
        pre_retirement_check_due_on=nullif(v_to_state->>'preRetirementCheckDueOn','')::date,
        last_28_day_review_on=nullif(v_to_state->>'last28DayReviewOn','')::date,
        word_last_review_completed_on=nullif(v_to_state->>'wordLastReviewCompletedOn','')::date,
        word_last_review_completed_at=nullif(v_to_state->>'wordLastReviewCompletedAt','')::timestamptz,
        catch_up_stage=0,next_retest_due_on=null,failed_review_on=null,
        word_schedule_transition_count=word_schedule_transition_count+1,updated_at=timezone('utc',now())
      where id=v_word.id and word_schedule_transition_count=(v_plan->>'expectedStateRevision')::bigint;
      if not found then raise exception 'review_c2b6_stale_state_revision'; end if;
      insert into public.adle_review_schedule_transition_events(schedule_word_id,child_id,canonical_word_id,
        schedule_policy_version,state_shape_version,transition_kind,source_review_outcome_event_id,
        idempotency_key,expected_state_revision,applied_state_revision,from_state,to_state,
        transition_reason,reducer_version,source_fingerprint,occurred_at)
      values(v_word.id,v_word.child_id,v_word.canonical_word_id,v_word.word_schedule_policy_version,
        v_word.word_schedule_version,'REVIEW_OUTCOME_APPLIED',(v_plan->>'outcomeEventId')::uuid,
        v_plan->>'idempotencyKey',v_word.word_schedule_transition_count,v_word.word_schedule_transition_count+1,
        v_current_state,v_to_state,v_plan->>'transitionReason',v_plan->>'reducerVersion',v_transition_fingerprint,p_completed_at);
    elsif v_plan->>'authority'='TARGET_RETIREMENT_V1' then
      if v_word.word_schedule_version<>'adle_review_per_word_schedule_v2'
        or v_word.word_schedule_policy_version<>'ADLE_SPACED_REVIEW_REGRESSION_V1'
      then raise exception 'review_fr3_target_retirement_plan_conflict'; end if;
      v_current_state:=jsonb_build_object('stateShapeVersion',v_word.word_schedule_version,
        'schedulePolicyVersion',v_word.word_schedule_policy_version,'membershipStatus',v_word.membership_status,
        'wordIntervalIndex',v_word.word_interval_index,'wordNextDueOn',v_word.word_next_due_on,
        'consecutiveIndependentFailures',v_word.consecutive_independent_failures,'failureEpisodeId',v_word.failure_episode_id,
        'preRetirementCheckDueOn',v_word.pre_retirement_check_due_on,'last28DayReviewOn',v_word.last_28_day_review_on,
        'wordLastReviewCompletedOn',v_word.word_last_review_completed_on,'wordLastReviewCompletedAt',v_word.word_last_review_completed_at);
      if v_plan->'fromState'<>v_current_state
        or v_to_state->>'stateShapeVersion'<>'adle_review_per_word_schedule_v2'
        or v_to_state->>'schedulePolicyVersion'<>'ADLE_SPACED_REVIEW_REGRESSION_V1'
        or v_plan->>'reducerVersion'<>'ADLE_FINAL_RUNG_RETIREMENT_V1'
      then raise exception 'review_fr3_target_retirement_state_conflict'; end if;
      v_retirement_result:=public.persist_adle_final_rung_retirement_decision_fr2(
        v_word.id,
        (v_plan->>'outcomeEventId')::uuid,
        nullif(v_plan->>'qualifyingAuthenticUseEventId','')::uuid,
        nullif(v_plan->>'preRetirementCheckOutcomeEventId','')::uuid,
        nullif(v_plan->>'expectedPreRetirementCheckOutcomeEventId','')::uuid,
        v_plan->>'idempotencyKey',
        (v_plan->>'expectedStateRevision')::bigint,
        v_current_state,
        v_to_state,
        v_plan->>'retirementDecision',
        v_plan->>'transitionReason',
        case when jsonb_typeof(v_plan->'schedulerReducerInputState')='object'
          then v_plan->'schedulerReducerInputState' else null end,
        p_completed_at,
        v_plan->>'sourceFingerprint',
        v_plan->>'retirementSourceFingerprint'
      );
      if v_retirement_result->>'status'<>'persisted'
      then raise exception 'review_fr3_retirement_transition_not_applied'; end if;
    else raise exception 'review_c2b6_plan_authority_unknown'; end if;
    update public.adle_review_word_encounters set review_outcome_event_id=(v_plan->>'outcomeEventId')::uuid,
      updated_at=timezone('utc',now()) where id=v_encounter.id;
    if v_encounter.original_outcome='success' then v_success:=v_success+1; else v_failure:=v_failure+1; end if;
  end loop;

  v_state_version:=v_session.state_version+1;
  v_result:=jsonb_build_object('ok',true,'replayed',false,'reviewSessionId',p_review_session_id,
    'assignmentPracticeDate',v_assignment.assignment_date,'completedAt',p_completed_at,
    'reviewCompletedOn',p_review_completed_on,'successCount',v_success,'failureCount',v_failure,
    'promptedAuthenticUseCount',v_authentic,'transitionedWordCount',v_success+v_failure,
    'stateVersion',v_state_version);
  insert into public.adle_review_completion_receipts(review_session_id,idempotency_key,snapshot_fingerprint,
    request_fingerprint,completed_at,review_completed_on,result_payload)
  values(p_review_session_id,p_idempotency_key,p_snapshot_fingerprint,p_request_fingerprint,
    p_completed_at,p_review_completed_on,v_result);
  insert into public.adle_review_transition_receipts(review_session_id,idempotency_key,transition_kind,
    request_fingerprint,resulting_state_version)
  values(p_review_session_id,p_idempotency_key,'complete_review',p_request_fingerprint,v_state_version);
  update public.adle_review_sessions set stage='completed',completed_at=p_completed_at,
    state_version=v_state_version,updated_at=timezone('utc',now()) where id=p_review_session_id;
  update public.assignment_items set status='completed' where id=v_session.assignment_item_id
    and daily_assignment_id=v_session.daily_assignment_id;
  update public.adle_today_session_orchestrations set major_stage='specialist_generation',
    review_generation_status='completed',specialist_generation_status=case when specialist_generation_status='not_started' then 'generating' else specialist_generation_status end,
    review_completed_at=coalesce(review_completed_at,p_completed_at),
    completion_receipt_id=coalesce(completion_receipt_id,(select id from public.adle_review_completion_receipts where review_session_id=p_review_session_id)),
    state_version=state_version+case when major_stage='review' then 1 else 0 end,updated_at=timezone('utc',now())
  where daily_assignment_id=v_session.daily_assignment_id and major_stage in ('review','specialist_generation');
  return v_result||jsonb_build_object('assignmentItemCompleted',true,'nextMajorStage','specialist_generation');
end;
$$;

revoke all on function public.prepare_adle_review_finalization_c2b6(uuid,text) from public,anon,authenticated;
revoke all on function public.finalize_adle_review_c2b6(uuid,text,text,timestamptz,date,jsonb,text) from public,anon,authenticated;
grant execute on function public.prepare_adle_review_finalization_c2b6(uuid,text) to service_role;
grant execute on function public.finalize_adle_review_c2b6(uuid,text,text,timestamptz,date,jsonb,text) to service_role;


comment on function public.persist_adle_review_assignment_c2b6(
  uuid,uuid,date,uuid,uuid,uuid,jsonb
) is
  'FR.3 mixed R6 assignment verifier: admits due target final-rung and governed pre-retirement checks without calculating transitions.';

comment on function public.finalize_adle_review_c2b6(
  uuid,text,text,timestamptz,date,jsonb,text
) is
  'FR.3 atomic mixed finalizer: learner outcome first, then supplied FR.1 decision through the algorithm-free FR.2 CAS/receipt authority.';

commit;
