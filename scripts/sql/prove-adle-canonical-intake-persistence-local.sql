\set ON_ERROR_STOP on
begin;

create temporary table bw0_canonical_intake_receipt (
  receipt jsonb not null
) on commit drop;

do $$
declare
  v_tag text := 'adle_bw0_persistence_' || replace(gen_random_uuid()::text, '-', '');
  v_submission uuid;
  v_parent uuid;
  v_child uuid;
  v_prefix record;
  v_affix record;
  v_generic record;
  v_prefix_profile_was_enabled boolean;
  v_affix_profile_was_enabled boolean;
  v_verification uuid;
  v_prefix_source uuid;
  v_affix_source uuid;
  v_generic_source uuid;
  v_prefix_mapping uuid;
  v_affix_mapping uuid;
  v_generic_mapping uuid;
  v_prefix_item uuid;
  v_affix_item uuid;
  v_generic_item uuid;
  v_replay_item uuid;
  v_inserted boolean;
  v_candidate uuid;
  v_demand uuid;
  v_count integer;
begin
  select submission.id, submission.parent_user_id, submission.child_id
  into v_submission, v_parent, v_child
  from public.task_submissions submission
  where submission.parent_review_status = 'approved'
    and submission.parent_user_id is not null
    and submission.child_id is not null
  order by submission.created_at desc
  limit 1;
  if v_submission is null then
    raise exception 'BW-0 local proof requires one existing approved task submission';
  end if;

  select
    profile.id as profile_id,
    profile.micro_skill_key,
    profile.production_enabled,
    member.canonical_word_id,
    word.normalised_word
  into v_prefix
  from public.canonical_teaching_dictionary_prefix_profiles profile
  join public.canonical_teaching_dictionary_prefix_members member
    on member.prefix_profile_id = profile.id
  join public.canonical_teaching_dictionary_words word
    on word.id = member.canonical_word_id
  join public.micro_skill_catalog skill
    on skill.micro_skill_key = profile.micro_skill_key
  where profile.row_status = 'active'
    and profile.review_status = 'approved_for_first_exposure'
    and member.assignment_eligible = true
    and member.row_status = 'active'
    and member.review_status = 'approved_for_first_exposure'
    and word.row_status = 'active'
    and word.review_status = 'approved_for_first_exposure'
    and skill.mastery_domain_key = 'D4'
    and skill.is_active = true
    and skill.is_assignable = true
  order by profile.production_enabled desc, profile.micro_skill_key, word.normalised_word
  limit 1;
  if v_prefix.micro_skill_key is null then
    raise exception 'BW-0 local proof requires one active, approved, assignment-eligible Prefix member';
  end if;
  v_prefix_profile_was_enabled := v_prefix.production_enabled;
  if not v_prefix_profile_was_enabled then
    update public.canonical_teaching_dictionary_prefix_profiles
    set production_enabled = true
    where id = v_prefix.profile_id
      and production_enabled = false;
    if not found then
      raise exception 'BW-0 local proof could not temporarily enable its Prefix profile';
    end if;
  end if;

  select
    profile.id as profile_id,
    profile.micro_skill_key,
    profile.production_enabled,
    member.canonical_word_id,
    word.normalised_word
  into v_affix
  from public.canonical_teaching_dictionary_suffix_profiles profile
  join public.canonical_teaching_dictionary_suffix_members member
    on member.suffix_profile_id = profile.id
  join public.canonical_teaching_dictionary_words word
    on word.id = member.canonical_word_id
  join public.micro_skill_catalog skill
    on skill.micro_skill_key = profile.micro_skill_key
  where profile.row_status = 'active'
    and profile.review_status = 'approved_for_first_exposure'
    and member.assignment_eligible = true
    and member.row_status = 'active'
    and member.review_status = 'approved_for_first_exposure'
    and word.row_status = 'active'
    and word.review_status = 'approved_for_first_exposure'
    and skill.mastery_domain_key = 'D4'
    and skill.is_active = true
    and skill.is_assignable = true
  order by profile.production_enabled desc, profile.micro_skill_key, word.normalised_word
  limit 1;
  if v_affix.micro_skill_key is null then
    raise exception 'BW-0 local proof requires one active, approved, assignment-eligible Dynamic Affix member';
  end if;
  v_affix_profile_was_enabled := v_affix.production_enabled;
  if not v_affix_profile_was_enabled then
    update public.canonical_teaching_dictionary_suffix_profiles
    set production_enabled = true
    where id = v_affix.profile_id
      and production_enabled = false;
    if not found then
      raise exception 'BW-0 local proof could not temporarily enable its Dynamic Affix profile';
    end if;
  end if;

  select support.micro_skill_key, support.canonical_word_id, word.normalised_word
  into v_generic
  from public.canonical_teaching_dictionary_word_support support
  join public.canonical_teaching_dictionary_words word
    on word.id = support.canonical_word_id
  join public.micro_skill_catalog skill
    on skill.micro_skill_key = support.micro_skill_key
  where support.row_status = 'active'
    and support.review_status = 'approved_for_first_exposure'
    and word.row_status = 'active'
    and word.review_status = 'approved_for_first_exposure'
    and skill.mastery_domain_key = 'D4'
    and skill.is_active = true
    and skill.is_assignable = true
    and support.micro_skill_key not like 'D4_MOR_PREFIXES_%'
    and support.micro_skill_key not like 'D4_MOR_SUFFIXES_%'
    and support.micro_skill_key not like 'D4_MOR_BASE_WORDS_%'
  order by support.micro_skill_key, word.normalised_word
  limit 1;
  if v_generic.micro_skill_key is null then
    raise exception 'BW-0 local proof requires one governed generic word-level fact';
  end if;

  insert into public.parent_verifications (
    child_id, parent_user_id, domain_module, source_type, source_entity_id,
    task_submission_id, suggested_micro_skill_key, decision,
    verified_micro_skill_key, metadata
  ) values (
    v_child, v_parent, 'spelling', 'canonical_intake_bw0_local_proof',
    v_tag || ':prefix', v_submission, v_prefix.micro_skill_key, 'accepted',
    v_prefix.micro_skill_key, jsonb_build_object('proofTag', v_tag)
  ) returning id into v_verification;
  insert into public.parent_verified_spelling_candidate_mappings (
    parent_user_id, child_id, parent_verification_id, task_submission_id,
    source_provenance, reviewed_event_source_entity_id,
    original_child_spelling, original_correct_spelling,
    misspelling_normalized, correct_spelling_normalized, micro_skill_key,
    candidate_status, promotion_scope, metadata
  ) values (
    v_parent, v_child, v_verification, v_submission,
    'lesson_submission_parent_added_missed_word', v_tag || ':prefix',
    v_tag || 'prefix', v_prefix.normalised_word,
    v_tag || 'prefix', v_prefix.normalised_word, v_prefix.micro_skill_key,
    'parent_local_promoted', 'parent_local', jsonb_build_object('proofTag', v_tag)
  ) returning id into v_prefix_source;
  insert into public.spelling_canonical_mappings (
    misspelling_normalized, correct_spelling_normalized, micro_skill_key,
    mapping_status, resolver_visibility_status, created_by_admin_user_id,
    decision_note, source_candidate_mapping_id, metadata
  ) values (
    v_tag || 'prefix', v_prefix.normalised_word, v_prefix.micro_skill_key,
    'active', 'visible', v_parent, 'Disposable BW-0 local persistence proof',
    v_prefix_source, jsonb_build_object('proofTag', v_tag)
  ) returning id into v_prefix_mapping;

  insert into public.parent_verifications (
    child_id, parent_user_id, domain_module, source_type, source_entity_id,
    task_submission_id, suggested_micro_skill_key, decision,
    verified_micro_skill_key, metadata
  ) values (
    v_child, v_parent, 'spelling', 'canonical_intake_bw0_local_proof',
    v_tag || ':affix', v_submission, v_affix.micro_skill_key, 'accepted',
    v_affix.micro_skill_key, jsonb_build_object('proofTag', v_tag)
  ) returning id into v_verification;
  insert into public.parent_verified_spelling_candidate_mappings (
    parent_user_id, child_id, parent_verification_id, task_submission_id,
    source_provenance, reviewed_event_source_entity_id,
    original_child_spelling, original_correct_spelling,
    misspelling_normalized, correct_spelling_normalized, micro_skill_key,
    candidate_status, promotion_scope, metadata
  ) values (
    v_parent, v_child, v_verification, v_submission,
    'lesson_submission_parent_added_missed_word', v_tag || ':affix',
    v_tag || 'affix', v_affix.normalised_word,
    v_tag || 'affix', v_affix.normalised_word, v_affix.micro_skill_key,
    'parent_local_promoted', 'parent_local', jsonb_build_object('proofTag', v_tag)
  ) returning id into v_affix_source;
  insert into public.spelling_canonical_mappings (
    misspelling_normalized, correct_spelling_normalized, micro_skill_key,
    mapping_status, resolver_visibility_status, created_by_admin_user_id,
    decision_note, source_candidate_mapping_id, metadata
  ) values (
    v_tag || 'affix', v_affix.normalised_word, v_affix.micro_skill_key,
    'active', 'visible', v_parent, 'Disposable BW-0 local persistence proof',
    v_affix_source, jsonb_build_object('proofTag', v_tag)
  ) returning id into v_affix_mapping;

  insert into public.parent_verifications (
    child_id, parent_user_id, domain_module, source_type, source_entity_id,
    task_submission_id, suggested_micro_skill_key, decision,
    verified_micro_skill_key, metadata
  ) values (
    v_child, v_parent, 'spelling', 'canonical_intake_bw0_local_proof',
    v_tag || ':generic', v_submission, v_generic.micro_skill_key, 'accepted',
    v_generic.micro_skill_key, jsonb_build_object('proofTag', v_tag)
  ) returning id into v_verification;
  insert into public.parent_verified_spelling_candidate_mappings (
    parent_user_id, child_id, parent_verification_id, task_submission_id,
    source_provenance, reviewed_event_source_entity_id,
    original_child_spelling, original_correct_spelling,
    misspelling_normalized, correct_spelling_normalized, micro_skill_key,
    candidate_status, promotion_scope, metadata
  ) values (
    v_parent, v_child, v_verification, v_submission,
    'lesson_submission_parent_added_missed_word', v_tag || ':generic',
    v_tag || 'generic', v_generic.normalised_word,
    v_tag || 'generic', v_generic.normalised_word, v_generic.micro_skill_key,
    'parent_local_promoted', 'parent_local', jsonb_build_object('proofTag', v_tag)
  ) returning id into v_generic_source;
  insert into public.spelling_canonical_mappings (
    misspelling_normalized, correct_spelling_normalized, micro_skill_key,
    mapping_status, resolver_visibility_status, created_by_admin_user_id,
    decision_note, source_candidate_mapping_id, metadata
  ) values (
    v_tag || 'generic', v_generic.normalised_word, v_generic.micro_skill_key,
    'active', 'visible', v_parent, 'Disposable BW-0 local persistence proof',
    v_generic_source, jsonb_build_object('proofTag', v_tag)
  ) returning id into v_generic_mapping;

  select blocked.candidate_id, blocked.demand_id
  into v_candidate, v_demand
  from public.adle_record_canonical_intake_blocked(
    v_generic_source,
    v_generic.normalised_word,
    v_generic.canonical_word_id,
    'established',
    'adle_word_level',
    'v1',
    v_generic.micro_skill_key,
    'pending_content',
    jsonb_build_array(jsonb_build_object('code', 'support_missing')),
    repeat('a', 64),
    'teaching_content',
    'support_missing'
  ) blocked;
  perform public.adle_enqueue_canonical_intake_candidate(
    v_candidate, 'governed_content_release', v_tag || ':release'
  );

  select result.learning_item_id, result.inserted
  into v_prefix_item, v_inserted
  from public.adle_persist_canonical_intake(
    v_child, v_prefix.canonical_word_id, v_prefix.micro_skill_key,
    v_prefix_source, v_prefix_mapping, v_tag || 'prefix',
    v_prefix.normalised_word, v_tag || ':prefix', current_date,
    'dynamic_prefix_word_lab', 'v2'
  ) result;
  if not v_inserted then raise exception 'Prefix first persistence did not insert'; end if;

  select result.learning_item_id, result.inserted
  into v_affix_item, v_inserted
  from public.adle_persist_canonical_intake(
    v_child, v_affix.canonical_word_id, v_affix.micro_skill_key,
    v_affix_source, v_affix_mapping, v_tag || 'affix',
    v_affix.normalised_word, v_tag || ':affix', current_date,
    'dynamic_affix_word_lab', 'v3'
  ) result;
  if not v_inserted then raise exception 'Dynamic Affix first persistence did not insert'; end if;

  select result.learning_item_id, result.inserted
  into v_generic_item, v_inserted
  from public.adle_persist_canonical_intake(
    v_child, v_generic.canonical_word_id, v_generic.micro_skill_key,
    v_generic_source, v_generic_mapping, v_tag || 'generic',
    v_generic.normalised_word, v_tag || ':generic', current_date,
    'adle_word_level', 'v1'
  ) result;
  if not v_inserted then raise exception 'Generic first persistence did not insert'; end if;

  select result.learning_item_id, result.inserted
  into v_replay_item, v_inserted
  from public.adle_persist_canonical_intake(
    v_child, v_prefix.canonical_word_id, v_prefix.micro_skill_key,
    v_prefix_source, v_prefix_mapping, v_tag || 'prefix',
    v_prefix.normalised_word, v_tag || ':prefix', current_date,
    'dynamic_prefix_word_lab', 'v2'
  ) result;
  if v_inserted or v_replay_item <> v_prefix_item then
    raise exception 'Prefix replay was not idempotent';
  end if;
  select result.learning_item_id, result.inserted
  into v_replay_item, v_inserted
  from public.adle_persist_canonical_intake(
    v_child, v_affix.canonical_word_id, v_affix.micro_skill_key,
    v_affix_source, v_affix_mapping, v_tag || 'affix',
    v_affix.normalised_word, v_tag || ':affix', current_date,
    'dynamic_affix_word_lab', 'v3'
  ) result;
  if v_inserted or v_replay_item <> v_affix_item then
    raise exception 'Dynamic Affix replay was not idempotent';
  end if;
  select result.learning_item_id, result.inserted
  into v_replay_item, v_inserted
  from public.adle_persist_canonical_intake(
    v_child, v_generic.canonical_word_id, v_generic.micro_skill_key,
    v_generic_source, v_generic_mapping, v_tag || 'generic',
    v_generic.normalised_word, v_tag || ':generic', current_date,
    'adle_word_level', 'v1'
  ) result;
  if v_inserted or v_replay_item <> v_generic_item then
    raise exception 'Generic replay was not idempotent';
  end if;

  select count(*) into v_count
  from public.adle_learning_items item
  where item.id = any(array[v_prefix_item, v_affix_item, v_generic_item])
    and item.item_status = 'pending'
    and item.source_kind = 'verified_misspelling'
    and item.row_status = 'active';
  if v_count <> 3 then raise exception 'Learning-item semantics drifted'; end if;

  select count(*) into v_count
  from public.adle_learning_item_sources source
  where source.parent_verified_candidate_mapping_id = any(
    array[v_prefix_source, v_affix_source, v_generic_source]
  );
  if v_count <> 3 then raise exception 'Learning-item lineage was not idempotent'; end if;

  select count(*) into v_count
  from public.adle_canonical_intake_candidates candidate
  where candidate.source_candidate_mapping_id = v_prefix_source
    and candidate.route_id = 'dynamic_prefix_word_lab'
    and candidate.route_version = 'v2'
    and candidate.candidate_state = 'activated'
    and candidate.learning_item_id = v_prefix_item;
  if v_count <> 1 then raise exception 'Prefix candidate route was not preserved'; end if;
  select count(*) into v_count
  from public.adle_canonical_intake_candidates candidate
  where candidate.source_candidate_mapping_id = v_affix_source
    and candidate.route_id = 'dynamic_affix_word_lab'
    and candidate.route_version = 'v3'
    and candidate.candidate_state = 'activated'
    and candidate.learning_item_id = v_affix_item;
  if v_count <> 1 then raise exception 'Dynamic Affix candidate route was not preserved'; end if;
  select count(*) into v_count
  from public.adle_canonical_intake_candidates candidate
  where candidate.id = v_candidate
    and candidate.source_candidate_mapping_id = v_generic_source
    and candidate.route_id = 'adle_word_level'
    and candidate.route_version = 'v1'
    and candidate.candidate_state = 'activated'
    and candidate.learning_item_id = v_generic_item;
  if v_count <> 1 then raise exception 'Generic candidate route was not preserved'; end if;

  select count(*) into v_count
  from public.adle_canonical_intake_candidate_demands link
  where link.candidate_id = v_candidate
    and link.demand_id = v_demand
    and link.link_status = 'resolved'
    and link.resolved_at is not null;
  if v_count <> 1 then raise exception 'Candidate-demand link was not resolved'; end if;
  select count(*) into v_count
  from public.adle_canonical_intake_demands demand
  where demand.id = v_demand
    and demand.lifecycle_status = 'activated'
    and demand.notification_status = 'resolved'
    and demand.activated_at is not null
    and demand.notification_resolved_at is not null
    and demand.last_reconciliation_outcome = 'all_waiting_candidates_activated';
  if v_count <> 1 then raise exception 'Demand activation lifecycle was not completed'; end if;
  select count(*) into v_count
  from public.adle_canonical_intake_reconciliation_queue queue
  where queue.candidate_id = v_candidate
    and queue.job_status = 'completed'
    and queue.completed_at is not null
    and queue.lease_owner is null
    and queue.lease_expires_at is null;
  if v_count <> 1 then raise exception 'Reconciliation queue was not completed'; end if;
  select count(*) into v_count
  from public.adle_canonical_intake_events event
  where event.candidate_id = v_candidate
    and event.event_type = 'candidate_activated';
  if v_count <> 2 then raise exception 'Generic activation replay events drifted: %', v_count; end if;
  select count(*) into v_count
  from public.adle_canonical_intake_events event
  where event.candidate_id = v_candidate
    and event.event_type = 'candidate_activated'
    and event.event_payload->>'inserted' = 'true';
  if v_count <> 1 then raise exception 'Initial candidate_activated event is missing'; end if;
  select count(*) into v_count
  from public.adle_canonical_intake_events event
  where event.candidate_id = v_candidate
    and event.event_type = 'candidate_activated'
    and event.event_payload->>'inserted' = 'false';
  if v_count <> 1 then raise exception 'Replay candidate_activated event is missing'; end if;

  select count(*) into v_count
  from public.parent_verified_spelling_candidate_mappings source
  where source.id = any(array[v_prefix_source, v_affix_source, v_generic_source]);
  if v_count <> 3 then raise exception 'Parent approvals were duplicated or removed'; end if;

  insert into bw0_canonical_intake_receipt(receipt) values (jsonb_build_object(
    'status', 'passed',
    'proofTag', v_tag,
    'routes', jsonb_build_array(
      'dynamic_prefix_word_lab:v2',
      'dynamic_affix_word_lab:v3',
      'adle_word_level:v1'
    ),
    'learningItems', 3,
    'lineageRows', 3,
    'demandResolved', true,
    'queueCompleted', true,
    'activationEvents', 2,
    'replayIdempotent', true,
    'temporaryProfileActivation', jsonb_build_object(
      'prefix', not v_prefix_profile_was_enabled,
      'dynamicAffix', not v_affix_profile_was_enabled
    ),
    'cleanup', 'transaction_rollback'
  ));
end;
$$;

select 'BW0_RECEIPT:' || receipt::text
from bw0_canonical_intake_receipt;

rollback;
