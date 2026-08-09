\set ON_ERROR_STOP on
begin;

create temporary table bw1_base_word_targets (
  ordinal integer primary key,
  activation_id uuid not null,
  micro_skill_key text not null,
  canonical_word_id uuid not null,
  normalised_word text not null,
  source_id uuid,
  mapping_id uuid,
  learning_item_id uuid
) on commit drop;
create temporary table bw1_base_word_receipt (receipt jsonb not null) on commit drop;

-- Self-contained governed fixtures. Everything, including curriculum and the
-- parent-approved source, is rolled back; learning items are still created
-- exclusively by the production RPC below.
do $$
declare
  v_parent uuid := gen_random_uuid();
  v_child uuid := gen_random_uuid();
  v_course uuid := gen_random_uuid();
  v_module uuid := gen_random_uuid();
  v_task uuid := gen_random_uuid();
  v_batch uuid := gen_random_uuid();
  v_manifest uuid := gen_random_uuid();
  v_activation uuid := gen_random_uuid();
  v_family uuid := gen_random_uuid();
  v_base_word uuid := gen_random_uuid();
  v_target_one uuid := gen_random_uuid();
  v_target_two uuid := gen_random_uuid();
  v_nonmember_word uuid := gen_random_uuid();
  v_skill text := 'D4_MOR_BASE_WORDS_PRESERVE_BASE';
begin
  insert into auth.users (id) values (v_parent);
  insert into public.children (id, parent_user_id, first_name)
  values (v_child, v_parent, 'BW1 Local Proof');
  insert into public.courses (id, parent_user_id, child_id, title)
  values (v_course, v_parent, v_child, 'BW1 Local Proof');
  insert into public.course_modules (id, course_id, parent_user_id, title)
  values (v_module, v_course, v_parent, 'BW1 Local Proof');
  insert into public.course_tasks (
    id, course_id, module_id, parent_user_id, title, task_type
  ) values (v_task, v_course, v_module, v_parent, 'BW1 Local Proof', 'lesson');
  insert into public.task_submissions (
    task_id, course_id, child_id, parent_user_id, submission_text,
    parent_review_status, parent_reviewed_at
  ) values (
    v_task, v_course, v_child, v_parent, 'BW1 local proof submission',
    'approved', timezone('utc', now())
  );
  insert into public.micro_skill_catalog (
    mastery_domain_key, skill_family_key, micro_skill_key, display_name,
    practice_route, is_assignable, is_active
  ) values (
    'D4', 'base_words', v_skill, 'BW1 Base Word Proof',
    'word_practice', true, true
  );
  insert into public.canonical_teaching_dictionary_import_batches (
    id, source_folder_path, import_mode, batch_status
  ) values (v_batch, '/tmp/bw1-local-proof', 'local_dev_import', 'applied');
  insert into public.canonical_teaching_dictionary_words (
    id, import_batch_id, row_status, source_sheet, source_row_number,
    source_row_hash, word_key, normalised_word, display_word,
    frequency_band, age_band, source_category, confidence, review_status
  ) values
    (v_base_word, v_batch, 'active', 'BW1', 2, 'bw1-base', 'bw1base', 'bw1base', 'bw1base', 'high', 'middle_primary', 'internal_reviewed_seed', 'high', 'approved_for_first_exposure'),
    (v_target_one, v_batch, 'active', 'BW1', 3, 'bw1-target-one', 'bw1targetone', 'bw1targetone', 'bw1targetone', 'high', 'middle_primary', 'internal_reviewed_seed', 'high', 'approved_for_first_exposure'),
    (v_target_two, v_batch, 'active', 'BW1', 4, 'bw1-target-two', 'bw1targettwo', 'bw1targettwo', 'bw1targettwo', 'high', 'middle_primary', 'internal_reviewed_seed', 'high', 'approved_for_first_exposure'),
    (v_nonmember_word, v_batch, 'active', 'BW1', 5, 'bw1-nonmember', 'bw1nonmember', 'bw1nonmember', 'bw1nonmember', 'high', 'middle_primary', 'internal_reviewed_seed', 'high', 'approved_for_first_exposure');
  insert into public.canonical_teaching_dictionary_base_word_families (
    id, import_batch_id, base_family_key, micro_skill_key, base_word_id,
    base_meaning, row_status, source_sheet, source_row_number,
    source_row_hash, source_category, confidence, review_status
  ) values (
    v_family, v_batch, 'BW1_LOCAL', v_skill, v_base_word,
    'local proof family', 'active', 'BW1', 2, 'bw1-family',
    'internal_reviewed_seed', 'high', 'approved_for_first_exposure'
  );
  insert into public.canonical_teaching_dictionary_base_word_family_members (
    import_batch_id, base_word_family_id, canonical_word_id, member_role,
    word_sum, morphology_parts, assignment_eligible, row_status,
    source_sheet, source_row_number, source_row_hash, source_category,
    confidence, review_status, dictation_sentence,
    dictation_target_token_index, audio_text
  ) values
    (v_batch, v_family, v_base_word, 'base', 'bw1 + base', '[{"kind":"base"}]', true, 'active', 'BW1', 2, 'bw1-member-base', 'internal_reviewed_seed', 'high', 'approved_for_first_exposure', 'Spell bw1base.', 1, 'Spell bw1base.'),
    (v_batch, v_family, v_target_one, 'authentic_target', 'bw1 + target + one', '[{"kind":"base"}]', true, 'active', 'BW1', 3, 'bw1-member-one', 'internal_reviewed_seed', 'high', 'approved_for_first_exposure', 'Spell bw1targetone.', 1, 'Spell bw1targetone.'),
    (v_batch, v_family, v_target_two, 'authentic_target', 'bw1 + target + two', '[{"kind":"base"}]', true, 'active', 'BW1', 4, 'bw1-member-two', 'internal_reviewed_seed', 'high', 'approved_for_first_exposure', 'Spell bw1targettwo.', 1, 'Spell bw1targettwo.');
  insert into public.adle_curriculum_import_manifests (
    id, manifest_key, schema_version, manifest_file_sha256,
    manifest_payload_sha256, source_package_path, source_package_sha256,
    approval_refs, manifest_payload, import_batch_id, environment_key,
    applied_by
  ) values (
    v_manifest, 'bw1-local-proof', 1, repeat('1', 64), repeat('2', 64),
    '/tmp/bw1-local-proof', repeat('3', 64), '["bw1-local-proof"]',
    '{"proof":"bw1"}', v_batch, 'local', 'bw1-local-proof'
  );
  insert into public.adle_lesson_route_activations (
    id, micro_skill_key, lesson_route_key, payload_version,
    environment_key, activation_status, content_version,
    import_manifest_id, readiness_report, activated_at
  ) values (
    v_activation, v_skill, 'base_word_family_v1', 1, 'local',
    'production_enabled', 'bw1-local-v1', v_manifest,
    '{"approved":true}', timezone('utc', now())
  );
end;
$$;

insert into bw1_base_word_targets (
  ordinal, activation_id, micro_skill_key, canonical_word_id, normalised_word
)
select
  row_number() over (order by member.canonical_word_id),
  activation.id,
  activation.micro_skill_key,
  member.canonical_word_id,
  word.normalised_word
from public.adle_lesson_route_activations activation
join public.adle_curriculum_import_manifests manifest
  on manifest.id = activation.import_manifest_id
 and manifest.environment_key = activation.environment_key
 and manifest.row_status = 'active'
join public.canonical_teaching_dictionary_base_word_families family
  on family.import_batch_id = manifest.import_batch_id
 and family.micro_skill_key = activation.micro_skill_key
 and family.row_status = 'active'
 and family.review_status = 'approved_for_first_exposure'
join public.canonical_teaching_dictionary_base_word_family_members member
  on member.base_word_family_id = family.id
 and member.import_batch_id = manifest.import_batch_id
 and member.member_role = 'authentic_target'
 and member.assignment_eligible = true
 and member.row_status = 'active'
 and member.review_status = 'approved_for_first_exposure'
join public.canonical_teaching_dictionary_words word
  on word.id = member.canonical_word_id
 and word.row_status = 'active'
 and word.review_status = 'approved_for_first_exposure'
where activation.lesson_route_key = 'base_word_family_v1'
  and activation.payload_version = 1
  and activation.activation_status = 'production_enabled'
  and activation.row_status = 'active'
  and activation.micro_skill_key in (
    'D4_MOR_BASE_WORDS_IDENTIFY_BASE',
    'D4_MOR_BASE_WORDS_PRESERVE_BASE'
  )
  and activation.micro_skill_key = (
    select candidate.micro_skill_key
    from public.adle_lesson_route_activations candidate
    join public.adle_curriculum_import_manifests candidate_manifest
      on candidate_manifest.id = candidate.import_manifest_id
    join public.canonical_teaching_dictionary_base_word_families candidate_family
      on candidate_family.import_batch_id = candidate_manifest.import_batch_id
     and candidate_family.micro_skill_key = candidate.micro_skill_key
    join public.canonical_teaching_dictionary_base_word_family_members candidate_member
      on candidate_member.base_word_family_id = candidate_family.id
     and candidate_member.import_batch_id = candidate_manifest.import_batch_id
    where candidate.lesson_route_key = 'base_word_family_v1'
      and candidate.payload_version = 1
      and candidate.activation_status = 'production_enabled'
      and candidate.row_status = 'active'
      and candidate_member.member_role = 'authentic_target'
      and candidate_member.assignment_eligible = true
      and candidate_member.row_status = 'active'
      and candidate_member.review_status = 'approved_for_first_exposure'
    group by candidate.micro_skill_key
    having count(distinct candidate_member.canonical_word_id) >= 2
    order by candidate.micro_skill_key
    limit 1
  )
limit 2;

do $$
declare
  v_tag text := 'adle_bw1_base_word_' || replace(gen_random_uuid()::text, '-', '');
  v_submission uuid;
  v_parent uuid;
  v_child uuid;
  v_target record;
  v_verification uuid;
  v_source uuid;
  v_mapping uuid;
  v_item uuid;
  v_replay_item uuid;
  v_inserted boolean;
  v_approval_count integer;
  v_base record;
  v_nonmember record;
  v_base_item_count_before integer;
  v_rejected boolean := false;
begin
  if (select count(*) from bw1_base_word_targets) <> 2 then
    raise exception 'BW-1 local proof requires two activation-bound authentic targets for one governed skill';
  end if;
  select submission.id, submission.parent_user_id, submission.child_id
  into v_submission, v_parent, v_child
  from public.task_submissions submission
  where submission.parent_review_status = 'approved'
    and submission.parent_user_id is not null
    and submission.child_id is not null
  order by submission.created_at desc
  limit 1;
  if v_submission is null then
    raise exception 'BW-1 local proof requires one existing approved task submission';
  end if;

  for v_target in select * from bw1_base_word_targets order by ordinal loop
    insert into public.parent_verifications (
      child_id, parent_user_id, domain_module, source_type, source_entity_id,
      task_submission_id, suggested_micro_skill_key, decision,
      verified_micro_skill_key, metadata
    ) values (
      v_child, v_parent, 'spelling', 'canonical_intake_bw1_local_proof',
      v_tag || ':' || v_target.ordinal, v_submission,
      v_target.micro_skill_key, 'accepted', v_target.micro_skill_key,
      jsonb_build_object('proofTag', v_tag)
    ) returning id into v_verification;
    insert into public.parent_verified_spelling_candidate_mappings (
      parent_user_id, child_id, parent_verification_id, task_submission_id,
      source_provenance, reviewed_event_source_entity_id,
      original_child_spelling, original_correct_spelling,
      misspelling_normalized, correct_spelling_normalized, micro_skill_key,
      candidate_status, promotion_scope, metadata
    ) values (
      v_parent, v_child, v_verification, v_submission,
      'lesson_submission_parent_added_missed_word',
      v_tag || ':candidate:' || v_target.ordinal,
      v_tag || v_target.ordinal, v_target.normalised_word,
      v_tag || v_target.ordinal, v_target.normalised_word,
      v_target.micro_skill_key, 'parent_local_promoted', 'parent_local',
      jsonb_build_object('proofTag', v_tag)
    ) returning id into v_source;
    insert into public.spelling_canonical_mappings (
      misspelling_normalized, correct_spelling_normalized, micro_skill_key,
      mapping_status, resolver_visibility_status, created_by_admin_user_id,
      decision_note, source_candidate_mapping_id, metadata
    ) values (
      v_tag || v_target.ordinal, v_target.normalised_word,
      v_target.micro_skill_key, 'active', 'visible', v_parent,
      'Disposable BW-1 local persistence proof', v_source,
      jsonb_build_object('proofTag', v_tag)
    ) returning id into v_mapping;

    perform public.adle_seed_canonical_intake_candidate(
      v_source, v_target.normalised_word, 'base_word_lab', 'v2',
      v_target.micro_skill_key, 'bw1-local-proof:' || v_source::text
    );
    select learning_item_id, inserted into v_item, v_inserted
    from public.adle_persist_canonical_intake(
      v_child, v_target.canonical_word_id, v_target.micro_skill_key,
      v_source, v_mapping, v_tag || v_target.ordinal,
      v_target.normalised_word, 'verified-correction:' || v_source::text,
      current_date, 'base_word_lab', 'v2', v_target.activation_id
    );
    if not v_inserted then
      raise exception 'BW-1 first persistence call did not insert a learning item';
    end if;
    select learning_item_id into v_replay_item
    from public.adle_persist_canonical_intake(
      v_child, v_target.canonical_word_id, v_target.micro_skill_key,
      v_source, v_mapping, v_tag || v_target.ordinal,
      v_target.normalised_word, 'verified-correction:' || v_source::text,
      current_date, 'base_word_lab', 'v2', v_target.activation_id
    );
    if v_replay_item <> v_item then
      raise exception 'BW-1 replay did not reuse the same learning item';
    end if;
    update bw1_base_word_targets
    set source_id = v_source, mapping_id = v_mapping, learning_item_id = v_item
    where ordinal = v_target.ordinal;
  end loop;

  select count(*) into v_approval_count
  from public.parent_verifications
  where metadata->>'proofTag' = v_tag;
  if v_approval_count <> 2 then
    raise exception 'BW-1 replay duplicated or lost parent approval';
  end if;
  if (select count(*) from public.adle_learning_items item join bw1_base_word_targets target on target.learning_item_id = item.id where item.row_status = 'active' and item.item_status = 'pending' and item.source_kind = 'verified_misspelling') <> 2 then
    raise exception 'BW-1 persisted items are not discoverable verified pending learning items';
  end if;
  if (select count(*) from public.adle_learning_item_sources source join bw1_base_word_targets target on target.learning_item_id = source.learning_item_id and target.source_id = source.parent_verified_candidate_mapping_id and target.mapping_id = source.canonical_mapping_id where source.row_status = 'active') <> 2 then
    raise exception 'BW-1 immutable source lineage is missing';
  end if;
  if exists (select 1 from public.adle_canonical_intake_candidates candidate join bw1_base_word_targets target on target.source_id = candidate.source_candidate_mapping_id where candidate.route_id <> 'base_word_lab' or candidate.route_version <> 'v2' or candidate.learning_item_id <> target.learning_item_id) then
    raise exception 'BW-1 persistence downgraded or misattributed the candidate route';
  end if;

  select activation.id as activation_id, activation.micro_skill_key,
         member.canonical_word_id, word.normalised_word
  into v_base
  from public.adle_lesson_route_activations activation
  join public.adle_curriculum_import_manifests manifest on manifest.id = activation.import_manifest_id
  join public.canonical_teaching_dictionary_base_word_families family on family.import_batch_id = manifest.import_batch_id and family.micro_skill_key = activation.micro_skill_key
  join public.canonical_teaching_dictionary_base_word_family_members member on member.base_word_family_id = family.id and member.import_batch_id = manifest.import_batch_id
  join public.canonical_teaching_dictionary_words word on word.id = member.canonical_word_id
  where activation.id = (select activation_id from bw1_base_word_targets limit 1)
    and member.member_role = 'base'
    and member.row_status = 'active'
    and member.review_status = 'approved_for_first_exposure'
  limit 1;
  if v_base.canonical_word_id is null then
    raise exception 'BW-1 local proof requires one base-role member in the activated batch';
  end if;
  select count(*) into v_base_item_count_before from public.adle_learning_items
  where child_id = v_child and canonical_word_id = v_base.canonical_word_id
    and micro_skill_key = v_base.micro_skill_key and row_status = 'active';

  insert into public.parent_verifications (
    child_id, parent_user_id, domain_module, source_type, source_entity_id,
    task_submission_id, suggested_micro_skill_key, decision,
    verified_micro_skill_key, metadata
  ) values (
    v_child, v_parent, 'spelling', 'canonical_intake_bw1_local_proof',
    v_tag || ':base-role', v_submission, v_base.micro_skill_key, 'accepted',
    v_base.micro_skill_key, jsonb_build_object('proofTag', v_tag, 'negative', true)
  ) returning id into v_verification;
  insert into public.parent_verified_spelling_candidate_mappings (
    parent_user_id, child_id, parent_verification_id, task_submission_id,
    source_provenance, reviewed_event_source_entity_id,
    original_child_spelling, original_correct_spelling,
    misspelling_normalized, correct_spelling_normalized, micro_skill_key,
    candidate_status, promotion_scope, metadata
  ) values (
    v_parent, v_child, v_verification, v_submission,
    'lesson_submission_parent_added_missed_word', v_tag || ':base-role',
    v_tag || 'base', v_base.normalised_word, v_tag || 'base',
    v_base.normalised_word, v_base.micro_skill_key,
    'parent_local_promoted', 'parent_local', jsonb_build_object('proofTag', v_tag)
  ) returning id into v_source;
  insert into public.spelling_canonical_mappings (
    misspelling_normalized, correct_spelling_normalized, micro_skill_key,
    mapping_status, resolver_visibility_status, created_by_admin_user_id,
    decision_note, source_candidate_mapping_id, metadata
  ) values (
    v_tag || 'base', v_base.normalised_word, v_base.micro_skill_key,
    'active', 'visible', v_parent, 'Disposable BW-1 negative role proof',
    v_source, jsonb_build_object('proofTag', v_tag)
  ) returning id into v_mapping;
  begin
    perform * from public.adle_persist_canonical_intake(
      v_child, v_base.canonical_word_id, v_base.micro_skill_key,
      v_source, v_mapping, v_tag || 'base', v_base.normalised_word,
      'verified-correction:' || v_source::text, current_date,
      'base_word_lab', 'v2', v_base.activation_id
    );
  exception when others then
    if sqlerrm like '%not an exact activation-bound authentic target%' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then raise exception 'BW-1 RPC accepted a base-role member'; end if;
  if (select count(*) from public.adle_learning_items where child_id = v_child and canonical_word_id = v_base.canonical_word_id and micro_skill_key = v_base.micro_skill_key and row_status = 'active') <> v_base_item_count_before then
    raise exception 'BW-1 rejected base-role persistence still changed learning items';
  end if;

  select word.id as canonical_word_id, word.normalised_word,
         target.micro_skill_key, target.activation_id
  into v_nonmember
  from public.canonical_teaching_dictionary_words word
  cross join (select micro_skill_key, activation_id from bw1_base_word_targets limit 1) target
  where word.normalised_word = 'bw1nonmember';
  insert into public.parent_verifications (
    child_id, parent_user_id, domain_module, source_type, source_entity_id,
    task_submission_id, suggested_micro_skill_key, decision,
    verified_micro_skill_key, metadata
  ) values (
    v_child, v_parent, 'spelling', 'canonical_intake_bw1_local_proof',
    v_tag || ':nonmember', v_submission, v_nonmember.micro_skill_key,
    'accepted', v_nonmember.micro_skill_key,
    jsonb_build_object('proofTag', v_tag, 'negative', true)
  ) returning id into v_verification;
  insert into public.parent_verified_spelling_candidate_mappings (
    parent_user_id, child_id, parent_verification_id, task_submission_id,
    source_provenance, reviewed_event_source_entity_id,
    original_child_spelling, original_correct_spelling,
    misspelling_normalized, correct_spelling_normalized, micro_skill_key,
    candidate_status, promotion_scope, metadata
  ) values (
    v_parent, v_child, v_verification, v_submission,
    'lesson_submission_parent_added_missed_word', v_tag || ':nonmember',
    v_tag || 'nonmember', v_nonmember.normalised_word,
    v_tag || 'nonmember', v_nonmember.normalised_word,
    v_nonmember.micro_skill_key, 'parent_local_promoted', 'parent_local',
    jsonb_build_object('proofTag', v_tag)
  ) returning id into v_source;
  insert into public.spelling_canonical_mappings (
    misspelling_normalized, correct_spelling_normalized, micro_skill_key,
    mapping_status, resolver_visibility_status, created_by_admin_user_id,
    decision_note, source_candidate_mapping_id, metadata
  ) values (
    v_tag || 'nonmember', v_nonmember.normalised_word,
    v_nonmember.micro_skill_key, 'active', 'visible', v_parent,
    'Disposable BW-1 negative nonmember proof', v_source,
    jsonb_build_object('proofTag', v_tag)
  ) returning id into v_mapping;
  v_rejected := false;
  begin
    perform * from public.adle_persist_canonical_intake(
      v_child, v_nonmember.canonical_word_id, v_nonmember.micro_skill_key,
      v_source, v_mapping, v_tag || 'nonmember',
      v_nonmember.normalised_word, 'verified-correction:' || v_source::text,
      current_date, 'base_word_lab', 'v2', v_nonmember.activation_id
    );
  exception when others then
    if sqlerrm like '%not an exact activation-bound authentic target%' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then raise exception 'BW-1 RPC accepted a non-member word'; end if;

  insert into bw1_base_word_receipt values (jsonb_build_object(
    'route', 'base_word_lab:v2',
    'learningItemIds', (select jsonb_agg(learning_item_id order by ordinal) from bw1_base_word_targets),
    'parentApprovalCount', v_approval_count,
    'replayIdempotent', true,
    'lineagePreserved', true,
    'baseRoleRejected', true,
    'nonMemberRejected', true,
    'selectorDiscoverableTargets', 2
  ));
end;
$$;

select 'BW1_RECEIPT:' || receipt::text from bw1_base_word_receipt;

rollback;
