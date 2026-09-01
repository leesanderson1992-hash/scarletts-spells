begin;

do $c2b2_proof$
declare
  v_parent constant uuid := 'c2b20000-0000-4000-8000-000000000001';
  v_child constant uuid := 'c2b20000-0000-4000-8000-000000000002';
  v_child_delete constant uuid := 'c2b20000-0000-4000-8000-000000000003';
  v_assignment constant uuid := 'c2b20000-0000-4000-8000-000000000010';
  v_delete_assignment constant uuid := 'c2b20000-0000-4000-8000-000000000011';
  v_word uuid;
  v_word_two uuid;
  v_current_bundle constant uuid := 'c2b20000-0000-4000-8000-000000000020';
  v_target_bundle constant uuid := 'c2b20000-0000-4000-8000-000000000021';
  v_current_schedule constant uuid := 'c2b20000-0000-4000-8000-000000000030';
  v_target_schedule constant uuid := 'c2b20000-0000-4000-8000-000000000031';
  v_failure constant uuid := 'c2b20000-0000-4000-8000-000000000040';
  v_cover_a constant uuid := 'c2b20000-0000-4000-8000-000000000101';
  v_dict_a constant uuid := 'c2b20000-0000-4000-8000-000000000102';
  v_cover_b constant uuid := 'c2b20000-0000-4000-8000-000000000103';
  v_dict_b constant uuid := 'c2b20000-0000-4000-8000-000000000104';
  v_cover_wrong constant uuid := 'c2b20000-0000-4000-8000-000000000105';
  v_dict_wrong constant uuid := 'c2b20000-0000-4000-8000-000000000106';
  v_cover_suffix constant uuid := 'c2b20000-0000-4000-8000-000000000107';
  v_dict_suffix constant uuid := 'c2b20000-0000-4000-8000-000000000108';
  v_repair constant uuid := 'c2b20000-0000-4000-8000-000000000109';
  v_later constant uuid := 'c2b20000-0000-4000-8000-000000000110';
  v_receipt_a uuid;
  v_receipt_b uuid;
  v_receipt_later uuid;
  v_transition uuid;
  v_envelope jsonb;
  v_fingerprint text;
  v_result jsonb;
  v_retry jsonb;
  v_from jsonb;
  v_to jsonb;
  v_attempt_id uuid;
  v_item_id uuid;
  v_delete_receipt uuid;
  v_delete_bundle constant uuid := 'c2b20000-0000-4000-8000-000000000230';
  v_delete_schedule constant uuid := 'c2b20000-0000-4000-8000-000000000231';
begin
  insert into public.canonical_teaching_dictionary_import_batches (
    id, source_folder_path, import_mode, batch_status
  ) values (
    'c2b20000-0000-4000-8000-000000000900',
    'disposable/c2b2-proof', 'local_dev_import', 'applied'
  );
  insert into public.canonical_teaching_dictionary_words (
    id, import_batch_id, row_status, source_sheet, source_row_number,
    source_row_hash, word_key, normalised_word, display_word,
    source_category, confidence, review_status
  ) values
    ('c2b20000-0000-4000-8000-000000000901',
      'c2b20000-0000-4000-8000-000000000900', 'active', 'proof', 2,
      repeat('1', 64), 'c2b2-proof-one', 'c2b2proofone', 'c2b2proofone',
      'internal_reviewed_seed', 'high', 'approved_for_first_exposure'),
    ('c2b20000-0000-4000-8000-000000000902',
      'c2b20000-0000-4000-8000-000000000900', 'active', 'proof', 3,
      repeat('2', 64), 'c2b2-proof-two', 'c2b2prooftwo', 'c2b2prooftwo',
      'internal_reviewed_seed', 'high', 'approved_for_first_exposure');

  select word.id into v_word
  from public.canonical_teaching_dictionary_words word
  where word.row_status = 'active'
  order by word.id
  limit 1;
  select word.id into v_word_two
  from public.canonical_teaching_dictionary_words word
  where word.row_status = 'active' and word.id <> v_word
  order by word.id
  limit 1;
  if v_word is null or v_word_two is null then
    raise exception 'C2B2 proof requires two canonical dictionary rows';
  end if;

  if not exists (
    select 1 from public.adle_review_policy_versions policy
    where policy.schedule_policy_version = 'review_policy_v1_2026-07-04'
      and policy.is_active = true
      and policy.is_default_for_new_schedules = true
      and policy.transition_family = 'LEGACY_TWO_STAGE_CATCH_UP'
      and policy.catch_up_offsets_days = array[1, 3]
  ) then raise exception 'C2B2 current policy was not preserved'; end if;
  if not exists (
    select 1 from public.adle_review_policy_versions policy
    where policy.schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1'
      and policy.is_active = false
      and policy.is_default_for_new_schedules = false
      and policy.transition_family = 'REGRESSION_V1'
      and policy.recovery_delay_days = 1
  ) then raise exception 'C2B2 target policy is not safely inactive/non-default'; end if;

  if has_table_privilege('anon', 'public.adle_controlled_graduation_receipts', 'SELECT')
    or has_table_privilege('authenticated', 'public.adle_controlled_graduation_receipts', 'SELECT')
    or has_table_privilege('service_role', 'public.adle_controlled_graduation_receipts', 'INSERT')
    or not has_table_privilege('service_role', 'public.adle_controlled_graduation_receipts', 'SELECT')
    or has_table_privilege('anon', 'public.adle_review_schedule_transition_events', 'SELECT')
    or has_table_privilege('authenticated', 'public.adle_review_schedule_transition_events', 'SELECT')
    or has_table_privilege('service_role', 'public.adle_review_schedule_transition_events', 'INSERT')
    or not has_table_privilege('service_role', 'public.adle_review_schedule_transition_events', 'SELECT')
  then raise exception 'C2B2 table grants are not server-read/RPC-write only'; end if;
  if has_function_privilege(
      'anon',
      'public.persist_adle_controlled_graduation_receipt_c2b2(uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,text,date,timestamptz,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.persist_adle_review_schedule_transition_c2b2(uuid,text,uuid,uuid,text,bigint,jsonb,jsonb,text,text,timestamptz,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.persist_adle_review_schedule_transition_c2b2(uuid,text,uuid,uuid,text,bigint,jsonb,jsonb,text,text,timestamptz,text)',
      'EXECUTE'
    )
  then raise exception 'C2B2 RPC grants are not service-only'; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_parent,
    'authenticated', 'authenticated', 'c2b2-parent@example.test', '',
    timezone('utc', now()), '{}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now())
  );
  insert into public.children (id, parent_user_id, first_name)
  values (v_child, v_parent, 'C2B2'), (v_child_delete, v_parent, 'C2B2 delete');
  insert into public.daily_assignments (
    id, child_id, parent_user_id, assignment_date, title,
    status, assignment_generation_source
  ) values (
    v_assignment, v_child, v_parent, '2099-01-03', 'C2B2 proof',
    'completed', 'adle_composer_v1'
  ), (
    v_delete_assignment, v_child_delete, v_parent, '2099-01-04', 'C2B2 delete proof',
    'completed', 'adle_composer_v1'
  );

  -- One governed pair per source root. The B pair uses the exact current
  -- position-suffix contract and proves source_ref belongs in receipt identity.
  insert into public.assignment_items (
    id, daily_assignment_id, child_id, parent_user_id, domain_module,
    item_type, source_type, source_entity_id, target_word, position,
    status, metadata
  ) values
    ('c2b20000-0000-4000-8000-000000000201', v_assignment, v_child, v_parent,
      'spelling', 'adle_lesson', 'adle_composer', 'cover-a', 'proof', 1, 'completed',
      jsonb_build_object('sectionKey', 'lesson_production')),
    ('c2b20000-0000-4000-8000-000000000202', v_assignment, v_child, v_parent,
      'spelling', 'adle_lesson', 'adle_composer', 'dict-a', 'proof', 2, 'completed',
      jsonb_build_object('sectionKey', 'lesson_dictation')),
    ('c2b20000-0000-4000-8000-000000000203', v_assignment, v_child, v_parent,
      'spelling', 'adle_lesson', 'adle_composer', 'cover-b', 'proof', 3, 'completed',
      jsonb_build_object('sectionKey', 'lesson_production')),
    ('c2b20000-0000-4000-8000-000000000204', v_assignment, v_child, v_parent,
      'spelling', 'adle_lesson', 'adle_composer', 'dict-b', 'proof', 4, 'completed',
      jsonb_build_object('sectionKey', 'lesson_dictation')),
    ('c2b20000-0000-4000-8000-000000000205', v_assignment, v_child, v_parent,
      'spelling', 'adle_lesson', 'adle_composer', 'cover-wrong', 'proof', 5, 'completed',
      jsonb_build_object('sectionKey', 'lesson_production')),
    ('c2b20000-0000-4000-8000-000000000206', v_assignment, v_child, v_parent,
      'spelling', 'adle_lesson', 'adle_composer', 'dict-wrong', 'proof', 6, 'completed',
      jsonb_build_object('sectionKey', 'lesson_dictation')),
    ('c2b20000-0000-4000-8000-000000000207', v_assignment, v_child, v_parent,
      'spelling', 'adle_lesson', 'adle_composer', 'cover-suffix', 'proof', 7, 'completed',
      jsonb_build_object('sectionKey', 'lesson_production')),
    ('c2b20000-0000-4000-8000-000000000208', v_assignment, v_child, v_parent,
      'spelling', 'adle_lesson', 'adle_composer', 'dict-suffix', 'proof', 8, 'completed',
      jsonb_build_object('sectionKey', 'lesson_dictation')),
    ('c2b20000-0000-4000-8000-000000000209', v_assignment, v_child, v_parent,
      'spelling', 'adle_lesson', 'adle_composer', 'repair', 'proof', 9, 'completed',
      jsonb_build_object('sectionKey', 'repair')),
    ('c2b20000-0000-4000-8000-000000000210', v_assignment, v_child, v_parent,
      'spelling', 'adle_lesson', 'adle_composer', 'later', 'proof', 10, 'completed',
      jsonb_build_object('sectionKey', 'lesson_production'));

  insert into public.adle_assignment_attempt_events (
    id, child_id, parent_user_id, daily_assignment_id, assignment_item_id,
    canonical_word_id, section_key, target_word, attempt_text, is_correct,
    attempt_kind, evidence_class, source_ref
  ) values
    (v_cover_a, v_child, v_parent, v_assignment, 'c2b20000-0000-4000-8000-000000000201',
      v_word, 'lesson_production', 'proof', 'proof', true,
      'lesson_production', 'first_exposure_lesson_attempt', 'lesson:cycle:a'),
    (v_dict_a, v_child, v_parent, v_assignment, 'c2b20000-0000-4000-8000-000000000202',
      v_word, 'lesson_dictation', 'proof', 'prof', false,
      'lesson_dictation', 'first_exposure_lesson_attempt', 'lesson:cycle:a'),
    (v_cover_b, v_child, v_parent, v_assignment, 'c2b20000-0000-4000-8000-000000000203',
      v_word, 'lesson_production', 'proof', 'proof', true,
      'lesson_production', 'first_exposure_lesson_attempt', 'lesson:cycle:b:3'),
    (v_dict_b, v_child, v_parent, v_assignment, 'c2b20000-0000-4000-8000-000000000204',
      v_word, 'lesson_dictation', 'proof', 'proof', true,
      'lesson_dictation', 'first_exposure_lesson_attempt', 'lesson:cycle:b:4'),
    (v_cover_wrong, v_child, v_parent, v_assignment, 'c2b20000-0000-4000-8000-000000000205',
      v_word, 'lesson_production', 'proof', 'proof', true,
      'lesson_production', 'first_exposure_lesson_attempt', 'lesson:cycle:c'),
    (v_dict_wrong, v_child, v_parent, v_assignment, 'c2b20000-0000-4000-8000-000000000206',
      v_word, 'lesson_dictation', 'proof', 'proof', true,
      'lesson_dictation', 'first_exposure_lesson_attempt', 'lesson:cycle:d'),
    (v_cover_suffix, v_child, v_parent, v_assignment, 'c2b20000-0000-4000-8000-000000000207',
      v_word, 'lesson_production', 'proof', 'proof', true,
      'lesson_production', 'first_exposure_lesson_attempt', 'lesson:cycle:e:garbage'),
    (v_dict_suffix, v_child, v_parent, v_assignment, 'c2b20000-0000-4000-8000-000000000208',
      v_word, 'lesson_dictation', 'proof', 'proof', true,
      'lesson_dictation', 'first_exposure_lesson_attempt', 'lesson:cycle:e:garbage'),
    (v_repair, v_child, v_parent, v_assignment, 'c2b20000-0000-4000-8000-000000000209',
      v_word, 'repair', 'proof', 'proof', true,
      'repair_retry', 'immediate_repair_attempt', 'lesson:cycle:repair'),
    (v_later, v_child, v_parent, v_assignment, 'c2b20000-0000-4000-8000-000000000210',
      v_word, 'lesson_production', 'proof', 'proof', true,
      'lesson_production', 'first_exposure_lesson_attempt', 'lesson:cycle:later');

  v_envelope := jsonb_build_object(
    'childId', v_child, 'dailyAssignmentId', v_assignment,
    'canonicalWordId', v_word, 'sourceRef', 'lesson:cycle:a',
    'controlledPolicyVersion', 'ADLE_CONTROLLED_GRADUATION_V1_OR',
    'controlledCycleKind', 'GOVERNED_OR_PAIR',
    'coverWriteAttemptEventId', v_cover_a, 'coverWriteOutcome', 'PASS',
    'sentenceDictationAttemptEventId', v_dict_a, 'sentenceDictationOutcome', 'FAIL',
    'laterCleanAttemptEventId', null, 'laterCleanOutcome', null,
    'decision', 'PASS', 'decisionReason', 'CONTROLLED_OR_PASS',
    'completedOn', '2099-01-03'::date,
    'decidedAt', '2099-01-03T12:00:00Z'::timestamptz
  );
  v_fingerprint := public.adle_canonical_json_sha256_v1(v_envelope);
  v_result := public.persist_adle_controlled_graduation_receipt_c2b2(
    v_child, v_assignment, v_word, 'lesson:cycle:a', 'GOVERNED_OR_PAIR',
    v_cover_a, v_dict_a, null, 'PASS', 'CONTROLLED_OR_PASS',
    '2099-01-03', '2099-01-03T12:00:00Z', v_fingerprint
  );
  v_retry := public.persist_adle_controlled_graduation_receipt_c2b2(
    v_child, v_assignment, v_word, 'lesson:cycle:a', 'GOVERNED_OR_PAIR',
    v_cover_a, v_dict_a, null, 'PASS', 'CONTROLLED_OR_PASS',
    '2099-01-03', '2099-01-03T12:00:00Z', v_fingerprint
  );
  v_receipt_a := (v_result->>'receiptId')::uuid;
  if v_receipt_a is distinct from (v_retry->>'receiptId')::uuid
    or v_retry->>'status' <> 'already_persisted'
  then raise exception 'C2B2 controlled retry was not idempotent'; end if;

  v_envelope := jsonb_build_object(
    'childId', v_child, 'dailyAssignmentId', v_assignment,
    'canonicalWordId', v_word, 'sourceRef', 'lesson:cycle:b',
    'controlledPolicyVersion', 'ADLE_CONTROLLED_GRADUATION_V1_OR',
    'controlledCycleKind', 'GOVERNED_OR_PAIR',
    'coverWriteAttemptEventId', v_cover_b, 'coverWriteOutcome', 'PASS',
    'sentenceDictationAttemptEventId', v_dict_b, 'sentenceDictationOutcome', 'PASS',
    'laterCleanAttemptEventId', null, 'laterCleanOutcome', null,
    'decision', 'PASS', 'decisionReason', 'CONTROLLED_OR_PASS',
    'completedOn', '2099-01-03'::date,
    'decidedAt', '2099-01-03T12:01:00Z'::timestamptz
  );
  v_fingerprint := public.adle_canonical_json_sha256_v1(v_envelope);
  v_result := public.persist_adle_controlled_graduation_receipt_c2b2(
    v_child, v_assignment, v_word, 'lesson:cycle:b', 'GOVERNED_OR_PAIR',
    v_cover_b, v_dict_b, null, 'PASS', 'CONTROLLED_OR_PASS',
    '2099-01-03', '2099-01-03T12:01:00Z', v_fingerprint
  );
  v_receipt_b := (v_result->>'receiptId')::uuid;
  if v_receipt_b = v_receipt_a
    or (select count(*) from public.adle_controlled_graduation_receipts
        where child_id = v_child and daily_assignment_id = v_assignment
          and canonical_word_id = v_word) <> 2
  then raise exception 'C2B2 distinct source cycles collapsed'; end if;

  begin
    perform public.persist_adle_controlled_graduation_receipt_c2b2(
      v_child, v_assignment, v_word, 'lesson:cycle:c', 'GOVERNED_OR_PAIR',
      v_cover_wrong, v_dict_wrong, null, 'PASS', 'CONTROLLED_OR_PASS',
      '2099-01-03', '2099-01-03T12:02:00Z', repeat('0', 64)
    );
    raise exception 'C2B2_EXPECTED_WRONG_CYCLE_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'C2B2_EXPECTED_WRONG_CYCLE_REJECTION_MISSING' then raise; end if;
  end;
  begin
    perform public.persist_adle_controlled_graduation_receipt_c2b2(
      v_child, v_assignment, v_word, 'lesson:cycle:e', 'GOVERNED_OR_PAIR',
      v_cover_suffix, v_dict_suffix, null, 'PASS', 'CONTROLLED_OR_PASS',
      '2099-01-03', '2099-01-03T12:03:00Z', repeat('0', 64)
    );
    raise exception 'C2B2_EXPECTED_SUFFIX_GUESS_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'C2B2_EXPECTED_SUFFIX_GUESS_REJECTION_MISSING' then raise; end if;
  end;
  begin
    perform public.persist_adle_controlled_graduation_receipt_c2b2(
      v_child, v_assignment, v_word, 'lesson:cycle:repair',
      'LATER_CLEAN_CONTROLLED_PRODUCTION', null, null, v_repair,
      'PASS', 'LATER_CLEAN_CONTROLLED_PASS', '2099-01-03',
      '2099-01-03T12:04:00Z', repeat('0', 64)
    );
    raise exception 'C2B2_EXPECTED_REPAIR_VOTER_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'C2B2_EXPECTED_REPAIR_VOTER_REJECTION_MISSING' then raise; end if;
  end;

  v_envelope := jsonb_build_object(
    'childId', v_child, 'dailyAssignmentId', v_assignment,
    'canonicalWordId', v_word, 'sourceRef', 'lesson:cycle:later',
    'controlledPolicyVersion', 'ADLE_CONTROLLED_GRADUATION_V1_OR',
    'controlledCycleKind', 'LATER_CLEAN_CONTROLLED_PRODUCTION',
    'coverWriteAttemptEventId', null, 'coverWriteOutcome', null,
    'sentenceDictationAttemptEventId', null, 'sentenceDictationOutcome', null,
    'laterCleanAttemptEventId', v_later, 'laterCleanOutcome', 'PASS',
    'decision', 'PASS', 'decisionReason', 'LATER_CLEAN_CONTROLLED_PASS',
    'completedOn', '2099-01-03'::date,
    'decidedAt', '2099-01-03T12:05:00Z'::timestamptz
  );
  v_fingerprint := public.adle_canonical_json_sha256_v1(v_envelope);
  v_result := public.persist_adle_controlled_graduation_receipt_c2b2(
    v_child, v_assignment, v_word, 'lesson:cycle:later',
    'LATER_CLEAN_CONTROLLED_PRODUCTION', null, null, v_later,
    'PASS', 'LATER_CLEAN_CONTROLLED_PASS', '2099-01-03',
    '2099-01-03T12:05:00Z', v_fingerprint
  );
  v_receipt_later := (v_result->>'receiptId')::uuid;
  if v_receipt_later in (v_receipt_a, v_receipt_b)
  then raise exception 'C2B2 later clean production rewrote original pair'; end if;

  -- Existing v1 and target/v2 words coexist without shared interpretation.
  insert into public.adle_review_bundles (
    id, child_id, source_ref, interval_index, next_due_on,
    schedule_policy_version, bundle_status, row_status
  ) values
    (v_current_bundle, v_child, 'current-bundle', 0, '2099-01-04',
      'review_policy_v1_2026-07-04', 'active', 'active'),
    (v_target_bundle, v_child, 'target-bundle', 0, '2099-01-04',
      'ADLE_SPACED_REVIEW_REGRESSION_V1', 'active', 'active');
  insert into public.adle_review_schedule_words (
    id, child_id, canonical_word_id, bundle_id, membership_status,
    taught_on, row_status, word_schedule_version, word_interval_index,
    word_next_due_on, word_schedule_policy_version
  ) values (
    v_current_schedule, v_child, v_word_two, v_current_bundle, 'scheduled',
    '2099-01-01', 'active', 'adle_review_per_word_schedule_v1', 0,
    '2099-01-04', 'review_policy_v1_2026-07-04'
  );
  insert into public.adle_review_outcome_events (
    id, child_id, canonical_word_id, bundle_id, event_type, occurred_on,
    interval_index, schedule_policy_version
  ) values (
    v_failure, v_child, v_word, v_target_bundle, 'review_fail',
    '2099-01-02', 2, 'ADLE_SPACED_REVIEW_REGRESSION_V1'
  );
  insert into public.adle_review_schedule_words (
    id, child_id, canonical_word_id, bundle_id, membership_status,
    taught_on, row_status, word_schedule_version, word_interval_index,
    word_next_due_on, word_schedule_policy_version,
    consecutive_independent_failures, failure_episode_id
  ) values (
    v_target_schedule, v_child, v_word, v_target_bundle,
    'controlled_reacquisition', '2099-01-01', 'active',
    'adle_review_per_word_schedule_v2', 2, null,
    'ADLE_SPACED_REVIEW_REGRESSION_V1', 3, v_failure
  );
  if exists (
    select 1 from public.adle_review_schedule_words word
    where word.id = v_current_schedule
      and (word.consecutive_independent_failures is not null
        or word.failure_episode_id is not null)
  ) then raise exception 'C2B2 target lineage leaked into current row'; end if;

  v_from := jsonb_build_object(
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'membershipStatus', 'controlled_reacquisition',
    'wordIntervalIndex', 2, 'wordNextDueOn', null,
    'consecutiveIndependentFailures', 3, 'failureEpisodeId', v_failure,
    'preRetirementCheckDueOn', null, 'last28DayReviewOn', null,
    'wordLastReviewCompletedOn', null, 'wordLastReviewCompletedAt', null
  );
  v_to := jsonb_build_object(
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'membershipStatus', 'scheduled',
    'wordIntervalIndex', 0, 'wordNextDueOn', '2099-01-04'::date,
    'consecutiveIndependentFailures', 3, 'failureEpisodeId', v_failure,
    'preRetirementCheckDueOn', null, 'last28DayReviewOn', null,
    'wordLastReviewCompletedOn', '2099-01-03'::date,
    'wordLastReviewCompletedAt', '2099-01-03T12:00:00Z'::timestamptz
  );
  v_envelope := jsonb_build_object(
    'scheduleWordId', v_target_schedule,
    'transitionKind', 'CONTROLLED_PASS_APPLIED',
    'sourceReviewOutcomeEventId', null,
    'sourceControlledGraduationReceiptId', v_receipt_a,
    'idempotencyKey', 'c2b2-controlled-pass',
    'expectedStateRevision', 0,
    'fromState', v_from, 'toState', v_to,
    'transitionReason', 'CONTROLLED_PASS_TO_DAY_1',
    'reducerVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'occurredAt', '2099-01-03T12:00:00Z'::timestamptz
  );
  v_fingerprint := public.adle_canonical_json_sha256_v1(v_envelope);
  v_result := public.persist_adle_review_schedule_transition_c2b2(
    v_target_schedule, 'CONTROLLED_PASS_APPLIED', null, v_receipt_a,
    'c2b2-controlled-pass', 0, v_from, v_to,
    'CONTROLLED_PASS_TO_DAY_1', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    '2099-01-03T12:00:00Z', v_fingerprint
  );
  v_retry := public.persist_adle_review_schedule_transition_c2b2(
    v_target_schedule, 'CONTROLLED_PASS_APPLIED', null, v_receipt_a,
    'c2b2-controlled-pass', 0, v_from, v_to,
    'CONTROLLED_PASS_TO_DAY_1', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    '2099-01-03T12:00:00Z', v_fingerprint
  );
  v_transition := (v_result->>'transitionEventId')::uuid;
  if v_transition is distinct from (v_retry->>'transitionEventId')::uuid
    or v_retry->>'status' <> 'already_applied'
  then raise exception 'C2B2 transition retry was not idempotent'; end if;
  if not exists (
    select 1 from public.adle_review_schedule_words word
    where word.id = v_target_schedule
      and word.membership_status = 'scheduled'
      and word.word_interval_index = 0
      and word.word_next_due_on = '2099-01-04'
      and word.consecutive_independent_failures = 3
      and word.failure_episode_id = v_failure
      and word.word_schedule_transition_count = 1
  ) then raise exception 'C2B2 route and retained failure lineage did not persist independently'; end if;

  begin
    perform public.persist_adle_review_schedule_transition_c2b2(
      v_target_schedule, 'CONTROLLED_PASS_APPLIED', null, v_receipt_b,
      'c2b2-stale', 0, v_from, v_to,
      'CONTROLLED_PASS_TO_DAY_1', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
      '2099-01-03T12:01:00Z', repeat('0', 64)
    );
    raise exception 'C2B2_EXPECTED_STALE_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'C2B2_EXPECTED_STALE_REJECTION_MISSING' then raise; end if;
  end;
  begin
    perform public.persist_adle_review_schedule_transition_c2b2(
      v_current_schedule, 'CONTROLLED_PASS_APPLIED', null, v_receipt_b,
      'c2b2-current-policy', 0, '{}'::jsonb, '{}'::jsonb,
      'CONTROLLED_PASS_TO_DAY_1', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
      '2099-01-03T12:01:00Z', repeat('0', 64)
    );
    raise exception 'C2B2_EXPECTED_POLICY_SHAPE_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'C2B2_EXPECTED_POLICY_SHAPE_REJECTION_MISSING' then raise; end if;
  end;

  begin
    update public.adle_assignment_attempt_events set attempt_text = attempt_text
    where id = v_cover_a;
    raise exception 'C2B2_EXPECTED_ATTEMPT_UPDATE_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'C2B2_EXPECTED_ATTEMPT_UPDATE_REJECTION_MISSING' then raise; end if;
  end;
  begin
    update public.adle_controlled_graduation_receipts set decision = decision
    where id = v_receipt_a;
    raise exception 'C2B2_EXPECTED_RECEIPT_UPDATE_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'C2B2_EXPECTED_RECEIPT_UPDATE_REJECTION_MISSING' then raise; end if;
  end;
  begin
    update public.adle_review_schedule_transition_events
    set transition_reason = transition_reason where id = v_transition;
    raise exception 'C2B2_EXPECTED_TRANSITION_UPDATE_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'C2B2_EXPECTED_TRANSITION_UPDATE_REJECTION_MISSING' then raise; end if;
  end;

  -- Parent lifecycle deletion remains supported: no DELETE trigger is present.
  insert into public.assignment_items (
    id, daily_assignment_id, child_id, parent_user_id, domain_module,
    item_type, source_type, source_entity_id, target_word, position,
    status, metadata
  ) values (
    'c2b20000-0000-4000-8000-000000000220', v_delete_assignment,
    v_child_delete, v_parent, 'spelling', 'adle_lesson', 'adle_composer',
    'delete-later', 'proof', 1, 'completed',
    jsonb_build_object('sectionKey', 'lesson_production')
  ) returning id into v_item_id;
  insert into public.adle_assignment_attempt_events (
    child_id, parent_user_id, daily_assignment_id, assignment_item_id,
    canonical_word_id, section_key, target_word, attempt_text, is_correct,
    attempt_kind, evidence_class, source_ref
  ) values (
    v_child_delete, v_parent, v_delete_assignment, v_item_id, v_word,
    'lesson_production', 'proof', 'proof', true,
    'lesson_production', 'first_exposure_lesson_attempt', 'lesson:delete'
  ) returning id into v_attempt_id;
  v_envelope := jsonb_build_object(
    'childId', v_child_delete, 'dailyAssignmentId', v_delete_assignment,
    'canonicalWordId', v_word, 'sourceRef', 'lesson:delete',
    'controlledPolicyVersion', 'ADLE_CONTROLLED_GRADUATION_V1_OR',
    'controlledCycleKind', 'LATER_CLEAN_CONTROLLED_PRODUCTION',
    'coverWriteAttemptEventId', null, 'coverWriteOutcome', null,
    'sentenceDictationAttemptEventId', null, 'sentenceDictationOutcome', null,
    'laterCleanAttemptEventId', v_attempt_id, 'laterCleanOutcome', 'PASS',
    'decision', 'PASS', 'decisionReason', 'LATER_CLEAN_CONTROLLED_PASS',
    'completedOn', '2099-01-04'::date,
    'decidedAt', '2099-01-04T12:00:00Z'::timestamptz
  );
  v_fingerprint := public.adle_canonical_json_sha256_v1(v_envelope);
  v_result := public.persist_adle_controlled_graduation_receipt_c2b2(
    v_child_delete, v_delete_assignment, v_word, 'lesson:delete',
    'LATER_CLEAN_CONTROLLED_PRODUCTION', null, null, v_attempt_id,
    'PASS', 'LATER_CLEAN_CONTROLLED_PASS', '2099-01-04',
    '2099-01-04T12:00:00Z', v_fingerprint
  );
  v_delete_receipt := (v_result->>'receiptId')::uuid;
  delete from public.daily_assignments where id = v_delete_assignment;
  if exists (select 1 from public.adle_assignment_attempt_events where id = v_attempt_id)
    or exists (select 1 from public.adle_controlled_graduation_receipts where id = v_delete_receipt)
  then raise exception 'C2B2 assignment lifecycle did not cascade attempts/receipts'; end if;
  insert into public.adle_review_bundles (
    id, child_id, source_ref, interval_index, next_due_on,
    schedule_policy_version, bundle_status, row_status
  ) values (
    v_delete_bundle, v_child_delete, 'child-delete-bundle', 0, '2099-01-05',
    'review_policy_v1_2026-07-04', 'active', 'active'
  );
  insert into public.adle_review_schedule_words (
    id, child_id, canonical_word_id, bundle_id, membership_status,
    taught_on, row_status, word_schedule_version, word_interval_index,
    word_next_due_on, word_schedule_policy_version
  ) values (
    v_delete_schedule, v_child_delete, v_word, v_delete_bundle, 'scheduled',
    '2099-01-04', 'active', 'adle_review_per_word_schedule_v1', 0,
    '2099-01-05', 'review_policy_v1_2026-07-04'
  );
  delete from public.children where id = v_child_delete;
  if exists (select 1 from public.adle_review_schedule_words where id = v_delete_schedule)
    or exists (select 1 from public.adle_review_bundles where id = v_delete_bundle)
  then raise exception 'C2B2 child lifecycle did not preserve existing schedule cascades'; end if;

  if exists (
    select 1 from pg_trigger trigger
    where trigger.tgrelid in (
      'public.adle_assignment_attempt_events'::regclass,
      'public.adle_controlled_graduation_receipts'::regclass,
      'public.adle_review_schedule_transition_events'::regclass
    )
      and not trigger.tgisinternal
      and pg_get_triggerdef(trigger.oid) ilike '%delete%'
      and trigger.tgname like '%c2b2%'
  ) then raise exception 'C2B2 installed a blanket delete trigger'; end if;
end;
$c2b2_proof$;

select 'C2B2_SQL_RECEIPT:' || jsonb_build_object(
  'status', 'PASS',
  'currentPolicyRows', (
    select count(*) from public.adle_review_policy_versions
    where schedule_policy_version = 'review_policy_v1_2026-07-04'
  ),
  'targetPolicyInactiveNonDefault', (
    select count(*) = 1 from public.adle_review_policy_versions
    where schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1'
      and is_active = false and is_default_for_new_schedules = false
  ),
  'controlledReceipts', (
    select count(*) from public.adle_controlled_graduation_receipts
  ),
  'transitionEvents', (
    select count(*) from public.adle_review_schedule_transition_events
  ),
  'targetRows', (
    select count(*) from public.adle_review_schedule_words
    where word_schedule_version = 'adle_review_per_word_schedule_v2'
  ),
  'currentRows', (
    select count(*) from public.adle_review_schedule_words
    where word_schedule_version = 'adle_review_per_word_schedule_v1'
  )
)::text;

rollback;
