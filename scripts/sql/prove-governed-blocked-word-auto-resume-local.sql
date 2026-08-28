\set ON_ERROR_STOP on

begin;

set local session_replication_role = replica;

insert into auth.users(id,email,role,aud,created_at,updated_at) values
  ('f1000000-0000-4000-8000-000000000001','auto-resume-parent@example.invalid','authenticated','authenticated',now(),now()),
  ('f1000000-0000-4000-8000-000000000002','auto-resume-admin@example.invalid','authenticated','authenticated',now(),now());

insert into public.children(id,parent_user_id,first_name) values
  ('f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','Auto Resume Fixture');

insert into public.micro_skill_catalog(
  id,mastery_domain_key,skill_family_key,skill_cluster_key,micro_skill_key,
  display_name,practice_route,is_assignable,is_active
) values (
  'f1000000-0000-4000-8000-000000000004','D4','D4_PG','D4_PG_TEST',
  'D4_PG_TEST_AUTO_RESUME','Auto Resume Test','grouped_set_practice',true,true
);

insert into public.task_submissions(
  id,task_id,course_id,child_id,parent_user_id,submission_text,
  parent_review_status,parent_reviewed_at
) values
  ('f1000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000006','f1000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','original','approved',now()),
  ('f1000000-0000-4000-8000-000000000008','f1000000-0000-4000-8000-000000000006','f1000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','correction','approved',now());

insert into public.writing_samples(
  id,child_id,parent_user_id,title,sample_text,task_submission_id
) values (
  'f1000000-0000-4000-8000-000000000009',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000001',
  'Auto resume','chikcen','f1000000-0000-4000-8000-000000000005'
);

insert into public.misspelling_instances(
  id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word,
  position_start,position_end
) values (
  'f1000000-0000-4000-8000-000000000010',
  'f1000000-0000-4000-8000-000000000009',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000001',
  'chikcen','chicken',0,7
);

insert into public.writing_issues(
  id,child_id,parent_user_id,task_submission_id,writing_sample_id,
  source_misspelling_instance_id,issue_status,final_classification,
  observed_text,suggested_replacement,approved_replacement,micro_skill_key,
  final_classified_at,metadata
) values (
  'f1000000-0000-4000-8000-000000000011',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000005',
  'f1000000-0000-4000-8000-000000000009',
  'f1000000-0000-4000-8000-000000000010',
  'finalised','concept_gap','chikcen','chicken','chicken',
  'D4_PG_TEST_AUTO_RESUME',now(),
  jsonb_build_object(
    'returned_correction_stage_f_replay',jsonb_build_object(
      'action','attached_verified_route',
      'route_source','admin_decision',
      'dry_run_first',true,
      'replayed_at',now(),
      'admin_case_id','f1000000-0000-4000-8000-000000000012',
      'admin_decision_id','f1000000-0000-4000-8000-000000000013',
      'canonical_mapping_id',null
    )
  )
);

insert into public.writing_issue_correction_attempts(
  id,writing_issue_id,child_id,parent_user_id,task_submission_id,
  attempted_correction,reflection,created_at
) values (
  'f1000000-0000-4000-8000-000000000014',
  'f1000000-0000-4000-8000-000000000011',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000008','chicken','medium',now()
);

insert into public.spelling_catalog_review_cases(
  id,parent_user_id,child_id,task_submission_id,writing_sample_id,
  source_misspelling_instance_id,source_provenance,
  reviewed_event_source_entity_id,original_child_spelling,
  original_correct_spelling,misspelling_normalized,
  correct_spelling_normalized,case_status
) values (
  'f1000000-0000-4000-8000-000000000012',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000005',
  'f1000000-0000-4000-8000-000000000009',
  'f1000000-0000-4000-8000-000000000010',
  'lesson_submission_existing_output','auto-resume-fixture',
  'chikcen','chicken','chikcen','chicken','linked_existing_skill'
);

insert into public.spelling_catalog_review_case_decisions(
  id,case_id,admin_user_id,admin_email,decision_type,previous_status,
  new_status,linked_micro_skill_key,canonical_mapping_id,metadata
) values (
  'f1000000-0000-4000-8000-000000000013',
  'f1000000-0000-4000-8000-000000000012',
  'f1000000-0000-4000-8000-000000000002','auto-resume-admin@example.invalid',
  'linked_existing_skill','open','linked_existing_skill',
  'D4_PG_TEST_AUTO_RESUME',null,'{}'::jsonb
);

set local session_replication_role = origin;

create temp table auto_resume_history_before on commit drop as
select md5(jsonb_build_object(
  'issue',(select to_jsonb(issue) from public.writing_issues issue where id='f1000000-0000-4000-8000-000000000011'),
  'occurrence',(select to_jsonb(occurrence) from public.misspelling_instances occurrence where id='f1000000-0000-4000-8000-000000000010'),
  'case',(select to_jsonb(review_case) from public.spelling_catalog_review_cases review_case where id='f1000000-0000-4000-8000-000000000012'),
  'decision',(select to_jsonb(decision) from public.spelling_catalog_review_case_decisions decision where id='f1000000-0000-4000-8000-000000000013')
)::text) as digest;

create temp table auto_resume_materialized on commit drop as
select public.materialize_resolved_stage_f_spelling_occurrence_source(
  'f1000000-0000-4000-8000-000000000010',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000003'
) as receipt;

do $$
declare v_first uuid; v_second uuid;
begin
  v_first := (select (receipt->>'candidate_mapping_id')::uuid from auto_resume_materialized);
  v_second := (
    public.materialize_resolved_stage_f_spelling_occurrence_source(
      'f1000000-0000-4000-8000-000000000010',
      'f1000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000003'
    )->>'candidate_mapping_id'
  )::uuid;
  if v_first is distinct from v_second then
    raise exception 'controlled replay materialization was not idempotent';
  end if;
  if (select count(*) from public.parent_verified_spelling_candidate_mappings where source_misspelling_instance_id='f1000000-0000-4000-8000-000000000010') <> 1 then
    raise exception 'controlled replay created duplicate governed sources';
  end if;
end;
$$;

create temp table auto_resume_authorized on commit drop as
select public.adle_authorize_governed_source_continuation(
  (select (receipt->>'candidate_mapping_id')::uuid from auto_resume_materialized),
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000003'
) as receipt;

do $$
declare v_source uuid; v_replay jsonb;
begin
  v_source := (select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized);
  v_replay := public.adle_authorize_governed_source_continuation(
    v_source,
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000003'
  );
  if (select (receipt->>'transitioned_count')::integer from auto_resume_authorized) <> 1
    or (v_replay->>'transitioned_count')::integer <> 0
  then
    raise exception 'exact source handoff was not idempotent';
  end if;
  perform public.adle_seed_canonical_intake_candidate(
    v_source,'chicken','adle_word_level','v1','D4_PG_TEST_AUTO_RESUME',
    concat('governed_occurrence_source:',v_source::text)
  );
  perform public.adle_seed_canonical_intake_candidate(
    v_source,'chicken','adle_word_level','v1','D4_PG_TEST_AUTO_RESUME',
    concat('governed_occurrence_source:',v_source::text)
  );
  if (select count(*) from public.adle_canonical_intake_candidates where source_candidate_mapping_id=v_source) <> 1 then
    raise exception 'same source created duplicate canonical-intake candidates';
  end if;
end;
$$;

-- A pre-R8B parent-verified occurrence source may be complete even when no
-- writing_issues row was retained. Its exact occurrence + verification receipt
-- is sufficient; the caller still supplies only the source ID.
insert into public.misspelling_instances(
  id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word
) values (
  'f1000000-0000-4000-8000-000000000020',
  'f1000000-0000-4000-8000-000000000009',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000001','ingreadient','ingredient'
);
insert into public.parent_verifications(
  id,child_id,parent_user_id,domain_module,source_type,source_entity_id,
  task_submission_id,writing_sample_id,suggested_micro_skill_key,
  suggestion_payload,decision,verified_micro_skill_key,verified_at
) values (
  'f1000000-0000-4000-8000-000000000021',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000001','spelling','authentic_writing',
  'legacy-source-only::ingredient','f1000000-0000-4000-8000-000000000005',
  'f1000000-0000-4000-8000-000000000009','D4_PG_TEST_AUTO_RESUME',
  jsonb_build_object(
    'observed_text','ingreadient',
    'suggested_replacement','ingredient',
    'source_misspelling_instance_id','f1000000-0000-4000-8000-000000000020'
  ),'accepted',null,now()
);
insert into public.parent_verified_spelling_candidate_mappings(
  id,parent_user_id,child_id,parent_verification_id,task_submission_id,
  writing_sample_id,source_misspelling_instance_id,source_provenance,
  reviewed_event_source_entity_id,original_child_spelling,
  original_correct_spelling,misspelling_normalized,
  correct_spelling_normalized,micro_skill_key,candidate_status,promotion_scope,
  canonical_intake_handoff_state
) values (
  'f1000000-0000-4000-8000-000000000022',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000021',
  'f1000000-0000-4000-8000-000000000008',
  'f1000000-0000-4000-8000-000000000009',
  'f1000000-0000-4000-8000-000000000020',
  'lesson_submission_existing_output','legacy-source-only::ingredient',
  'ingreadient','ingredient','ingreadient','ingredient',
  'D4_PG_TEST_AUTO_RESUME','parent_local_promoted','parent_local',null
);
do $$
declare v_receipt jsonb;
begin
  v_receipt := public.adle_authorize_governed_source_continuation(
    'f1000000-0000-4000-8000-000000000022',
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000003'
  );
  if (v_receipt->>'transitioned_count')::integer <> 0
    or v_receipt->>'handoff_state' is not null
  then raise exception 'legacy NULL handoff source was not preserved'; end if;
  perform public.adle_seed_canonical_intake_candidate(
    'f1000000-0000-4000-8000-000000000022','ingredient',
    'adle_word_level','v1','D4_PG_TEST_AUTO_RESUME',
    'governed_occurrence_source:f1000000-0000-4000-8000-000000000022'
  );
  if not exists(
    select 1 from public.adle_canonical_intake_candidates
    where source_candidate_mapping_id='f1000000-0000-4000-8000-000000000022'
  ) then raise exception 'legacy source-only candidate was not created'; end if;
end;
$$;

do $$
declare v_failed boolean := false;
begin
  begin
    perform public.adle_authorize_governed_source_continuation(
      (select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized),
      'f1000000-0000-4000-8000-000000000002',
      'f1000000-0000-4000-8000-000000000003'
    );
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'wrong parent did not fail closed'; end if;
end;
$$;

do $$
declare
  v_failed boolean := false;
  v_sources_before integer;
  v_candidates_before integer;
begin
  select count(*) into v_sources_before
  from public.parent_verified_spelling_candidate_mappings;
  select count(*) into v_candidates_before
  from public.adle_canonical_intake_candidates;
  begin
    perform public.materialize_resolved_stage_f_spelling_occurrence_source(
      'f1000000-0000-4000-8000-000000000099',
      'f1000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000003'
    );
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'unknown occurrence did not fail closed'; end if;
  if (select count(*) from public.parent_verified_spelling_candidate_mappings) <> v_sources_before
    or (select count(*) from public.adle_canonical_intake_candidates) <> v_candidates_before
  then raise exception 'ineligible occurrence failure changed source/candidate state'; end if;
end;
$$;

-- A direct micro-skill edit has no continuation trigger. Only the controlled
-- replay function above can materialise a governed occurrence source.
set local session_replication_role = replica;
insert into public.misspelling_instances(
  id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word
) values (
  'f1000000-0000-4000-8000-000000000015',
  'f1000000-0000-4000-8000-000000000009',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000001','efect','effect'
);
insert into public.writing_issues(
  id,child_id,parent_user_id,task_submission_id,writing_sample_id,
  source_misspelling_instance_id,issue_status,final_classification,
  observed_text,suggested_replacement,approved_replacement,micro_skill_key,
  final_classified_at,metadata
) values (
  'f1000000-0000-4000-8000-000000000016',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000005',
  'f1000000-0000-4000-8000-000000000009',
  'f1000000-0000-4000-8000-000000000015','finalised','concept_gap',
  'efect','effect','effect','unknown',now(),'{}'::jsonb
);
set local session_replication_role = origin;
update public.writing_issues
set micro_skill_key='D4_PG_TEST_AUTO_RESUME',updated_at=now()
where id='f1000000-0000-4000-8000-000000000016';
do $$
begin
  if exists(select 1 from public.parent_verified_spelling_candidate_mappings where source_misspelling_instance_id='f1000000-0000-4000-8000-000000000015') then
    raise exception 'non-governed micro-skill update triggered continuation';
  end if;
end;
$$;

-- The generic profile and generic teaching-content release boundaries enqueue
-- the exact existing candidate, but never manufacture another candidate.
update public.adle_canonical_intake_reconciliation_queue
set job_status='completed',completed_at=now(),lease_owner=null,lease_expires_at=null
where candidate_id=(
  select id from public.adle_canonical_intake_candidates
  where source_candidate_mapping_id=(
    select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized
  )
);
update public.adle_canonical_intake_candidates
set target_identity_status='established',candidate_state='pending_content'
where source_candidate_mapping_id=(select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized);

insert into public.canonical_teaching_dictionary_transfer_selector_profiles(
  id,micro_skill_key,selector_kind,feature_type,feature_key,
  required_transfer_words,content_version,row_status,review_status,
  reviewed_by,reviewed_at
) values (
  'f1000000-0000-4000-8000-000000000017','D4_PG_TEST_AUTO_RESUME',
  'affix','root','test',1,'v1','active','approved_for_first_exposure',
  'auto-resume-proof',now()
);
do $$
begin
  if not exists(
    select 1 from public.adle_canonical_intake_reconciliation_queue
    where candidate_id=(
      select id from public.adle_canonical_intake_candidates
      where source_candidate_mapping_id=(
        select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized
      )
    )
      and job_status='pending' and trigger_type='generic_profile_release'
  ) then raise exception 'generic profile release did not enqueue exact existing candidate'; end if;
end;
$$;

update public.adle_canonical_intake_reconciliation_queue
set job_status='completed',completed_at=now(),lease_owner=null,lease_expires_at=null
where candidate_id=(
  select id from public.adle_canonical_intake_candidates
  where source_candidate_mapping_id=(
    select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized
  )
);

insert into public.canonical_teaching_dictionary_import_batches(
  id,source_folder_path,import_mode,batch_status
) values (
  'f1000000-0000-4000-8000-000000000018','auto-resume-proof',
  'local_dev_import','applied'
);

insert into public.canonical_teaching_dictionary_suffix_profiles(
  id,import_batch_id,micro_skill_key,suffix_label,suffix_text,suffix_meaning,
  meaning_bins,include_meaning_sort,suffix_choices,intro_content,
  reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,
  review_status,source_sheet,source_row_number,source_row_hash,source_category,
  source_use_note,confidence,reviewed_by,reviewed_at
) values (
  'f1000000-0000-4000-8000-000000000030',
  'f1000000-0000-4000-8000-000000000018','D4_PG_TEST_AUTO_RESUME',
  'test','test','test meaning','["test"]'::jsonb,false,'[]'::jsonb,
  '{"title":"test"}'::jsonb,'test-reflection','test reflection',true,
  'active','approved_for_first_exposure','suffix.csv',2,'suffix-proof-hash',
  'internal_authored','local proof','high','auto-resume-proof',now()
);
do $$
begin
  if not exists(
    select 1 from public.adle_canonical_intake_reconciliation_queue
    where candidate_id=(
      select id from public.adle_canonical_intake_candidates
      where source_candidate_mapping_id=(
        select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized
      )
    )
      and job_status='pending' and trigger_type='dynamic_suffix_profile_release'
  ) then raise exception 'Dynamic Suffix profile release did not enqueue the retained candidate'; end if;
end;
$$;

update public.adle_canonical_intake_reconciliation_queue
set job_status='completed',completed_at=now(),lease_owner=null,lease_expires_at=null
where candidate_id=(
  select id from public.adle_canonical_intake_candidates
  where source_candidate_mapping_id=(
    select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized
  )
);

insert into public.canonical_teaching_dictionary_content_versions(
  id,import_batch_id,source_sheet,source_row_number,source_row_hash,
  micro_skill_key,content_version,version_status,is_active,
  child_friendly_explanation,rule_explanation,source_category,
  source_use_note,confidence,final_readiness_review_status
) values (
  'f1000000-0000-4000-8000-000000000019',
  'f1000000-0000-4000-8000-000000000018','content.csv',2,'proof-hash',
  'D4_PG_TEST_AUTO_RESUME','v1','in_review',false,null,null,
  'internal_authored','local proof','high','not_started'
);
update public.canonical_teaching_dictionary_content_versions
set version_status='active',is_active=true,
    final_readiness_review_status='signed_off',
    child_friendly_explanation='A governed explanation.',
    rule_explanation='A governed rule.'
where id='f1000000-0000-4000-8000-000000000019';
do $$
begin
  if not exists(
    select 1 from public.adle_canonical_intake_reconciliation_queue
    where candidate_id=(
      select id from public.adle_canonical_intake_candidates
      where source_candidate_mapping_id=(
        select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized
      )
    )
      and job_status='pending' and trigger_type='teaching_content_release'
  ) then raise exception 'teaching-content release did not enqueue exact existing candidate'; end if;
  if (select count(*) from public.adle_canonical_intake_candidates) <> 2 then
    raise exception 'release hooks manufactured canonical-intake candidates';
  end if;
end;
$$;

update public.adle_canonical_intake_reconciliation_queue
set job_status='completed',completed_at=now(),lease_owner=null,lease_expires_at=null
where candidate_id=(
  select id from public.adle_canonical_intake_candidates
  where source_candidate_mapping_id=(
    select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized
  )
);

insert into public.adle_curriculum_dependency_authorities(
  id,authority_key,authority_type,schema_version,source_classification,
  manifest_file_sha256,authority_manifest,authority_manifest_sha256,
  semantic_projection,semantic_fingerprint,source_provenance,approval_refs,
  published_by
) values (
  'f1000000-0000-4000-8000-000000000031','auto-resume-proof:content',
  'teaching_content',1,'release_ledger',repeat('1',64),
  '{"proof":"auto-resume"}'::jsonb,
  public.adle_canonical_json_sha256_v1('{"proof":"auto-resume"}'::jsonb),
  '{"microSkillKey":"D4_PG_TEST_AUTO_RESUME"}'::jsonb,
  public.adle_canonical_json_sha256_v1('{"microSkillKey":"D4_PG_TEST_AUTO_RESUME"}'::jsonb),
  '{"proof":"auto-resume"}'::jsonb,'["auto-resume-proof"]'::jsonb,
  'auto-resume-proof'
);
insert into public.adle_curriculum_release_manifests(
  id,release_key,schema_version,manifest_file_sha256,manifest_payload,
  release_manifest_sha256,dependency_fingerprint,route_id,route_version,
  activation_route_key,payload_version,approval_refs,published_by
) values (
  'f1000000-0000-4000-8000-000000000032','auto-resume-proof:release',2,
  repeat('2',64),'{"proof":"auto-resume"}'::jsonb,
  public.adle_canonical_json_sha256_v1('{"proof":"auto-resume"}'::jsonb),
  repeat('3',64),'base_word_lab','v2','base_word_family_v1',1,
  '["auto-resume-proof"]'::jsonb,'auto-resume-proof'
);
insert into public.adle_curriculum_release_dependencies(
  release_manifest_id,micro_skill_key,authority_type,authority_key,
  authority_schema_version,semantic_fingerprint,authority_id
) values (
  'f1000000-0000-4000-8000-000000000032','D4_PG_TEST_AUTO_RESUME',
  'teaching_content','auto-resume-proof:content',1,
  public.adle_canonical_json_sha256_v1('{"microSkillKey":"D4_PG_TEST_AUTO_RESUME"}'::jsonb),
  'f1000000-0000-4000-8000-000000000031'
);
do $$
begin
  if not exists(
    select 1 from public.adle_canonical_intake_reconciliation_queue
    where candidate_id=(
      select id from public.adle_canonical_intake_candidates
      where source_candidate_mapping_id=(
        select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized
      )
    )
      and job_status='pending' and trigger_type='curriculum_release_dependency'
  ) then raise exception 'curriculum release dependency did not enqueue the retained candidate'; end if;
end;
$$;

update public.adle_canonical_intake_reconciliation_queue
set job_status='completed',completed_at=now(),lease_owner=null,lease_expires_at=null
where candidate_id=(
  select id from public.adle_canonical_intake_candidates
  where source_candidate_mapping_id=(
    select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized
  )
);

insert into public.adle_route_activation_revisions(
  id,environment_key,release_manifest_id,release_manifest_sha256,
  dependency_fingerprint,route_id,route_version,activation_route_key,
  micro_skill_key,activation_status,incomplete_assignment_policy,
  readiness_report,change_reason,changed_by
) values (
  'f1000000-0000-4000-8000-000000000033','local',
  'f1000000-0000-4000-8000-000000000032',
  public.adle_canonical_json_sha256_v1('{"proof":"auto-resume"}'::jsonb),
  repeat('3',64),'base_word_lab','v2','base_word_family_v1',
  'D4_PG_TEST_AUTO_RESUME','enabled','allow_existing','{}'::jsonb,
  'auto-resume proof','auto-resume-proof'
);
insert into public.adle_route_activation_heads(
  environment_key,route_id,route_version,micro_skill_key,current_revision_id
) values (
  'local','base_word_lab','v2','D4_PG_TEST_AUTO_RESUME',
  'f1000000-0000-4000-8000-000000000033'
);
do $$
begin
  if not exists(
    select 1 from public.adle_canonical_intake_reconciliation_queue
    where candidate_id=(
      select id from public.adle_canonical_intake_candidates
      where source_candidate_mapping_id=(
        select (receipt->>'candidate_mapping_id')::uuid from auto_resume_authorized
      )
    )
      and job_status='pending' and trigger_type='route_activation_release'
  ) then raise exception 'route activation release did not enqueue the retained candidate'; end if;
end;
$$;

do $$
declare v_after text;
begin
  select md5(jsonb_build_object(
    'issue',(select to_jsonb(issue) from public.writing_issues issue where id='f1000000-0000-4000-8000-000000000011'),
    'occurrence',(select to_jsonb(occurrence) from public.misspelling_instances occurrence where id='f1000000-0000-4000-8000-000000000010'),
    'case',(select to_jsonb(review_case) from public.spelling_catalog_review_cases review_case where id='f1000000-0000-4000-8000-000000000012'),
    'decision',(select to_jsonb(decision) from public.spelling_catalog_review_case_decisions decision where id='f1000000-0000-4000-8000-000000000013')
  )::text) into v_after;
  if v_after is distinct from (select digest from auto_resume_history_before) then
    raise exception 'controlled continuation rewrote historical/admin authority';
  end if;
  if (select count(*) from public.adle_learning_items) <> 0
    or (select count(*) from public.adle_learning_item_sources) <> 0
    or (select count(*) from public.adle_review_schedule_words) <> 0
    or (select count(*) from public.adle_review_schedule_word_routes) <> 0
  then raise exception 'candidate continuation created ADLE or Review state'; end if;
end;
$$;

select 'BLOCKED_WORD_AUTO_RESUME_SQL_RECEIPT:' || jsonb_build_object(
  'status','PASS',
  'governedSources',2,
  'canonicalIntakeCandidates',2,
  'handoffIdempotent',true,
  'directMicroSkillTrigger',false,
  'ineligibleOccurrenceFailClosed',true,
  'genericProfileReleaseEnqueued',true,
  'teachingContentReleaseEnqueued',true,
  'dynamicSuffixProfileReleaseEnqueued',true,
  'curriculumDependencyReleaseEnqueued',true,
  'routeActivationReleaseEnqueued',true,
  'historicalAuthorityChanged',false,
  'adleTargetsCreated',0,
  'reviewRowsCreated',0
)::text;

rollback;
