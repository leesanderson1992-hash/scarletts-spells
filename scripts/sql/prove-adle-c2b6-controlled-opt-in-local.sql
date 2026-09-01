do $$
declare
  v_schedule uuid := 'c2b2f000-0000-4000-8000-000000000006';
  v_child uuid := 'c2b2f000-0000-4000-8000-000000000004';
  v_preview text := repeat('a',64);
  v_approval text := 'C2B6_DISPOSABLE_LOCAL_ONLY';
  v_from jsonb;
  v_to jsonb;
  v_envelope jsonb;
  v_candidate jsonb;
  v_result jsonb;
  v_failed boolean;
begin
  select jsonb_build_object(
    'stateShapeVersion',word_schedule_version,'schedulePolicyVersion',word_schedule_policy_version,
    'membershipStatus',membership_status,'wordIntervalIndex',word_interval_index,
    'wordNextDueOn',word_next_due_on,'stateRevision',word_schedule_transition_count)
  into v_from from public.adle_review_schedule_words where id=v_schedule;
  select jsonb_build_object(
    'stateShapeVersion','adle_review_per_word_schedule_v2',
    'schedulePolicyVersion','ADLE_SPACED_REVIEW_REGRESSION_V1',
    'membershipStatus','scheduled','wordIntervalIndex',word_interval_index,
    'wordNextDueOn',word_next_due_on,'consecutiveIndependentFailures',0,
    'failureEpisodeId',null,'preRetirementCheckDueOn',null,
    'last28DayReviewOn',last_28_day_review_on,
    'wordLastReviewCompletedOn',word_last_review_completed_on,
    'wordLastReviewCompletedAt',word_last_review_completed_at)
  into v_to from public.adle_review_schedule_words where id=v_schedule;
  v_envelope:=jsonb_build_object(
    'scheduleWordId',v_schedule,'reviewedPreviewFingerprint',v_preview,
    'approvalReference',v_approval,
    'idempotencyKey','policy-cutover:'||v_preview||':'||v_schedule,
    'expectedStateRevision',7,'fromState',v_from,'toState',v_to,
    'transitionReason','POLICY_CUTOVER_APPROVED_CLEAN_SCHEDULED',
    'reducerVersion','POLICY_CUTOVER_NO_LEARNER_EVENT_V1');
  v_candidate:=jsonb_build_object(
    'scheduleWordId',v_schedule,'expectedRevision',7,
    'expectedPolicyVersion','review_policy_v1_2026-07-04',
    'expectedStateShapeVersion','adle_review_per_word_schedule_v1',
    'expectedMembershipStatus','scheduled','expectedIntervalIndex',1,
    'expectedDueOn','2099-02-01','expectedLast28DayReviewOn',null,
    'expectedLastReviewCompletedOn',null,'expectedLastReviewCompletedAt',null,
    'toState',v_to,'idempotencyKey','policy-cutover:'||v_preview||':'||v_schedule,
    'sourceFingerprint',public.adle_canonical_json_sha256_v1(v_envelope));
  v_result:=public.apply_adle_review_policy_cutover_c2b6(v_child,v_preview,v_approval,jsonb_build_array(v_candidate));
  if v_result->>'status'<>'applied' or (v_result->>'appliedCount')::int<>1
    or not exists(select 1 from public.adle_review_schedule_words where id=v_schedule
      and word_schedule_version='adle_review_per_word_schedule_v2'
      and word_schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1'
      and word_interval_index=1 and word_next_due_on='2099-02-01'
      and word_schedule_transition_count=8 and consecutive_independent_failures=0
      and failure_episode_id is null)
    or not exists(select 1 from public.adle_review_schedule_transition_events
      where schedule_word_id=v_schedule and transition_kind='POLICY_CUTOVER_APPLIED'
        and expected_state_revision=7 and applied_state_revision=8
        and cutover_approval_reference=v_approval)
  then raise exception 'c2b6_cutover_apply_proof_failed'; end if;

  v_result:=public.apply_adle_review_policy_cutover_c2b6(v_child,v_preview,v_approval,jsonb_build_array(v_candidate));
  if v_result->>'status'<>'already_applied' or (v_result->>'replayedCount')::int<>1
    or (select count(*) from public.adle_review_schedule_transition_events where schedule_word_id=v_schedule)<>1
  then raise exception 'c2b6_cutover_replay_proof_failed'; end if;

  v_failed:=false;
  begin
    perform public.apply_adle_review_policy_cutover_c2b6(v_child,v_preview,v_approval,
      jsonb_build_array(v_candidate||jsonb_build_object('idempotencyKey','stale-key')));
  exception when others then v_failed:=position('preview_drift' in sqlerrm)>0; end;
  if not v_failed then raise exception 'c2b6_stale_or_drift_rejection_failed'; end if;

  if (select is_active or is_default_for_new_schedules from public.adle_review_policy_versions
      where schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1')
  then raise exception 'c2b6_registry_flags_changed'; end if;
  if has_function_privilege('authenticated',
      'public.apply_adle_review_policy_cutover_c2b6(uuid,text,text,jsonb)','EXECUTE')
    or has_function_privilege('authenticated',
      'public.finalize_adle_review_c2b6(uuid,text,text,timestamptz,date,jsonb,text)','EXECUTE')
  then raise exception 'c2b6_authenticated_execute_leak'; end if;
end $$;

select 'C2B6_SQL_RECEIPT:'||jsonb_build_object(
  'cutoverRows',(select count(*) from public.adle_review_schedule_transition_events where transition_kind='POLICY_CUTOVER_APPLIED'),
  'targetRows',(select count(*) from public.adle_review_schedule_words where word_schedule_version='adle_review_per_word_schedule_v2'),
  'targetActive',(select is_active from public.adle_review_policy_versions where schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1'),
  'targetDefault',(select is_default_for_new_schedules from public.adle_review_policy_versions where schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1'),
  'rungPreserved',(select word_interval_index=1 from public.adle_review_schedule_words where id='c2b2f000-0000-4000-8000-000000000006'),
  'duePreserved',(select word_next_due_on='2099-02-01' from public.adle_review_schedule_words where id='c2b2f000-0000-4000-8000-000000000006'),
  'revision',(select word_schedule_transition_count from public.adle_review_schedule_words where id='c2b2f000-0000-4000-8000-000000000006')
)::text;
