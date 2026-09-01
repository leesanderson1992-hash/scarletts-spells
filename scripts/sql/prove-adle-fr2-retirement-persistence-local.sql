begin;

do $fr2_proof$
declare
  v_parent constant uuid := 'f2200000-0000-4000-8000-000000000001';
  v_child constant uuid := 'f2200000-0000-4000-8000-000000000002';
  v_child_purge constant uuid := 'f2200000-0000-4000-8000-000000000003';
  v_child_clean constant uuid := 'f2200000-0000-4000-8000-000000000004';
  v_word uuid;
  v_word_two uuid;
  v_bundle constant uuid := 'f2200000-0000-4000-8000-000000000010';
  v_auth_bundle constant uuid := 'f2200000-0000-4000-8000-000000000011';
  v_v1_bundle constant uuid := 'f2200000-0000-4000-8000-000000000012';
  v_clean_bundle constant uuid := 'f2200000-0000-4000-8000-000000000013';
  v_schedule constant uuid := 'f2200000-0000-4000-8000-000000000101';
  v_auth_schedule constant uuid := 'f2200000-0000-4000-8000-000000000102';
  v_v1_schedule constant uuid := 'f2200000-0000-4000-8000-000000000103';
  v_clean_schedule constant uuid := 'f2200000-0000-4000-8000-000000000104';
  v_assignment constant uuid := 'f2200000-0000-4000-8000-000000000200';
  v_auth_assignment constant uuid := 'f2200000-0000-4000-8000-000000000201';
  v_outcome_day56 constant uuid := 'f2200000-0000-4000-8000-000000000501';
  v_outcome_check_fail constant uuid := 'f2200000-0000-4000-8000-000000000502';
  v_outcome_recovery constant uuid := 'f2200000-0000-4000-8000-000000000503';
  v_outcome_auth constant uuid := 'f2200000-0000-4000-8000-000000000504';
  v_authentic constant uuid := 'f2200000-0000-4000-8000-000000000601';
  v_from jsonb;
  v_to jsonb;
  v_scheduler_input jsonb;
  v_transition_envelope jsonb;
  v_retirement_envelope jsonb;
  v_transition_fingerprint text;
  v_retirement_fingerprint text;
  v_result jsonb;
  v_retry jsonb;
  v_receipt_await uuid;
  v_receipt_fail uuid;
  v_receipt_post uuid;
  v_receipt_auth uuid;
begin
  if has_table_privilege(
      'anon', 'public.adle_review_retirement_decision_receipts', 'SELECT'
    )
    or has_table_privilege(
      'authenticated', 'public.adle_review_retirement_decision_receipts', 'SELECT'
    )
    or has_table_privilege(
      'service_role', 'public.adle_review_retirement_decision_receipts', 'INSERT'
    )
    or not has_table_privilege(
      'service_role', 'public.adle_review_retirement_decision_receipts', 'SELECT'
    )
    or has_function_privilege(
      'authenticated',
      'public.persist_adle_final_rung_retirement_decision_fr2(uuid,uuid,uuid,uuid,uuid,text,bigint,jsonb,jsonb,text,text,jsonb,timestamptz,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.persist_adle_final_rung_retirement_decision_fr2(uuid,uuid,uuid,uuid,uuid,text,bigint,jsonb,jsonb,text,text,jsonb,timestamptz,text,text)',
      'EXECUTE'
    )
  then raise exception 'FR2 security boundary failed'; end if;

  if exists (
    select 1 from pg_trigger trigger
    where trigger.tgrelid =
      'public.adle_review_retirement_decision_receipts'::regclass
      and not trigger.tgisinternal
      and pg_get_triggerdef(trigger.oid) ilike '%delete%'
  ) then raise exception 'FR2 installed a blanket receipt delete trigger'; end if;

  insert into public.canonical_teaching_dictionary_import_batches (
    id, source_folder_path, import_mode, batch_status
  ) values (
    'f2200000-0000-4000-8000-000000000900',
    'disposable/fr2-proof', 'local_dev_import', 'applied'
  );
  insert into public.canonical_teaching_dictionary_words (
    id, import_batch_id, row_status, source_sheet, source_row_number,
    source_row_hash, word_key, normalised_word, display_word,
    source_category, confidence, review_status
  ) values
    ('f2200000-0000-4000-8000-000000000901',
      'f2200000-0000-4000-8000-000000000900', 'active', 'proof', 2,
      repeat('3', 64), 'fr2-proof-one', 'fr2proofone', 'fr2proofone',
      'internal_reviewed_seed', 'high', 'approved_for_first_exposure'),
    ('f2200000-0000-4000-8000-000000000902',
      'f2200000-0000-4000-8000-000000000900', 'active', 'proof', 3,
      repeat('4', 64), 'fr2-proof-two', 'fr2prooftwo', 'fr2prooftwo',
      'internal_reviewed_seed', 'high', 'approved_for_first_exposure');
  v_word := 'f2200000-0000-4000-8000-000000000901';
  v_word_two := 'f2200000-0000-4000-8000-000000000902';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_parent,
    'authenticated', 'authenticated', 'fr2-parent@example.test', '',
    timezone('utc', now()), '{}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now())
  );
  insert into public.children(id, parent_user_id, first_name) values
    (v_child, v_parent, 'FR2'),
    (v_child_purge, v_parent, 'FR2 protected'),
    (v_child_clean, v_parent, 'FR2 clean cascade');

  insert into public.adle_review_bundles (
    id, child_id, source_ref, interval_index, next_due_on,
    schedule_policy_version, bundle_status, row_status
  ) values
    (v_bundle, v_child, 'fr2-main', 5, '2099-01-10',
      'ADLE_SPACED_REVIEW_REGRESSION_V1', 'active', 'active'),
    (v_auth_bundle, v_child_purge, 'fr2-auth', 5, '2099-01-12',
      'ADLE_SPACED_REVIEW_REGRESSION_V1', 'active', 'active'),
    (v_v1_bundle, v_child, 'fr2-v1', 0, '2099-01-15',
      'review_policy_v1_2026-07-04', 'active', 'active'),
    (v_clean_bundle, v_child_clean, 'fr2-clean', 0, '2099-01-15',
      'review_policy_v1_2026-07-04', 'active', 'active');

  insert into public.adle_review_schedule_words (
    id, child_id, canonical_word_id, bundle_id, membership_status,
    taught_on, row_status, word_schedule_version, word_interval_index,
    word_next_due_on, word_schedule_policy_version,
    consecutive_independent_failures, failure_episode_id,
    last_28_day_review_on, word_last_review_completed_on,
    word_last_review_completed_at
  ) values
    (v_schedule, v_child, v_word, v_bundle, 'scheduled', '2098-01-01',
      'active', 'adle_review_per_word_schedule_v2', 5, '2099-01-10',
      'ADLE_SPACED_REVIEW_REGRESSION_V1', 0, null, '2098-11-15',
      '2098-11-15', '2098-11-15T12:00:00Z'),
    (v_auth_schedule, v_child_purge, v_word_two, v_auth_bundle, 'scheduled',
      '2098-01-01', 'active', 'adle_review_per_word_schedule_v2', 5,
      '2099-01-12', 'ADLE_SPACED_REVIEW_REGRESSION_V1', 0, null,
      '2098-11-17', '2098-11-17', '2098-11-17T12:00:00Z');
  insert into public.adle_review_schedule_words (
    id, child_id, canonical_word_id, bundle_id, membership_status,
    taught_on, row_status, word_schedule_version, word_interval_index,
    word_next_due_on, word_schedule_policy_version
  ) values (
    v_v1_schedule, v_child, v_word_two, v_v1_bundle, 'scheduled',
    '2099-01-01', 'active', 'adle_review_per_word_schedule_v1', 0,
    '2099-01-15', 'review_policy_v1_2026-07-04'
  ), (
    v_clean_schedule, v_child_clean, v_word, v_clean_bundle, 'scheduled',
    '2099-01-01', 'active', 'adle_review_per_word_schedule_v1', 0,
    '2099-01-15', 'review_policy_v1_2026-07-04'
  );

  insert into public.daily_assignments (
    id, child_id, parent_user_id, assignment_date, title, status,
    assignment_generation_source
  ) values
    (v_assignment, v_child, v_parent, '2099-01-10', 'FR2 proof',
      'completed', 'adle_review_writing_challenge_v3'),
    (v_auth_assignment, v_child_purge, v_parent, '2099-01-12',
      'FR2 auth proof', 'completed', 'adle_review_writing_challenge_v3');
  insert into public.assignment_items (
    id, daily_assignment_id, child_id, parent_user_id, domain_module,
    item_type, source_type, source_entity_id, target_word, position,
    status, metadata
  ) values
    ('f2200000-0000-4000-8000-000000000211', v_assignment, v_child,
      v_parent, 'spelling', 'adle_review', 'adle_review', 'fr2-1',
      'fr2proofone', 1, 'completed', '{}'::jsonb),
    ('f2200000-0000-4000-8000-000000000212', v_assignment, v_child,
      v_parent, 'spelling', 'adle_review', 'adle_review', 'fr2-2',
      'fr2proofone', 2, 'completed', '{}'::jsonb),
    ('f2200000-0000-4000-8000-000000000213', v_assignment, v_child,
      v_parent, 'spelling', 'adle_review', 'adle_review', 'fr2-3',
      'fr2proofone', 3, 'completed', '{}'::jsonb),
    ('f2200000-0000-4000-8000-000000000214', v_auth_assignment,
      v_child_purge, v_parent, 'spelling', 'adle_review', 'adle_review',
      'fr2-4', 'fr2prooftwo', 1, 'completed', '{}'::jsonb);

  insert into public.adle_review_sessions (
    id, daily_assignment_id, assignment_item_id, child_id, parent_user_id,
    snapshot_fingerprint, stage, completed_at
  ) values
    ('f2200000-0000-4000-8000-000000000301', v_assignment,
      'f2200000-0000-4000-8000-000000000211', v_child, v_parent,
      repeat('a', 64), 'completed', '2099-01-10T12:00:00Z'),
    ('f2200000-0000-4000-8000-000000000302', v_assignment,
      'f2200000-0000-4000-8000-000000000212', v_child, v_parent,
      repeat('b', 64), 'completed', '2099-05-02T12:00:00Z'),
    ('f2200000-0000-4000-8000-000000000303', v_assignment,
      'f2200000-0000-4000-8000-000000000213', v_child, v_parent,
      repeat('c', 64), 'completed', '2099-05-03T12:00:00Z'),
    ('f2200000-0000-4000-8000-000000000304', v_auth_assignment,
      'f2200000-0000-4000-8000-000000000214', v_child_purge, v_parent,
      repeat('d', 64), 'completed', '2099-01-12T12:00:00Z');

  insert into public.adle_review_word_encounters (
    id, review_session_id, schedule_word_id, canonical_word_id,
    target_order, writing_disposition, original_outcome,
    original_outcome_source, repair_state, repair_terminal_at,
    repair_stage, repair_attempt_count
  ) values
    ('f2200000-0000-4000-8000-000000000401',
      'f2200000-0000-4000-8000-000000000301', v_schedule, v_word, 1,
      'correct_in_writing', 'success', 'writing', 'not_required', null,
      null, 0),
    ('f2200000-0000-4000-8000-000000000402',
      'f2200000-0000-4000-8000-000000000302', v_schedule, v_word, 1,
      'unaccounted_for', 'failure', 'audio_retrieval_check',
      'attempted_not_secured', '2099-05-02T12:01:00Z', 'terminal', 1),
    ('f2200000-0000-4000-8000-000000000403',
      'f2200000-0000-4000-8000-000000000303', v_schedule, v_word, 1,
      'unaccounted_for', 'success', 'audio_retrieval_check',
      'not_required', null, null, 0),
    ('f2200000-0000-4000-8000-000000000404',
      'f2200000-0000-4000-8000-000000000304', v_auth_schedule,
      v_word_two, 1, 'correct_in_writing', 'success', 'writing',
      'not_required', null, null, 0);

  insert into public.adle_review_outcome_events (
    id, child_id, canonical_word_id, bundle_id, event_type, occurred_on,
    interval_index, schedule_policy_version, daily_assignment_id,
    assignment_item_id, review_session_id, review_encounter_id,
    schedule_word_id, original_result, result_source, due_kind,
    frozen_due_on, frozen_interval_index, word_schedule_version,
    assignment_practice_date, review_completed_on, completed_at,
    source_provenance
  ) values
    (v_outcome_day56, v_child, v_word, v_bundle, 'review_pass',
      '2099-01-10', 5, 'ADLE_SPACED_REVIEW_REGRESSION_V1', v_assignment,
      'f2200000-0000-4000-8000-000000000211',
      'f2200000-0000-4000-8000-000000000301',
      'f2200000-0000-4000-8000-000000000401', v_schedule, 'success',
      'review_writing', 'scheduled_review', '2099-01-10', 5,
      'adle_review_per_word_schedule_v2', '2099-01-10', '2099-01-10',
      '2099-01-10T12:00:00Z', jsonb_build_object('proof', 'fr2')),
    (v_outcome_check_fail, v_child, v_word, v_bundle,
      'retirement_check_fail', '2099-05-02', 5,
      'ADLE_SPACED_REVIEW_REGRESSION_V1', v_assignment,
      'f2200000-0000-4000-8000-000000000212',
      'f2200000-0000-4000-8000-000000000302',
      'f2200000-0000-4000-8000-000000000402', v_schedule, 'failure',
      'review_audio_check', 'pre_retirement_check', '2099-05-02', 5,
      'adle_review_per_word_schedule_v2', '2099-01-10', '2099-05-02',
      '2099-05-02T12:00:00Z', jsonb_build_object('proof', 'fr2')),
    (v_outcome_recovery, v_child, v_word, v_bundle, 'review_pass',
      '2099-05-03', 5, 'ADLE_SPACED_REVIEW_REGRESSION_V1', v_assignment,
      'f2200000-0000-4000-8000-000000000213',
      'f2200000-0000-4000-8000-000000000303',
      'f2200000-0000-4000-8000-000000000403', v_schedule, 'success',
      'review_audio_check', 'next_day_recovery', '2099-05-03', 5,
      'adle_review_per_word_schedule_v2', '2099-01-10', '2099-05-03',
      '2099-05-03T12:00:00Z', jsonb_build_object('proof', 'fr2')),
    (v_outcome_auth, v_child_purge, v_word_two, v_auth_bundle,
      'review_pass', '2099-01-12', 5, 'ADLE_SPACED_REVIEW_REGRESSION_V1',
      v_auth_assignment, 'f2200000-0000-4000-8000-000000000214',
      'f2200000-0000-4000-8000-000000000304',
      'f2200000-0000-4000-8000-000000000404', v_auth_schedule,
      'success', 'review_writing', 'scheduled_review', '2099-01-12', 5,
      'adle_review_per_word_schedule_v2', '2099-01-12', '2099-01-12',
      '2099-01-12T12:00:00Z', jsonb_build_object('proof', 'fr2'));

  insert into public.adle_authentic_use_events (
    id, child_id, canonical_word_id, occurred_on, verified_at, use_kind,
    parent_verified, piece_ref, source_ref, row_status, provenance_kind,
    provenance
  ) values (
    v_authentic, v_child_purge, v_word_two, '2098-12-20',
    '2098-12-21T12:00:00Z', 'authentic_correct_use', true,
    'fr2-auth-piece', 'fr2-auth-source', 'active',
    'independent_or_parent_verified_application',
    jsonb_build_object('proof', 'fr2')
  );

  -- DAY_56 pass without authentic evidence enters the single check wait.
  v_from := jsonb_build_object(
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'membershipStatus', 'scheduled', 'wordIntervalIndex', 5,
    'wordNextDueOn', '2099-01-10'::date,
    'consecutiveIndependentFailures', 0, 'failureEpisodeId', null,
    'preRetirementCheckDueOn', null,
    'last28DayReviewOn', '2098-11-15'::date,
    'wordLastReviewCompletedOn', '2098-11-15'::date,
    'wordLastReviewCompletedAt', '2098-11-15T12:00:00Z'::timestamptz
  );
  v_to := jsonb_build_object(
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'membershipStatus', 'awaiting_pre_retirement_check',
    'wordIntervalIndex', 5, 'wordNextDueOn', null,
    'consecutiveIndependentFailures', 0, 'failureEpisodeId', null,
    'preRetirementCheckDueOn', '2099-05-02'::date,
    'last28DayReviewOn', '2098-11-15'::date,
    'wordLastReviewCompletedOn', '2099-01-10'::date,
    'wordLastReviewCompletedAt', '2099-01-10T12:00:00Z'::timestamptz
  );
  v_transition_envelope := jsonb_build_object(
    'scheduleWordId', v_schedule, 'transitionKind', 'REVIEW_OUTCOME_APPLIED',
    'sourceReviewOutcomeEventId', v_outcome_day56,
    'sourceControlledGraduationReceiptId', null,
    'idempotencyKey', 'fr2-await', 'expectedStateRevision', 0,
    'fromState', v_from, 'toState', v_to,
    'transitionReason', 'DAY_56_PASS_TO_PRE_RETIREMENT_CHECK',
    'reducerVersion', 'ADLE_FINAL_RUNG_RETIREMENT_V1',
    'occurredAt', '2099-01-10T12:00:00Z'::timestamptz
  );
  v_transition_fingerprint :=
    public.adle_canonical_json_sha256_v1(v_transition_envelope);
  v_retirement_envelope := jsonb_build_object(
    'scheduleWordId', v_schedule,
    'sourceReviewOutcomeEventId', v_outcome_day56,
    'qualifyingAuthenticUseEventId', null,
    'preRetirementCheckOutcomeEventId', null,
    'expectedPreRetirementCheckOutcomeEventId', null,
    'idempotencyKey', 'fr2-await',
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'retirementPolicyVersion', 'ADLE_FINAL_RUNG_RETIREMENT_V1',
    'retirementStateVersion', 'adle_final_rung_retirement_v1',
    'decision', 'AWAIT_PRE_RETIREMENT_CHECK',
    'decisionReason', 'DAY_56_PASS_TO_PRE_RETIREMENT_CHECK',
    'schedulerReducerInputState', null,
    'expectedStateRevision', 0, 'appliedStateRevision', 1,
    'transitionSourceFingerprint', v_transition_fingerprint,
    'occurredAt', '2099-01-10T12:00:00Z'::timestamptz
  );
  v_retirement_fingerprint :=
    public.adle_canonical_json_sha256_v1(v_retirement_envelope);
  v_result := public.persist_adle_final_rung_retirement_decision_fr2(
    v_schedule, v_outcome_day56, null, null, null, 'fr2-await', 0,
    v_from, v_to, 'AWAIT_PRE_RETIREMENT_CHECK',
    'DAY_56_PASS_TO_PRE_RETIREMENT_CHECK', null,
    '2099-01-10T12:00:00Z', v_transition_fingerprint,
    v_retirement_fingerprint
  );
  v_retry := public.persist_adle_final_rung_retirement_decision_fr2(
    v_schedule, v_outcome_day56, null, null, null, 'fr2-await', 0,
    v_from, v_to, 'AWAIT_PRE_RETIREMENT_CHECK',
    'DAY_56_PASS_TO_PRE_RETIREMENT_CHECK', null,
    '2099-01-10T12:00:00Z', v_transition_fingerprint,
    v_retirement_fingerprint
  );
  v_receipt_await := (v_result->>'retirementReceiptId')::uuid;
  if v_result->>'status' <> 'persisted'
    or v_retry->>'status' <> 'already_persisted'
    or v_receipt_await is distinct from
      (v_retry->>'retirementReceiptId')::uuid
    or not exists (
      select 1 from public.adle_review_schedule_words
      where id = v_schedule
        and membership_status = 'awaiting_pre_retirement_check'
        and pre_retirement_check_due_on = '2099-05-02'
        and pre_retirement_check_outcome_event_id is null
        and word_schedule_transition_count = 1
    )
  then raise exception 'FR2 awaiting-check persistence failed'; end if;

  begin
    perform public.persist_adle_final_rung_retirement_decision_fr2(
      v_schedule, v_outcome_day56, null, null, null, 'fr2-await', 0,
      v_from, v_to, 'AWAIT_PRE_RETIREMENT_CHECK',
      'DAY_56_PASS_TO_PRE_RETIREMENT_CHECK', null,
      '2099-01-10T12:00:00Z', v_transition_fingerprint, repeat('0', 64)
    );
    raise exception 'FR2_EXPECTED_CONFLICTING_REPLAY_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'FR2_EXPECTED_CONFLICTING_REPLAY_REJECTION_MISSING'
    then raise; end if;
    if sqlerrm <> 'adle_fr2_retirement_idempotency_conflict' then raise; end if;
  end;

  -- Failed check persists dedicated lineage and delegates supplied recovery.
  v_from := v_to;
  v_to := jsonb_build_object(
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'membershipStatus', 'next_day_recovery', 'wordIntervalIndex', 5,
    'wordNextDueOn', '2099-05-03'::date,
    'consecutiveIndependentFailures', 1,
    'failureEpisodeId', v_outcome_check_fail,
    'preRetirementCheckDueOn', null,
    'last28DayReviewOn', '2098-11-15'::date,
    'wordLastReviewCompletedOn', '2099-05-02'::date,
    'wordLastReviewCompletedAt', '2099-05-02T12:00:00Z'::timestamptz
  );
  v_scheduler_input := jsonb_build_object(
    'route', jsonb_build_object(
      'membership', 'SCHEDULED', 'rung', 'DAY_56',
      'dueOn', '2099-05-02', 'regressionOrigin', null
    ),
    'failureLineage', jsonb_build_object(
      'resolution', 'NONE', 'episodeId', null,
      'consecutiveIndependentFailures', 0
    ),
    'appliedEventIds', jsonb_build_array(v_outcome_day56)
  );
  v_transition_envelope := jsonb_build_object(
    'scheduleWordId', v_schedule, 'transitionKind', 'REVIEW_OUTCOME_APPLIED',
    'sourceReviewOutcomeEventId', v_outcome_check_fail,
    'sourceControlledGraduationReceiptId', null,
    'idempotencyKey', 'fr2-check-fail', 'expectedStateRevision', 1,
    'fromState', v_from, 'toState', v_to,
    'transitionReason', 'PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY',
    'reducerVersion', 'ADLE_FINAL_RUNG_RETIREMENT_V1',
    'occurredAt', '2099-05-02T12:00:00Z'::timestamptz
  );
  v_transition_fingerprint :=
    public.adle_canonical_json_sha256_v1(v_transition_envelope);
  v_retirement_envelope := jsonb_build_object(
    'scheduleWordId', v_schedule,
    'sourceReviewOutcomeEventId', v_outcome_check_fail,
    'qualifyingAuthenticUseEventId', null,
    'preRetirementCheckOutcomeEventId', v_outcome_check_fail,
    'expectedPreRetirementCheckOutcomeEventId', null,
    'idempotencyKey', 'fr2-check-fail',
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'retirementPolicyVersion', 'ADLE_FINAL_RUNG_RETIREMENT_V1',
    'retirementStateVersion', 'adle_final_rung_retirement_v1',
    'decision', 'CONTINUE_V2_RECOVERY',
    'decisionReason', 'PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY',
    'schedulerReducerInputState', v_scheduler_input,
    'expectedStateRevision', 1, 'appliedStateRevision', 2,
    'transitionSourceFingerprint', v_transition_fingerprint,
    'occurredAt', '2099-05-02T12:00:00Z'::timestamptz
  );
  v_retirement_fingerprint :=
    public.adle_canonical_json_sha256_v1(v_retirement_envelope);
  v_result := public.persist_adle_final_rung_retirement_decision_fr2(
    v_schedule, v_outcome_check_fail, null, v_outcome_check_fail, null,
    'fr2-check-fail', 1, v_from, v_to, 'CONTINUE_V2_RECOVERY',
    'PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY', v_scheduler_input,
    '2099-05-02T12:00:00Z', v_transition_fingerprint,
    v_retirement_fingerprint
  );
  v_receipt_fail := (v_result->>'retirementReceiptId')::uuid;
  if not exists (
    select 1 from public.adle_review_schedule_words
    where id = v_schedule and membership_status = 'next_day_recovery'
      and word_next_due_on = '2099-05-03'
      and pre_retirement_check_due_on is null
      and pre_retirement_check_outcome_event_id = v_outcome_check_fail
      and consecutive_independent_failures = 1
      and failure_episode_id = v_outcome_check_fail
      and word_schedule_transition_count = 2
  ) or not exists (
    select 1 from public.adle_review_retirement_decision_receipts
    where id = v_receipt_fail
      and pre_retirement_check_outcome_event_id = v_outcome_check_fail
      and scheduler_reducer_input_state = v_scheduler_input
  ) then raise exception 'FR2 failed-check lineage persistence failed'; end if;

  -- Later successful Day-56 recovery retires with the same failed-check
  -- lineage and no second-wait ambiguity.
  v_from := v_to;
  v_to := jsonb_build_object(
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'membershipStatus', 'retired', 'wordIntervalIndex', 5,
    'wordNextDueOn', null, 'consecutiveIndependentFailures', 0,
    'failureEpisodeId', null, 'preRetirementCheckDueOn', null,
    'last28DayReviewOn', '2098-11-15'::date,
    'wordLastReviewCompletedOn', '2099-05-03'::date,
    'wordLastReviewCompletedAt', '2099-05-03T12:00:00Z'::timestamptz
  );
  v_transition_envelope := jsonb_build_object(
    'scheduleWordId', v_schedule, 'transitionKind', 'REVIEW_OUTCOME_APPLIED',
    'sourceReviewOutcomeEventId', v_outcome_recovery,
    'sourceControlledGraduationReceiptId', null,
    'idempotencyKey', 'fr2-post-check-retire', 'expectedStateRevision', 2,
    'fromState', v_from, 'toState', v_to,
    'transitionReason', 'POST_CHECK_FINAL_RUNG_PASS_RETIRED',
    'reducerVersion', 'ADLE_FINAL_RUNG_RETIREMENT_V1',
    'occurredAt', '2099-05-03T12:00:00Z'::timestamptz
  );
  v_transition_fingerprint :=
    public.adle_canonical_json_sha256_v1(v_transition_envelope);
  v_retirement_envelope := jsonb_build_object(
    'scheduleWordId', v_schedule,
    'sourceReviewOutcomeEventId', v_outcome_recovery,
    'qualifyingAuthenticUseEventId', null,
    'preRetirementCheckOutcomeEventId', v_outcome_check_fail,
    'expectedPreRetirementCheckOutcomeEventId', v_outcome_check_fail,
    'idempotencyKey', 'fr2-post-check-retire',
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'retirementPolicyVersion', 'ADLE_FINAL_RUNG_RETIREMENT_V1',
    'retirementStateVersion', 'adle_final_rung_retirement_v1',
    'decision', 'RETIRE',
    'decisionReason', 'POST_CHECK_FINAL_RUNG_PASS_RETIRED',
    'schedulerReducerInputState', null,
    'expectedStateRevision', 2, 'appliedStateRevision', 3,
    'transitionSourceFingerprint', v_transition_fingerprint,
    'occurredAt', '2099-05-03T12:00:00Z'::timestamptz
  );
  v_retirement_fingerprint :=
    public.adle_canonical_json_sha256_v1(v_retirement_envelope);
  v_result := public.persist_adle_final_rung_retirement_decision_fr2(
    v_schedule, v_outcome_recovery, null, v_outcome_check_fail,
    v_outcome_check_fail, 'fr2-post-check-retire', 2, v_from, v_to,
    'RETIRE', 'POST_CHECK_FINAL_RUNG_PASS_RETIRED', null,
    '2099-05-03T12:00:00Z', v_transition_fingerprint,
    v_retirement_fingerprint
  );
  v_receipt_post := (v_result->>'retirementReceiptId')::uuid;
  if not exists (
    select 1 from public.adle_review_schedule_words
    where id = v_schedule and membership_status = 'retired'
      and pre_retirement_check_outcome_event_id = v_outcome_check_fail
      and word_schedule_transition_count = 3
  ) or not exists (
    select 1 from public.adle_review_retirement_decision_receipts
    where id = v_receipt_post
      and decision_reason = 'POST_CHECK_FINAL_RUNG_PASS_RETIRED'
      and pre_retirement_check_outcome_event_id = v_outcome_check_fail
  ) then raise exception 'FR2 post-check retirement persistence failed'; end if;

  -- A separate qualifying authentic-use decision retires with exact evidence.
  v_from := jsonb_build_object(
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'membershipStatus', 'scheduled', 'wordIntervalIndex', 5,
    'wordNextDueOn', '2099-01-12'::date,
    'consecutiveIndependentFailures', 0, 'failureEpisodeId', null,
    'preRetirementCheckDueOn', null,
    'last28DayReviewOn', '2098-11-17'::date,
    'wordLastReviewCompletedOn', '2098-11-17'::date,
    'wordLastReviewCompletedAt', '2098-11-17T12:00:00Z'::timestamptz
  );
  v_to := jsonb_build_object(
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'membershipStatus', 'retired', 'wordIntervalIndex', 5,
    'wordNextDueOn', null, 'consecutiveIndependentFailures', 0,
    'failureEpisodeId', null, 'preRetirementCheckDueOn', null,
    'last28DayReviewOn', '2098-11-17'::date,
    'wordLastReviewCompletedOn', '2099-01-12'::date,
    'wordLastReviewCompletedAt', '2099-01-12T12:00:00Z'::timestamptz
  );
  v_transition_envelope := jsonb_build_object(
    'scheduleWordId', v_auth_schedule,
    'transitionKind', 'REVIEW_OUTCOME_APPLIED',
    'sourceReviewOutcomeEventId', v_outcome_auth,
    'sourceControlledGraduationReceiptId', null,
    'idempotencyKey', 'fr2-auth-retire', 'expectedStateRevision', 0,
    'fromState', v_from, 'toState', v_to,
    'transitionReason', 'DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE',
    'reducerVersion', 'ADLE_FINAL_RUNG_RETIREMENT_V1',
    'occurredAt', '2099-01-12T12:00:00Z'::timestamptz
  );
  v_transition_fingerprint :=
    public.adle_canonical_json_sha256_v1(v_transition_envelope);
  v_retirement_envelope := jsonb_build_object(
    'scheduleWordId', v_auth_schedule,
    'sourceReviewOutcomeEventId', v_outcome_auth,
    'qualifyingAuthenticUseEventId', v_authentic,
    'preRetirementCheckOutcomeEventId', null,
    'expectedPreRetirementCheckOutcomeEventId', null,
    'idempotencyKey', 'fr2-auth-retire',
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'retirementPolicyVersion', 'ADLE_FINAL_RUNG_RETIREMENT_V1',
    'retirementStateVersion', 'adle_final_rung_retirement_v1',
    'decision', 'RETIRE',
    'decisionReason', 'DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE',
    'schedulerReducerInputState', null,
    'expectedStateRevision', 0, 'appliedStateRevision', 1,
    'transitionSourceFingerprint', v_transition_fingerprint,
    'occurredAt', '2099-01-12T12:00:00Z'::timestamptz
  );
  v_retirement_fingerprint :=
    public.adle_canonical_json_sha256_v1(v_retirement_envelope);
  v_result := public.persist_adle_final_rung_retirement_decision_fr2(
    v_auth_schedule, v_outcome_auth, v_authentic, null, null,
    'fr2-auth-retire', 0, v_from, v_to, 'RETIRE',
    'DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE', null,
    '2099-01-12T12:00:00Z', v_transition_fingerprint,
    v_retirement_fingerprint
  );
  v_receipt_auth := (v_result->>'retirementReceiptId')::uuid;
  if not exists (
    select 1 from public.adle_review_retirement_decision_receipts
    where id = v_receipt_auth
      and qualifying_authentic_use_event_id = v_authentic
      and pre_retirement_check_outcome_event_id is null
      and decision = 'RETIRE'
  ) then raise exception 'FR2 authentic retirement provenance failed'; end if;

  begin
    perform public.persist_adle_final_rung_retirement_decision_fr2(
      v_auth_schedule, v_outcome_auth, v_authentic, null, null,
      'fr2-auth-stale', 0, v_from, v_to, 'RETIRE',
      'DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE', null,
      '2099-01-12T12:00:00Z', v_transition_fingerprint,
      v_retirement_fingerprint
    );
    raise exception 'FR2_EXPECTED_STALE_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'FR2_EXPECTED_STALE_REJECTION_MISSING' then raise; end if;
    if sqlerrm <> 'adle_fr2_stale_state_revision' then raise; end if;
  end;

  begin
    perform public.persist_adle_final_rung_retirement_decision_fr2(
      v_v1_schedule, v_outcome_auth, null, null, null, 'fr2-v1-reject', 0,
      '{}'::jsonb, '{}'::jsonb, 'RETIRE',
      'PRE_RETIREMENT_CHECK_PASS_RETIRED', null,
      '2099-01-12T12:00:00Z', repeat('0', 64), repeat('0', 64)
    );
    raise exception 'FR2_EXPECTED_POLICY_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'FR2_EXPECTED_POLICY_REJECTION_MISSING' then raise; end if;
    if sqlerrm <> 'adle_fr2_policy_state_pair_unsupported' then raise; end if;
  end;

  begin
    perform public.persist_adle_final_rung_retirement_decision_fr2(
      v_schedule, 'f2200000-0000-4000-8000-000000000777', null,
      v_outcome_check_fail, v_outcome_check_fail, 'fr2-repair-reject', 3,
      v_to, v_to, 'RETIRE', 'POST_CHECK_FINAL_RUNG_PASS_RETIRED', null,
      '2099-05-04T12:00:00Z', repeat('0', 64), repeat('0', 64)
    );
    raise exception 'FR2_EXPECTED_REPAIR_SOURCE_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'FR2_EXPECTED_REPAIR_SOURCE_REJECTION_MISSING'
    then raise; end if;
    if sqlerrm <> 'adle_fr2_review_outcome_lineage_conflict' then raise; end if;
  end;

  begin
    update public.adle_review_retirement_decision_receipts
    set decision = decision where id = v_receipt_await;
    raise exception 'FR2_EXPECTED_UPDATE_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'FR2_EXPECTED_UPDATE_REJECTION_MISSING' then raise; end if;
    if sqlerrm <> 'adle_c2b2_row_is_update_immutable' then raise; end if;
  end;

  -- Direct source deletion remains protected by the pre-existing R5
  -- append-only authority. FR.2 adds no DELETE trigger to its receipt, and
  -- the existing outcome-free child/schedule cascade remains functional.
  begin
    delete from public.adle_review_outcome_events where id = v_outcome_auth;
    set constraints all immediate;
    raise exception 'FR2_EXPECTED_SOURCE_DELETE_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'FR2_EXPECTED_SOURCE_DELETE_REJECTION_MISSING'
    then raise; end if;
    if position('ADLE Review R5 evidence and receipts are append-only' in sqlerrm) = 0
    then raise; end if;
  end;
  set constraints all deferred;

  delete from public.adle_review_retirement_decision_receipts
  where id = v_receipt_auth;
  if exists (
      select 1 from public.adle_review_retirement_decision_receipts
      where id = v_receipt_auth
    )
  then raise exception 'FR2 receipt DELETE lifecycle was blocked'; end if;

  delete from public.children where id = v_child_clean;
  if exists (select 1 from public.children where id = v_child_clean)
    or exists (
      select 1 from public.adle_review_schedule_words
      where id = v_clean_schedule
    )
    or exists (
      select 1 from public.adle_review_bundles where id = v_clean_bundle
    )
  then raise exception 'FR2 changed the existing clean child cascade'; end if;

  if (select is_active or is_default_for_new_schedules
      from public.adle_review_policy_versions
      where schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1')
  then raise exception 'FR2 changed target registry flags'; end if;
end;
$fr2_proof$;

select 'FR2_SQL_RECEIPT:' || jsonb_build_object(
  'status', 'PASS',
  'retirementReceipts', (
    select count(*) from public.adle_review_retirement_decision_receipts
  ),
  'awaitingPersisted', exists (
    select 1 from public.adle_review_retirement_decision_receipts
    where decision = 'AWAIT_PRE_RETIREMENT_CHECK'
  ),
  'failedCheckLineagePersisted', exists (
    select 1 from public.adle_review_retirement_decision_receipts
    where decision = 'CONTINUE_V2_RECOVERY'
      and pre_retirement_check_outcome_event_id is not null
      and scheduler_reducer_input_state is not null
  ),
  'postCheckRetiredWithoutSecondWait', exists (
    select 1 from public.adle_review_retirement_decision_receipts
    where decision_reason = 'POST_CHECK_FINAL_RUNG_PASS_RETIRED'
      and pre_retirement_check_outcome_event_id is not null
  ),
  'targetInactiveNonDefault', (
    select not is_active and not is_default_for_new_schedules
    from public.adle_review_policy_versions
    where schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1'
  ),
  'outcomeFreeChildCascadePassed', true,
  'receiptDeleteLifecyclePassed', true,
  'existingR5DeleteGuardPreserved', true,
  'directSourceDeletionProtected', true,
  'updateImmutable', true
)::text;

rollback;
