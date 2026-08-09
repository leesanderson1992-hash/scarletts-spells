\set ON_ERROR_STOP on
begin;

create temporary table bw2a2_receipt (receipt jsonb not null) on commit drop;

do $proof$
declare
  v_tag text := 'bw2a2_' || replace(gen_random_uuid()::text, '-', '');
  v_skill text := 'D4_MOR_BASE_WORDS_PRESERVE_BASE';
  v_parent uuid := gen_random_uuid(); v_child uuid := gen_random_uuid();
  v_course uuid := gen_random_uuid(); v_module uuid := gen_random_uuid(); v_task uuid := gen_random_uuid(); v_submission uuid;
  v_batch uuid := gen_random_uuid(); v_content uuid := gen_random_uuid();
  v_family_a uuid := gen_random_uuid(); v_family_b uuid := gen_random_uuid();
  v_words uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  v_names text[] := array['proofplay','proofplaying','proofplayful','proofreplay','proofgovern','proofgovernment','proofgovernor','proofgoverning'];
  v_roles text[] := array['base','authentic_target','transfer','transfer','base','authentic_target','transfer','transfer'];
  v_family_authority uuid; v_content_authority uuid; v_closure_one uuid; v_closure_two uuid;
  v_release_one uuid; v_release_two uuid; v_revision_one uuid; v_revision_two uuid;
  v_pause uuid; v_reenabled uuid; v_revoked uuid;
  v_family_manifest jsonb; v_content_manifest jsonb; v_closure_manifest jsonb; v_release_manifest jsonb;
  v_release_sha text; v_dependency_fp text; v_closure_fp text;
  v_source uuid; v_mapping uuid; v_verification uuid; v_item uuid; v_replay_item uuid; v_inserted boolean;
  v_items uuid[] := array[]::uuid[]; v_payload jsonb; v_binding_items jsonb; v_assignment_one uuid; v_replay_assignment uuid; v_assignment_two uuid;
  v_metadata jsonb; v_old_metadata jsonb; v_old_payload jsonb; v_rejected boolean := false; v_i integer;
  v_etymology jsonb := '{"relation_type":"free_base","origin_language":"English","origin_form":"proof","literal_meaning":"proof","child_facing_meaning":"proof family","semantic_connection":"transaction proof","evidence":{"source_name":"BW-2A-2 proof","source_url":"https://example.invalid/bw2a2","verification_status":"linked_for_human_review"}}';
begin
  if not exists (select 1 from public.micro_skill_catalog where micro_skill_key=v_skill and is_active and is_assignable) then
    insert into public.micro_skill_catalog(mastery_domain_key,skill_family_key,micro_skill_key,display_name,practice_route,is_assignable,is_active)
    values ('D4','base_words',v_skill,'BW-2A-2 local proof','word_practice',true,true);
  end if;
  insert into auth.users(id) values(v_parent);
  insert into public.children(id,parent_user_id,first_name) values(v_child,v_parent,'BW2A2 Proof');
  insert into public.courses(id,parent_user_id,child_id,title) values(v_course,v_parent,v_child,'BW2A2 Proof');
  insert into public.course_modules(id,course_id,parent_user_id,title) values(v_module,v_course,v_parent,'BW2A2 Proof');
  insert into public.course_tasks(id,course_id,module_id,parent_user_id,title,task_type) values(v_task,v_course,v_module,v_parent,'BW2A2 Proof','lesson');
  insert into public.task_submissions(task_id,course_id,child_id,parent_user_id,submission_text,parent_review_status,parent_reviewed_at)
  values(v_task,v_course,v_child,v_parent,'controlled misspellings','approved',timezone('utc',now())) returning id into v_submission;

  insert into public.canonical_teaching_dictionary_import_batches(
    id,source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,
    source_metadata,imported_by,imported_at,release_id,package_type,package_schema_version,workbook_sha256,package_sha256,target_environment,
    importer_version,verification_summary,verified_at,created_at
  ) values(v_batch,'bw2a2-proof',repeat('1',64),'bw2a2-proof-v1','{"errors":0}','{"words":8}','{"ready":true}','staging_release','applied',
    jsonb_build_object('proofTag',v_tag),'BW-2A-2 proof',timezone('utc',now()),'bw2a2-proof-ledger','canonical_word_batch_v1','1',repeat('2',64),repeat('3',64),'staging',
    'bw2a2-proof-v1','{"verified":true}',timezone('utc',now()),timezone('utc',now()));
  for v_i in 1..8 loop
    insert into public.canonical_teaching_dictionary_words(
      id,import_batch_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,word_key,normalised_word,display_word,dialect_code,
      frequency_band,age_band,source_category,source_name,source_licence,source_use_note,confidence,review_status
    ) values(v_words[v_i],v_batch,'active','BW2A2',v_i+1,repeat(v_i::text,64),jsonb_build_object('proofTag',v_tag),
      v_names[v_i]||'_en_gb',v_names[v_i],v_names[v_i],'en-GB','high','middle_primary','internal_reviewed_seed','BW-2A-2 proof','internal','rollback-only',
      'high','approved_for_first_exposure');
  end loop;
  insert into public.canonical_teaching_dictionary_base_word_families(
    id,import_batch_id,base_family_key,micro_skill_key,base_word_id,base_meaning,etymology_route,row_status,source_sheet,source_row_number,
    source_row_hash,source_category,source_name,source_licence,source_use_note,confidence,review_status
  ) values
    (v_family_a,v_batch,'PROOF_PLAY',v_skill,v_words[1],'play meaning',v_etymology,'active','BW2A2',2,repeat('a',64),'internal_reviewed_seed','BW-2A-2 proof','internal','rollback-only','high','approved_for_first_exposure'),
    (v_family_b,v_batch,'PROOF_GOVERN',v_skill,v_words[5],'govern meaning',v_etymology,'active','BW2A2',3,repeat('b',64),'internal_reviewed_seed','BW-2A-2 proof','internal','rollback-only','high','approved_for_first_exposure');
  for v_i in 1..8 loop
    insert into public.canonical_teaching_dictionary_base_word_family_members(
      import_batch_id,base_word_family_id,canonical_word_id,member_role,word_sum,morphology_parts,morphology_joins,morphology_transformations,
      transformation_notes,child_friendly_meaning,dictation_sentence,dictation_target_token_index,audio_text,assignment_eligible,row_status,
      source_sheet,source_row_number,source_row_hash,source_category,source_name,source_licence,source_use_note,confidence,review_status
    ) values(v_batch,case when v_i<=4 then v_family_a else v_family_b end,v_words[v_i],v_roles[v_i],v_names[v_i],
      jsonb_build_array(jsonb_build_object('id','part-'||v_i,'kind','base','sourceText',v_names[v_i],'surfaceText',v_names[v_i])),
      '[]','[]','',v_names[v_i]||' meaning','Spell '||v_names[v_i]||'.',1,'Spell '||v_names[v_i]||'.',true,'active',
      'BW2A2',v_i+1,repeat(((v_i+1)%10)::text,64),'internal_reviewed_seed','BW-2A-2 proof','internal','rollback-only','high','approved_for_first_exposure');
    insert into public.canonical_teaching_dictionary_dictation_sentences(
      import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,dictation_sentence,
      dictation_target_token_index,audio_text,source_category,source_name,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at
    ) values(v_batch,v_words[v_i],'active','BW2A2',v_i+1,repeat(((v_i+2)%10)::text,64),jsonb_build_object('proofTag',v_tag),
      'Spell '||v_names[v_i]||'.',1,'Spell '||v_names[v_i]||'.','internal_reviewed_seed','BW-2A-2 proof','internal','rollback-only','high',
      'approved_for_first_exposure','BW-2A-2 proof',timezone('utc',now()));
  end loop;
  insert into public.canonical_teaching_dictionary_content_versions(
    id,import_batch_id,source_sheet,source_row_number,source_row_hash,source_metadata,micro_skill_key,content_version,version_status,is_active,
    teaching_objective,child_friendly_explanation,rule_explanation,memory_tip,common_misconceptions,first_exposure_progression,guided_practice_progression,
    review_proofreading_progression,example_selection_guidance,contrast_policy_guidance,source_category,source_name,source_licence,source_use_note,confidence,
    final_readiness_review_status,final_readiness_reviewed_by,final_readiness_reviewed_at
  ) values(v_content,v_batch,'BW2A2',20,repeat('c',64),jsonb_build_object('proofTag',v_tag),v_skill,'bw2a2-content-v1','active',true,
    'Find and preserve the base.','Keep the base visible.','The base carries meaning.','','','[]','[]','[]','','',
    'internal_reviewed_seed','BW-2A-2 proof','internal','rollback-only','high','signed_off','BW-2A-2 proof',timezone('utc',now()));

  select jsonb_build_object('schemaVersion',1,'authorityKey',v_tag||'-family','microSkillKey',v_skill,'importBatchId',v_batch,
    'approvalRefs',jsonb_build_array('review:bw2a2'), 'families', jsonb_agg(jsonb_build_object(
      'familyId',family.id,'baseFamilyKey',family.base_family_key,'baseWordId',family.base_word_id,'baseMeaning',family.base_meaning,'etymologyRoute',family.etymology_route,
      'members',(select jsonb_agg(jsonb_build_object('memberId',member.id,'canonicalWordId',member.canonical_word_id,'memberRole',member.member_role,
        'assignmentEligible',member.assignment_eligible,'complexityLevel',null,'wordSum',member.word_sum,'morphologyParts',member.morphology_parts,
        'morphologyJoins',member.morphology_joins,'morphologyTransformations',member.morphology_transformations,
        'transformationNotes',coalesce(member.transformation_notes,''),'childFriendlyMeaning',member.child_friendly_meaning)
        order by member.canonical_word_id::text,member.id::text)
        from public.canonical_teaching_dictionary_base_word_family_members member
        where member.base_word_family_id=family.id and member.import_batch_id=family.import_batch_id and member.row_status='active' and member.review_status='approved_for_first_exposure')
    ) order by family.base_family_key,family.id::text)) into v_family_manifest
  from public.canonical_teaching_dictionary_base_word_families family
  where family.import_batch_id=v_batch and family.micro_skill_key=v_skill and family.row_status='active' and family.review_status='approved_for_first_exposure';
  v_family_authority := public.publish_adle_base_word_family_membership_authority_v1(v_family_manifest,repeat('d',64),'release_ledger','BW-2A-2 proof');

  select jsonb_build_object('schemaVersion',1,'authorityKey',v_tag||'-content','microSkillKey',v_skill,'approvalRefs',jsonb_build_array('review:bw2a2'),
    'content',jsonb_build_object('contentVersionId',id,'contentVersion',content_version,'teachingObjective',teaching_objective,
      'childFriendlyExplanation',child_friendly_explanation,'ruleExplanation',rule_explanation,'memoryTip',coalesce(memory_tip,''),
      'commonMisconceptions',coalesce(common_misconceptions,''),'firstExposureProgression',first_exposure_progression,
      'guidedPracticeProgression',guided_practice_progression,'reviewProofreadingProgression',review_proofreading_progression,
      'exampleSelectionGuidance',coalesce(example_selection_guidance,''),'contrastPolicyGuidance',coalesce(contrast_policy_guidance,'')))
  into v_content_manifest from public.canonical_teaching_dictionary_content_versions where id=v_content;
  v_content_authority := public.publish_adle_base_word_teaching_content_authority_v1(v_content_manifest,repeat('e',64),'release_ledger','BW-2A-2 proof');

  select jsonb_build_object('schemaVersion',1,'authorityKey',v_tag||'-closure-1','approvalRefs',jsonb_build_array('review:bw2a2'),
    'capabilities',jsonb_build_array('canonical_word_identity_display','canonical_dictation'),
    'words',jsonb_agg(jsonb_build_object('wordKey',word.word_key,'normalisedWord',word.normalised_word,'displayWord',word.display_word,
      'dialectCode',word.dialect_code,'dictationSentence',sentence.dictation_sentence,'dictationTargetTokenIndex',sentence.dictation_target_token_index,
      'audioText',sentence.audio_text) order by word.word_key)) into v_closure_manifest
  from public.canonical_teaching_dictionary_words word join public.canonical_teaching_dictionary_dictation_sentences sentence on sentence.canonical_word_id=word.id
  where word.id=any(v_words);
  v_closure_one := public.publish_adle_teaching_dictionary_closure_v1(v_closure_manifest,repeat('f',64),
    (select jsonb_agg(jsonb_build_object('wordKey',word.word_key,'canonicalWordId',word.id,'dictationSentenceId',sentence.id) order by word.word_key)
     from public.canonical_teaching_dictionary_words word join public.canonical_teaching_dictionary_dictation_sentences sentence on sentence.canonical_word_id=word.id where word.id=any(v_words)),
    'release_ledger','BW-2A-2 proof');
  select semantic_fingerprint into v_closure_fp from public.adle_curriculum_dependency_authorities where id=v_closure_one;
  v_release_manifest := jsonb_build_object('schemaVersion',2,'releaseKey',v_tag||'-release-1','route',jsonb_build_object(
    'routeId','base_word_lab','routeVersion','v2','activationRouteKey','base_word_family_v1','payloadVersion',1),
    'approvalRefs',jsonb_build_array('review:bw2a2'),'microSkills',jsonb_build_array(jsonb_build_object('microSkillKey',v_skill,'dependencies',jsonb_build_array(
      jsonb_build_object('authorityType','family_membership','authorityKey',v_tag||'-family','authoritySchemaVersion',1,'semanticFingerprint',(select semantic_fingerprint from public.adle_curriculum_dependency_authorities where id=v_family_authority)),
      jsonb_build_object('authorityType','teaching_content','authorityKey',v_tag||'-content','authoritySchemaVersion',1,'semanticFingerprint',(select semantic_fingerprint from public.adle_curriculum_dependency_authorities where id=v_content_authority)),
      jsonb_build_object('authorityType','teaching_dictionary_closure','authorityKey',v_tag||'-closure-1','authoritySchemaVersion',1,'semanticFingerprint',v_closure_fp)))));
  v_release_one := public.publish_adle_curriculum_release_v2(v_release_manifest,repeat('1',64),'BW-2A-2 proof');
  select release_manifest_sha256,dependency_fingerprint into v_release_sha,v_dependency_fp from public.adle_curriculum_release_manifests where id=v_release_one;
  v_revision_one := public.set_adle_route_activation_revision_v2(v_release_sha,v_skill,'local','enabled','allow_existing','{"proof":true}',null,'BW-2A-2 proof','enable release one');

  for v_i in 1..2 loop
    insert into public.parent_verifications(child_id,parent_user_id,domain_module,source_type,source_entity_id,task_submission_id,suggested_micro_skill_key,decision,verified_micro_skill_key,metadata)
    values(v_child,v_parent,'spelling','bw2a2-proof',v_tag||'-verification-'||v_i,v_submission,v_skill,'accepted',v_skill,jsonb_build_object('proofTag',v_tag)) returning id into v_verification;
    insert into public.parent_verified_spelling_candidate_mappings(parent_user_id,child_id,parent_verification_id,task_submission_id,source_provenance,
      reviewed_event_source_entity_id,original_child_spelling,original_correct_spelling,misspelling_normalized,correct_spelling_normalized,micro_skill_key,
      candidate_status,promotion_scope,metadata)
    values(v_parent,v_child,v_verification,v_submission,'lesson_submission_parent_added_missed_word',v_tag||'-candidate-'||v_i,
      'miss'||v_i,v_names[case when v_i=1 then 2 else 6 end],'miss'||v_i,v_names[case when v_i=1 then 2 else 6 end],v_skill,
      'parent_local_promoted','parent_local',jsonb_build_object('proofTag',v_tag)) returning id into v_source;
    insert into public.spelling_canonical_mappings(misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status,
      created_by_admin_user_id,decision_note,source_candidate_mapping_id,metadata)
    values('miss'||v_i,v_names[case when v_i=1 then 2 else 6 end],v_skill,'active','visible',v_parent,'BW-2A-2 proof',v_source,jsonb_build_object('proofTag',v_tag)) returning id into v_mapping;
    perform public.adle_seed_canonical_intake_candidate(v_source,v_names[case when v_i=1 then 2 else 6 end],'base_word_lab','v2',v_skill,v_tag||'-seed-'||v_i);
    select learning_item_id,inserted into v_item,v_inserted from public.adle_persist_canonical_intake(v_child,v_words[case when v_i=1 then 2 else 6 end],v_skill,
      v_source,v_mapping,'miss'||v_i,v_names[case when v_i=1 then 2 else 6 end],'verified:'||v_source,current_date,'base_word_lab','v2',
      v_revision_one,v_release_one,v_release_sha,v_dependency_fp);
    if not v_inserted then raise exception 'first intake did not create learning item'; end if;
    select learning_item_id into v_replay_item from public.adle_persist_canonical_intake(v_child,v_words[case when v_i=1 then 2 else 6 end],v_skill,
      v_source,v_mapping,'miss'||v_i,v_names[case when v_i=1 then 2 else 6 end],'verified:'||v_source,current_date,'base_word_lab','v2',
      v_revision_one,v_release_one,v_release_sha,v_dependency_fp);
    if v_replay_item<>v_item then raise exception 'intake replay changed learning item'; end if;
    v_items := array_append(v_items,v_item);
  end loop;
  if (select count(*) from public.parent_verifications where metadata->>'proofTag'=v_tag)<>2 then raise exception 'parent approval replay drift'; end if;
  if (select count(*) from public.adle_learning_items where id=any(v_items) and item_status='pending' and source_kind='verified_misspelling' and row_status='active')<>2 then
    raise exception 'canonical intake learning-item semantics drift';
  end if;
  if (select count(*) from public.adle_learning_item_sources where learning_item_id=any(v_items) and row_status='active')<>2 then
    raise exception 'canonical intake immutable source lineage drift';
  end if;
  if exists(select 1 from public.adle_canonical_intake_candidates where child_id=v_child and (route_id<>'base_word_lab' or route_version<>'v2' or route_activation_revision_id<>v_revision_one or curriculum_release_manifest_id<>v_release_one)) then
    raise exception 'intake route/release provenance drift'; end if;
  v_rejected:=false;
  begin
    perform * from public.adle_persist_canonical_intake(v_child,v_words[1],v_skill,v_source,v_mapping,'miss2',v_names[6],'verified:'||v_source,current_date,
      'base_word_lab','v2',v_revision_one,v_release_one,v_release_sha,v_dependency_fp);
  exception when others then v_rejected:=true; end;
  if not v_rejected then raise exception 'base-role member was accepted as authentic'; end if;

  v_payload := jsonb_build_object('experience','D4_MOR_BASE_WORD_FAMILY','schemaVersion',1,'microSkillKey',v_skill,'contentVersion','bw2a2-content-v1',
    'familySections',jsonb_build_array(jsonb_build_object('baseFamilyKey','PROOF_PLAY'),jsonb_build_object('baseFamilyKey','PROOF_GOVERN')),
    'authenticTargets',jsonb_build_array(jsonb_build_object('canonicalWordId',v_words[2]),jsonb_build_object('canonicalWordId',v_words[6])),
    'independentSlots',jsonb_build_array(
      jsonb_build_object('canonicalWordId',v_words[2],'baseFamilyKey','PROOF_PLAY','provenance','authentic_target','learningItemId',v_items[1]),
      jsonb_build_object('canonicalWordId',v_words[6],'baseFamilyKey','PROOF_GOVERN','provenance','authentic_target','learningItemId',v_items[2]),
      jsonb_build_object('canonicalWordId',v_words[3],'baseFamilyKey','PROOF_PLAY','provenance','transfer','learningItemId',null),
      jsonb_build_object('canonicalWordId',v_words[7],'baseFamilyKey','PROOF_GOVERN','provenance','transfer','learningItemId',null),
      jsonb_build_object('canonicalWordId',v_words[4],'baseFamilyKey','PROOF_PLAY','provenance','transfer','learningItemId',null),
      jsonb_build_object('canonicalWordId',v_words[8],'baseFamilyKey','PROOF_GOVERN','provenance','transfer','learningItemId',null)),
    'independentWords',(select jsonb_agg(jsonb_build_object('canonicalWordId',word.canonical_word_id,'displayWord',word.display_word,
      'dictationSentence',word.dictation_sentence,'dictationTargetTokenIndex',word.dictation_target_token_index,'audioText',word.audio_text)
      order by array_position(array[v_words[2],v_words[6],v_words[3],v_words[7],v_words[4],v_words[8]],word.canonical_word_id))
      from public.adle_teaching_dictionary_closure_words word where word.authority_id=v_closure_one and word.canonical_word_id=any(array[v_words[2],v_words[6],v_words[3],v_words[7],v_words[4],v_words[8]])));
  v_metadata := jsonb_build_object('metadataSchemaVersion',2,'route',jsonb_build_object('routeId','base_word_lab','routeVersion','v2'),
    'recipe',jsonb_build_object('recipeKey','base_word_family','recipeVersion','v1'),'payload',jsonb_build_object('kind','base_word_family_snapshot_v1','version',1),
    'curriculumRelease',jsonb_build_object('activationRevisionId',v_revision_one,'releaseManifestId',v_release_one,'releaseKey',v_tag||'-release-1',
      'releaseManifestSha256',v_release_sha,'dependencyFingerprint',v_dependency_fp));
  v_binding_items := (select jsonb_agg(jsonb_build_object('childId',v_child,'parentUserId',v_parent,'position',n,'domainModule','spelling','itemType','lesson',
      'sourceType','adle_base_word_family_pilot','sourceEntityId',v_tag||'-one-'||n,'templateKey','CONTROLLED_SPELLING','targetWord',null,
      'promptData','{}'::jsonb,'metadata',jsonb_build_object('planDate',(current_date+10)::text,'microSkillKey',v_skill)) order by n) from generate_series(1,18)n);
  v_assignment_one := public.persist_adle_base_word_family_pilot_v2(v_parent,v_child,current_date+10,v_payload,v_binding_items,
    v_metadata,v_revision_one,v_release_one,v_release_sha,v_dependency_fp);
  select lesson_route_metadata,prompt_data->'baseWordFamilyLesson' into v_old_metadata,v_old_payload from public.daily_assignments assignment
  left join public.assignment_items item on item.daily_assignment_id=assignment.id and item.position=1 where assignment.id=v_assignment_one;
  v_replay_assignment := public.persist_adle_base_word_family_pilot_v2(v_parent,v_child,current_date+10,v_payload,v_binding_items,v_metadata,v_revision_one,v_release_one,v_release_sha,v_dependency_fp);
  if v_replay_assignment<>v_assignment_one or (select count(*) from public.assignment_items where daily_assignment_id=v_assignment_one)<>18 then raise exception 'assignment replay/binding drift'; end if;

  update public.canonical_teaching_dictionary_words set display_word=display_word||'-new' where id=any(v_words);
  update public.canonical_teaching_dictionary_dictation_sentences set dictation_sentence=dictation_sentence||' New.',audio_text=audio_text||' New.' where canonical_word_id=any(v_words);
  if exists(select 1 from public.adle_teaching_dictionary_closure_words where authority_id=v_closure_one and display_word like '%-new') then raise exception 'old closure followed mutable source'; end if;
  select jsonb_build_object('schemaVersion',1,'authorityKey',v_tag||'-closure-2','approvalRefs',jsonb_build_array('review:bw2a2'),
    'capabilities',jsonb_build_array('canonical_word_identity_display','canonical_dictation'),'words',jsonb_agg(jsonb_build_object(
      'wordKey',word.word_key,'normalisedWord',word.normalised_word,'displayWord',word.display_word,'dialectCode',word.dialect_code,
      'dictationSentence',sentence.dictation_sentence,'dictationTargetTokenIndex',sentence.dictation_target_token_index,'audioText',sentence.audio_text) order by word.word_key)) into v_closure_manifest
  from public.canonical_teaching_dictionary_words word join public.canonical_teaching_dictionary_dictation_sentences sentence on sentence.canonical_word_id=word.id where word.id=any(v_words);
  v_closure_two:=public.publish_adle_teaching_dictionary_closure_v1(v_closure_manifest,repeat('2',64),
    (select jsonb_agg(jsonb_build_object('wordKey',word.word_key,'canonicalWordId',word.id,'dictationSentenceId',sentence.id) order by word.word_key)
     from public.canonical_teaching_dictionary_words word join public.canonical_teaching_dictionary_dictation_sentences sentence on sentence.canonical_word_id=word.id where word.id=any(v_words)),
    'release_ledger','BW-2A-2 proof');
  select semantic_fingerprint into v_closure_fp from public.adle_curriculum_dependency_authorities where id=v_closure_two;
  v_release_manifest:=jsonb_set(jsonb_set(v_release_manifest,'{releaseKey}',to_jsonb(v_tag||'-release-2')),
    '{microSkills,0,dependencies,2}',jsonb_build_object('authorityType','teaching_dictionary_closure','authorityKey',v_tag||'-closure-2','authoritySchemaVersion',1,'semanticFingerprint',v_closure_fp));
  v_release_two:=public.publish_adle_curriculum_release_v2(v_release_manifest,repeat('3',64),'BW-2A-2 proof');
  select release_manifest_sha256,dependency_fingerprint into v_release_sha,v_dependency_fp from public.adle_curriculum_release_manifests where id=v_release_two;
  v_revision_two:=public.set_adle_route_activation_revision_v2(v_release_sha,v_skill,'local','enabled','allow_existing','{"proof":true}',v_revision_one,'BW-2A-2 proof','switch closure');
  v_payload:=jsonb_set(v_payload,'{independentWords}',(select jsonb_agg(jsonb_build_object('canonicalWordId',word.canonical_word_id,'displayWord',word.display_word,
    'dictationSentence',word.dictation_sentence,'dictationTargetTokenIndex',word.dictation_target_token_index,'audioText',word.audio_text)
    order by array_position(array[v_words[2],v_words[6],v_words[3],v_words[7],v_words[4],v_words[8]],word.canonical_word_id))
    from public.adle_teaching_dictionary_closure_words word where word.authority_id=v_closure_two and word.canonical_word_id=any(array[v_words[2],v_words[6],v_words[3],v_words[7],v_words[4],v_words[8]])));
  v_metadata:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_metadata,'{curriculumRelease,activationRevisionId}',to_jsonb(v_revision_two)),
    '{curriculumRelease,releaseManifestId}',to_jsonb(v_release_two)),'{curriculumRelease,releaseKey}',to_jsonb(v_tag||'-release-2')),
    '{curriculumRelease,releaseManifestSha256}',to_jsonb(v_release_sha));
  v_metadata:=jsonb_set(v_metadata,'{curriculumRelease,dependencyFingerprint}',to_jsonb(v_dependency_fp));
  v_assignment_two:=public.persist_adle_base_word_family_pilot_v2(v_parent,v_child,current_date+11,v_payload,
    (select jsonb_agg(jsonb_build_object('childId',v_child,'parentUserId',v_parent,'position',n,'domainModule','spelling','itemType','lesson',
      'sourceType','adle_base_word_family_pilot','sourceEntityId',v_tag||'-two-'||n,'templateKey','CONTROLLED_SPELLING','targetWord',null,
      'promptData','{}'::jsonb,'metadata',jsonb_build_object('planDate',(current_date+11)::text,'microSkillKey',v_skill)) order by n) from generate_series(1,18)n),
    v_metadata,v_revision_two,v_release_two,v_release_sha,v_dependency_fp);
  if (select lesson_route_metadata from public.daily_assignments where id=v_assignment_one)<>v_old_metadata then raise exception 'old assignment provenance changed'; end if;
  v_pause:=public.set_adle_route_activation_revision_v2(v_release_sha,v_skill,'local','paused','allow_existing','{"proof":true}',v_revision_two,'BW-2A-2 proof','pause');
  if (select release_manifest_id from public.adle_route_activation_revisions where id=v_pause)<>v_release_two then raise exception 'pause changed release'; end if;
  v_reenabled:=public.set_adle_route_activation_revision_v2(v_release_sha,v_skill,'local','enabled','allow_existing','{"proof":true}',v_pause,'BW-2A-2 proof','re-enable');
  v_revoked:=public.set_adle_route_activation_revision_v2(v_release_sha,v_skill,'local','safety_revoked','block_incomplete','{"proof":true}',v_reenabled,'BW-2A-2 proof','revoke');
  if public.adle_incomplete_assignment_runtime_policy_v2(v_revision_two)<>'block_incomplete' then raise exception 'safety revocation did not block incomplete assignment'; end if;
  if public.adle_route_activation_revision_is_current_v2(v_revision_two,v_release_two,v_release_sha,v_dependency_fp) then raise exception 'stale activation revision remained current'; end if;
  insert into bw2a2_receipt values(jsonb_build_object('route','base_word_lab:v2','releaseCount',2,'activationLifecycle',jsonb_build_array('enabled','paused','enabled','safety_revoked'),
    'learningItemsFromRealRpc',cardinality(v_items),'intakeReplay',true,'parentApprovalCount',2,'baseRoleRejected',true,'twoFamilies',2,'authenticTargets',2,
    'transfers',4,'independentWords',6,'bindingsPerAssignment',18,'assignments',2,'metadataSchemaVersion',2,'assignmentReplayPreserved',true,
    'oldClosureFrozen',true,'newClosureUsed',true,'oldAssignmentUnchanged',true,'safetyPolicy','block_incomplete'));
end;
$proof$;

select 'BW2A2_RECEIPT:' || receipt::text from bw2a2_receipt;
rollback;
