\set ON_ERROR_STOP on
begin;

do $$
declare
  v_parent uuid;
  v_child uuid := gen_random_uuid();
  v_playing uuid;
  v_hopeful uuid;
  v_player uuid;
  v_preserve_candidate uuid;
  v_identify_candidate uuid;
  v_preserve_mapping uuid;
  v_identify_mapping uuid;
  v_preserve_item uuid;
  v_identify_item uuid;
  v_hopeful_item uuid := gen_random_uuid();
  v_player_item uuid := gen_random_uuid();
  v_assignment uuid;
  v_assignment_items uuid[];
  v_bundle uuid;
  v_attempts jsonb;
  v_lesson jsonb;
  v_result jsonb;
  v_policy text;
  v_review_assignment uuid;
  v_review_item uuid;
  v_review_attempt uuid;
  v_review_outcome uuid;
  v_schedule uuid;
  v_count integer;
begin
  select id into v_parent from auth.users order by created_at limit 1;
  if v_parent is null then raise exception 'Local proof requires one existing local parent'; end if;
  select id into v_playing from public.canonical_teaching_dictionary_words where normalised_word='playing' and row_status='active' and review_status='approved_for_first_exposure';
  select id into v_hopeful from public.canonical_teaching_dictionary_words where normalised_word='hopeful' and row_status='active' and review_status='approved_for_first_exposure';
  select id into v_player from public.canonical_teaching_dictionary_words where normalised_word='player' and row_status='active' and review_status='approved_for_first_exposure';
  if v_playing is null or v_hopeful is null or v_player is null then raise exception 'Local proof canonical words are unavailable'; end if;
  select schedule_policy_version into v_policy from public.adle_review_policy_versions where is_active=true order by created_at desc limit 1;

  insert into public.children(id,parent_user_id,first_name,notes,date_of_birth)
  values(v_child,v_parent,'ADLE Playing Proof','adle_playing_shared_routes_local_proof','2017-01-01');

  -- The two user-approved error relationships are the only spelling mappings
  -- created by this proof. Companion learning items below are deliberately not
  -- resolver-visible mappings.
  with verification as (
    insert into public.parent_verifications(
      child_id,parent_user_id,domain_module,source_type,source_entity_id,
      suggested_micro_skill_key,decision,verified_micro_skill_key,metadata
    ) values (
      v_child,v_parent,'spelling','local_proof','adle-playing-proof:plaiing',
      'D4_MOR_BASE_WORDS_PRESERVE_BASE','accepted','D4_MOR_BASE_WORDS_PRESERVE_BASE',
      jsonb_build_object('proofTag','adle_playing_shared_routes_local_proof')
    ) returning id
  )
  insert into public.parent_verified_spelling_candidate_mappings(
    parent_user_id,child_id,parent_verification_id,source_provenance,
    reviewed_event_source_entity_id,original_child_spelling,original_correct_spelling,
    misspelling_normalized,correct_spelling_normalized,micro_skill_key,
    candidate_status,promotion_scope,metadata
  ) select v_parent,v_child,id,'lesson_submission_parent_added_missed_word',
      'adle-playing-proof:plaiing','plaiing','playing','plaiing','playing',
      'D4_MOR_BASE_WORDS_PRESERVE_BASE','parent_local_promoted','parent_local',
      jsonb_build_object('proofTag','adle_playing_shared_routes_local_proof')
    from verification returning id into v_preserve_candidate;

  with verification as (
    insert into public.parent_verifications(
      child_id,parent_user_id,domain_module,source_type,source_entity_id,
      suggested_micro_skill_key,decision,verified_micro_skill_key,metadata
    ) values (
      v_child,v_parent,'spelling','local_proof','adle-playing-proof:plaing',
      'D4_MOR_BASE_WORDS_IDENTIFY_BASE','accepted','D4_MOR_BASE_WORDS_IDENTIFY_BASE',
      jsonb_build_object('proofTag','adle_playing_shared_routes_local_proof')
    ) returning id
  )
  insert into public.parent_verified_spelling_candidate_mappings(
    parent_user_id,child_id,parent_verification_id,source_provenance,
    reviewed_event_source_entity_id,original_child_spelling,original_correct_spelling,
    misspelling_normalized,correct_spelling_normalized,micro_skill_key,
    candidate_status,promotion_scope,metadata
  ) select v_parent,v_child,id,'lesson_submission_parent_added_missed_word',
      'adle-playing-proof:plaing','plaing','playing','plaing','playing',
      'D4_MOR_BASE_WORDS_IDENTIFY_BASE','parent_local_promoted','parent_local',
      jsonb_build_object('proofTag','adle_playing_shared_routes_local_proof')
    from verification returning id into v_identify_candidate;

  insert into public.spelling_canonical_mappings(
    misspelling_normalized,correct_spelling_normalized,micro_skill_key,
    created_by_admin_user_id,decision_note,metadata,source_candidate_mapping_id
  ) values (
    'plaiing','playing','D4_MOR_BASE_WORDS_PRESERVE_BASE',v_parent,
    'Disposable local ADLE shared-route proof',jsonb_build_object('proofTag','adle_playing_shared_routes_local_proof'),v_preserve_candidate
  ) returning id into v_preserve_mapping;
  insert into public.spelling_canonical_mappings(
    misspelling_normalized,correct_spelling_normalized,micro_skill_key,
    created_by_admin_user_id,decision_note,metadata,source_candidate_mapping_id
  ) values (
    'plaing','playing','D4_MOR_BASE_WORDS_IDENTIFY_BASE',v_parent,
    'Disposable local ADLE shared-route proof',jsonb_build_object('proofTag','adle_playing_shared_routes_local_proof'),v_identify_candidate
  ) returning id into v_identify_mapping;

  -- Route one: plaiing -> playing -> PRESERVE_BASE.
  select learning_item_id into v_preserve_item from public.adle_persist_canonical_intake(
    v_child,v_playing,'D4_MOR_BASE_WORDS_PRESERVE_BASE',v_preserve_candidate,v_preserve_mapping,
    'plaiing','playing','adle-playing-proof:plaiing','2026-07-22'
  );
  insert into public.adle_learning_items(
    id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,
    source_ref,source_attempt_text,intake_on,row_status
  ) values (
    v_hopeful_item,v_child,v_hopeful,'D4_MOR_BASE_WORDS_PRESERVE_BASE','pending','verified_misspelling',
    'adle-playing-proof:companion:hopeful','proof-only-companion','2026-07-23','active'
  );

  v_assignment := gen_random_uuid(); v_bundle := gen_random_uuid();
  insert into public.daily_assignments(id,child_id,parent_user_id,assignment_date,title,status,assignment_generation_source)
  values(v_assignment,v_child,v_parent,'2026-07-22','ADLE Base-word Family Pilot','pending','adle_base_word_family_pilot_v1');
  insert into public.adle_base_word_family_pilot_runs(assignment_id,child_id,parent_user_id,pilot_lesson_number)
  values(v_assignment,v_child,v_parent,1);
  insert into public.assignment_items(
    daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,
    source_entity_id,template_key,target_word,position,status,metadata
  )
  select v_assignment,v_child,v_parent,'spelling','lesson','adle_base_word_family_pilot',
    'adle-playing-proof:preserve:'||position,'proof-template',
    case when position in (7,9,11,13,15,17) then 'playing' else 'hopeful' end,
    position,'ready',jsonb_build_object(
      'planDate','2026-07-22','microSkillKey','D4_MOR_BASE_WORDS_PRESERVE_BASE',
      'sectionKey',case when position=1 then 'lesson_intro' when position between 2 and 6 then 'guided_practice' when position between 7 and 12 then 'lesson_production' else 'lesson_dictation' end,
      'provenance',case when position between 7 and 18 then 'authentic_target' else 'guided' end,
      'canonicalWordId',case when position in (7,9,11,13,15,17) then v_playing else v_hopeful end
    )
  from generate_series(1,18) position;
  select array_agg(id order by position) into v_assignment_items from public.assignment_items where daily_assignment_id=v_assignment;
  select jsonb_agg(jsonb_build_object(
    'childId',v_child,'parentUserId',v_parent,'dailyAssignmentId',v_assignment,
    'assignmentItemId',id,'canonicalWordId',metadata->>'canonicalWordId',
    'microSkillKey','D4_MOR_BASE_WORDS_PRESERVE_BASE','sectionKey',metadata->>'sectionKey',
    'templateKey','proof-template','targetWord',target_word,'attemptText',target_word,'isCorrect',true,
    'attemptKind',case when position between 1 and 6 then 'guided_practice' when position between 7 and 12 then 'lesson_production' else 'lesson_dictation' end,
    'evidenceClass',case when position between 1 and 6 then 'guided_practice_attempt' else 'first_exposure_lesson_attempt' end,
    'sourceRef','lesson:'||v_child||':2026-07-22:D4_MOR_BASE_WORDS_PRESERVE_BASE:'||position
  ) order by position) into v_attempts from public.assignment_items where daily_assignment_id=v_assignment;
  v_lesson := jsonb_build_object(
    'bundle',jsonb_build_object('bundleId',v_bundle,'childId',v_child,'sourceRef','lesson:'||v_child||':2026-07-22:D4_MOR_BASE_WORDS_PRESERVE_BASE','intervalIndex',0,'nextDueOn','2026-07-23','schedulePolicyVersion',v_policy,'bundleStatus','active'),
    'scheduleWords',jsonb_build_array(
      jsonb_build_object('canonicalWordId',v_playing,'membershipStatus','scheduled','catchUpStage',0,'nextRetestDueOn','','failedReviewOn','','preRetirementCheckDueOn','','last28DayReviewOn','','reteachCycleCount',0,'taughtOn','2026-07-22'),
      jsonb_build_object('canonicalWordId',v_hopeful,'membershipStatus','scheduled','catchUpStage',0,'nextRetestDueOn','','failedReviewOn','','preRetirementCheckDueOn','','last28DayReviewOn','','reteachCycleCount',0,'taughtOn','2026-07-22')
    ),
    'taughtEvents',jsonb_build_array(
      jsonb_build_object('canonicalWordId',v_playing,'eventKind','taught','occurredOn','2026-07-22','attemptText','playing'),
      jsonb_build_object('canonicalWordId',v_hopeful,'eventKind','taught','occurredOn','2026-07-22','attemptText','hopeful')
    ),
    'itemTransitions',jsonb_build_array(
      jsonb_build_object('learningItemId',v_preserve_item,'itemStatus','awaiting_review_outcome','reteachPriority',false,'ejectedOn','','rowStatus','active'),
      jsonb_build_object('learningItemId',v_hopeful_item,'itemStatus','awaiting_review_outcome','reteachPriority',false,'ejectedOn','','rowStatus','active')
    ),
    'reflection',jsonb_build_object('childId',v_child,'parentUserId',v_parent,'assignmentId',v_assignment,'microSkillKey','D4_MOR_BASE_WORDS_PRESERVE_BASE','contentVersion','proof-v1','promptKey','base-word-family-observation-v1','promptText','What did you notice?','reflectionText','I found the base word.')
  );
  v_result := public.complete_adle_base_word_family_pilot_v2(v_parent,v_child,v_assignment,'2026-07-22','D4_MOR_BASE_WORDS_PRESERVE_BASE','lesson:'||v_child||':2026-07-22:D4_MOR_BASE_WORDS_PRESERVE_BASE',v_assignment_items,v_attempts,v_lesson,'[]');
  if v_result->>'status' <> 'completed' then raise exception 'Preserve route did not complete'; end if;
  select schedule.id into v_schedule from public.adle_review_schedule_words schedule where schedule.child_id=v_child and schedule.canonical_word_id=v_playing and schedule.row_status='active';
  select count(*) into v_count from public.adle_review_schedule_word_routes where schedule_word_id=v_schedule and row_status='active';
  if v_count <> 1 then raise exception 'First playing schedule must have exactly one route, found %',v_count; end if;

  -- Route two: plaing -> playing -> IDENTIFY_BASE.
  select learning_item_id into v_identify_item from public.adle_persist_canonical_intake(
    v_child,v_playing,'D4_MOR_BASE_WORDS_IDENTIFY_BASE',v_identify_candidate,v_identify_mapping,
    'plaing','playing','adle-playing-proof:plaing','2026-07-24'
  );
  insert into public.adle_learning_items(
    id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,
    source_ref,source_attempt_text,intake_on,row_status
  ) values (
    v_player_item,v_child,v_player,'D4_MOR_BASE_WORDS_IDENTIFY_BASE','pending','verified_misspelling',
    'adle-playing-proof:companion:player','proof-only-companion','2026-07-25','active'
  );

  v_assignment := gen_random_uuid(); v_bundle := gen_random_uuid();
  insert into public.daily_assignments(id,child_id,parent_user_id,assignment_date,title,status,assignment_generation_source)
  values(v_assignment,v_child,v_parent,'2026-07-24','ADLE Base-word Family Pilot','pending','adle_base_word_family_pilot_v1');
  insert into public.adle_base_word_family_pilot_runs(assignment_id,child_id,parent_user_id,pilot_lesson_number)
  values(v_assignment,v_child,v_parent,2);
  insert into public.assignment_items(
    daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,
    source_entity_id,template_key,target_word,position,status,metadata
  )
  select v_assignment,v_child,v_parent,'spelling','lesson','adle_base_word_family_pilot',
    'adle-playing-proof:identify:'||position,'proof-template',
    case when position in (7,9,11,13,15,17) then 'playing' else 'player' end,
    position,'ready',jsonb_build_object(
      'planDate','2026-07-24','microSkillKey','D4_MOR_BASE_WORDS_IDENTIFY_BASE',
      'sectionKey',case when position=1 then 'lesson_intro' when position between 2 and 6 then 'guided_practice' when position between 7 and 12 then 'lesson_production' else 'lesson_dictation' end,
      'provenance',case when position between 7 and 18 then 'authentic_target' else 'guided' end,
      'canonicalWordId',case when position in (7,9,11,13,15,17) then v_playing else v_player end
    )
  from generate_series(1,18) position;
  select array_agg(id order by position) into v_assignment_items from public.assignment_items where daily_assignment_id=v_assignment;
  select jsonb_agg(jsonb_build_object(
    'childId',v_child,'parentUserId',v_parent,'dailyAssignmentId',v_assignment,
    'assignmentItemId',id,'canonicalWordId',metadata->>'canonicalWordId',
    'microSkillKey','D4_MOR_BASE_WORDS_IDENTIFY_BASE','sectionKey',metadata->>'sectionKey',
    'templateKey','proof-template','targetWord',target_word,'attemptText',target_word,'isCorrect',true,
    'attemptKind',case when position between 1 and 6 then 'guided_practice' when position between 7 and 12 then 'lesson_production' else 'lesson_dictation' end,
    'evidenceClass',case when position between 1 and 6 then 'guided_practice_attempt' else 'first_exposure_lesson_attempt' end,
    'sourceRef','lesson:'||v_child||':2026-07-24:D4_MOR_BASE_WORDS_IDENTIFY_BASE:'||position
  ) order by position) into v_attempts from public.assignment_items where daily_assignment_id=v_assignment;
  v_lesson := jsonb_build_object(
    'bundle',jsonb_build_object('bundleId',v_bundle,'childId',v_child,'sourceRef','lesson:'||v_child||':2026-07-24:D4_MOR_BASE_WORDS_IDENTIFY_BASE','intervalIndex',0,'nextDueOn','2026-07-25','schedulePolicyVersion',v_policy,'bundleStatus','active'),
    'scheduleWords',jsonb_build_array(
      jsonb_build_object('canonicalWordId',v_playing,'membershipStatus','scheduled','catchUpStage',0,'nextRetestDueOn','','failedReviewOn','','preRetirementCheckDueOn','','last28DayReviewOn','','reteachCycleCount',0,'taughtOn','2026-07-24'),
      jsonb_build_object('canonicalWordId',v_player,'membershipStatus','scheduled','catchUpStage',0,'nextRetestDueOn','','failedReviewOn','','preRetirementCheckDueOn','','last28DayReviewOn','','reteachCycleCount',0,'taughtOn','2026-07-24')
    ),
    'taughtEvents',jsonb_build_array(
      jsonb_build_object('canonicalWordId',v_playing,'eventKind','taught','occurredOn','2026-07-24','attemptText','playing'),
      jsonb_build_object('canonicalWordId',v_player,'eventKind','taught','occurredOn','2026-07-24','attemptText','player')
    ),
    'itemTransitions',jsonb_build_array(
      jsonb_build_object('learningItemId',v_identify_item,'itemStatus','awaiting_review_outcome','reteachPriority',false,'ejectedOn','','rowStatus','active'),
      jsonb_build_object('learningItemId',v_player_item,'itemStatus','awaiting_review_outcome','reteachPriority',false,'ejectedOn','','rowStatus','active')
    ),
    'reflection',jsonb_build_object('childId',v_child,'parentUserId',v_parent,'assignmentId',v_assignment,'microSkillKey','D4_MOR_BASE_WORDS_IDENTIFY_BASE','contentVersion','proof-v1','promptKey','base-word-family-observation-v1','promptText','What did you notice?','reflectionText','I found the base word.')
  );
  v_result := public.complete_adle_base_word_family_pilot_v2(v_parent,v_child,v_assignment,'2026-07-24','D4_MOR_BASE_WORDS_IDENTIFY_BASE','lesson:'||v_child||':2026-07-24:D4_MOR_BASE_WORDS_IDENTIFY_BASE',v_assignment_items,v_attempts,v_lesson,'[]');
  if v_result->>'status' <> 'completed' then raise exception 'Identify route did not complete'; end if;

  select schedule.id into v_schedule from public.adle_review_schedule_words schedule where schedule.child_id=v_child and schedule.canonical_word_id=v_playing and schedule.row_status='active';
  select count(*) into v_count from public.adle_review_schedule_word_routes where schedule_word_id=v_schedule and row_status='active';
  if v_count <> 2 then raise exception 'Reactivated playing schedule must have two routes, found %',v_count; end if;
  select count(*) into v_count from public.adle_review_schedule_words where child_id=v_child and canonical_word_id=v_playing and row_status='superseded';
  if v_count <> 1 then raise exception 'Playing must retain one superseded historical schedule'; end if;
  select count(*) into v_count from public.adle_review_outcome_events where child_id=v_child and canonical_word_id=v_playing and event_type='reactivated_for_new_skill';
  if v_count <> 1 then raise exception 'Playing must have exactly one reactivation event'; end if;
  select count(*) into v_count from public.adle_review_outcome_event_routes route join public.adle_review_outcome_events event on event.id=route.outcome_event_id where event.child_id=v_child and event.canonical_word_id=v_playing and event.event_type='reactivated_for_new_skill';
  if v_count <> 2 then raise exception 'Playing reactivation must be attributed to both routes'; end if;

  -- One shared review attempt and outcome, each attributed twice without
  -- duplicating the word-level event.
  insert into public.daily_assignments(child_id,parent_user_id,assignment_date,title,status,assignment_generation_source)
  values(v_child,v_parent,'2026-07-25','ADLE shared review proof','pending','adle_composer_v1') returning id into v_review_assignment;
  insert into public.assignment_items(daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,source_entity_id,template_key,target_word,position,status,metadata)
  values(v_review_assignment,v_child,v_parent,'spelling','lesson','adle_review','adle-playing-proof:review','proof-review','playing',1,'ready','{}') returning id into v_review_item;
  insert into public.adle_assignment_attempt_events(child_id,parent_user_id,daily_assignment_id,assignment_item_id,canonical_word_id,micro_skill_key,section_key,template_key,target_word,attempt_text,is_correct,attempt_kind,evidence_class,source_ref)
  values(v_child,v_parent,v_review_assignment,v_review_item,v_playing,'D4_MOR_BASE_WORDS_IDENTIFY_BASE','review_production','proof-review','playing','playing',true,'review_production','scheduled_review_attempt','review:adle-playing-proof') returning id into v_review_attempt;
  insert into public.adle_assignment_attempt_event_routes(attempt_event_id,learning_item_id,micro_skill_key)
  select v_review_attempt,learning_item_id,micro_skill_key from public.adle_review_schedule_word_routes where schedule_word_id=v_schedule and row_status='active';
  insert into public.adle_review_outcome_events(child_id,canonical_word_id,bundle_id,event_type,occurred_on,interval_index,schedule_policy_version,attempt_text)
  values(v_child,v_playing,v_bundle,'review_pass','2026-07-25',0,v_policy,'playing') returning id into v_review_outcome;
  insert into public.adle_review_outcome_event_routes(outcome_event_id,learning_item_id,micro_skill_key)
  select v_review_outcome,learning_item_id,micro_skill_key from public.adle_review_schedule_word_routes where schedule_word_id=v_schedule and row_status='active';
  select count(*) into v_count from public.adle_assignment_attempt_events where id=v_review_attempt;
  if v_count <> 1 then raise exception 'Shared review must persist one word attempt'; end if;
  select count(*) into v_count from public.adle_assignment_attempt_event_routes where attempt_event_id=v_review_attempt;
  if v_count <> 2 then raise exception 'Shared review attempt must be attributed to two routes'; end if;
  select count(*) into v_count from public.adle_review_outcome_events where id=v_review_outcome;
  if v_count <> 1 then raise exception 'Shared review must persist one word outcome'; end if;
  select count(*) into v_count from public.adle_review_outcome_event_routes where outcome_event_id=v_review_outcome;
  if v_count <> 2 then raise exception 'Shared review outcome must be attributed to two routes'; end if;

  -- Idempotent completion replay must preserve the one active schedule.
  v_result := public.complete_adle_base_word_family_pilot_v2(v_parent,v_child,v_assignment,'2026-07-24','D4_MOR_BASE_WORDS_IDENTIFY_BASE','lesson:'||v_child||':2026-07-24:D4_MOR_BASE_WORDS_IDENTIFY_BASE',v_assignment_items,v_attempts,v_lesson,'[]');
  if v_result->>'status' <> 'already_completed' then raise exception 'Completion replay was not idempotent'; end if;
end $$;

select jsonb_build_object(
  'status','passed',
  'proofTag','adle_playing_shared_routes_local_proof',
  'mappings',jsonb_build_array(
    'plaiing -> playing -> D4_MOR_BASE_WORDS_PRESERVE_BASE',
    'plaing -> playing -> D4_MOR_BASE_WORDS_IDENTIFY_BASE'
  ),
  'learningItems',(select count(*) from public.adle_learning_items item join public.children child on child.id=item.child_id where child.notes='adle_playing_shared_routes_local_proof' and item.canonical_word_id=(select id from public.canonical_teaching_dictionary_words where normalised_word='playing')),
  'activeScheduleRoutes',(select count(*) from public.adle_review_schedule_word_routes route join public.adle_review_schedule_words schedule on schedule.id=route.schedule_word_id join public.children child on child.id=schedule.child_id where child.notes='adle_playing_shared_routes_local_proof' and schedule.canonical_word_id=(select id from public.canonical_teaching_dictionary_words where normalised_word='playing') and schedule.row_status='active' and route.row_status='active'),
  'reactivations',(select count(*) from public.adle_review_outcome_events event join public.children child on child.id=event.child_id where child.notes='adle_playing_shared_routes_local_proof' and event.event_type='reactivated_for_new_skill'),
  'sharedReviewWordAttempts',(select count(*) from public.adle_assignment_attempt_events event join public.children child on child.id=event.child_id where child.notes='adle_playing_shared_routes_local_proof' and event.source_ref='review:adle-playing-proof'),
  'sharedReviewAttemptRoutes',(select count(*) from public.adle_assignment_attempt_event_routes route join public.adle_assignment_attempt_events event on event.id=route.attempt_event_id where event.source_ref='review:adle-playing-proof'),
  'cleanup','transaction_rollback'
) as adle_playing_shared_route_proof;

rollback;
