\set ON_ERROR_STOP on

begin;

create or replace function public.r8d_expect_error(
  p_sql text,
  p_message_fragment text
) returns void
language plpgsql
as $$
declare
  v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_message_fragment in sqlerrm) = 0 then
      raise exception 'Unexpected error. Expected %, received %',
        p_message_fragment, sqlerrm;
    end if;
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Expected statement to fail: %', p_sql;
  end if;
end;
$$;

create or replace function public.r8d_reconcile_nonlearning(
  p_issue uuid,
  p_source uuid,
  p_version bigint,
  p_key text
) returns jsonb
language sql
as $$
  select public.adle_reconcile_parent_spelling_decision_r8d(
    p_issue,
    p_source,
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    p_version,
    'not_an_issue',
    null,
    null,
    null,
    '10000000-0000-4000-8000-000000000010',
    'R8D deterministic downstream reversal proof',
    p_key
  );
$$;

create or replace function public.r8d_table_hash(p_table regclass)
returns text
language plpgsql
as $$
declare
  v_hash text;
begin
  execute format(
    'select md5(coalesce(string_agg(to_jsonb(row_value)::text, '''' order by row_value.id), '''')) from %s row_value',
    p_table
  ) into v_hash;
  return v_hash;
end;
$$;

grant execute on function public.r8d_expect_error(text,text)
  to authenticated, service_role;
grant select,update on public.writing_issues to authenticated, service_role;
grant select,update,delete on public.parent_verified_spelling_candidate_mappings
  to authenticated, service_role;

-- Add one untouched learner for the negative rollout boundary and nine
-- occurrence-complete sources for the downstream lifecycle matrix.
set local session_replication_role = replica;

insert into public.children(id,parent_user_id,first_name)
values (
  md5('r8d-unactivated-child')::uuid,
  '10000000-0000-4000-8000-000000000001',
  'R8D Unactivated Safety Fixture'
);

insert into public.task_submissions(
  id,task_id,course_id,child_id,parent_user_id,submission_text,
  parent_review_status,parent_reviewed_at
)
select
  md5('r8d-submission-original-' || fixture_key)::uuid,
  md5('r8d-task-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'R8D original ' || fixture_key,
  'approved',
  timezone('utc',now())
from (values
  ('intake'),('teaching'),('schedule'),('reviewed'),('concurrency'),
  ('reactivate'),('wordonly'),('skillonly'),('both'),
  ('intakeb'),('reviewedb')
) fixtures(fixture_key);

insert into public.task_submissions(
  id,task_id,course_id,child_id,parent_user_id,submission_text,
  parent_review_status,parent_reviewed_at
)
select
  md5('r8d-submission-approval-' || fixture_key)::uuid,
  md5('r8d-task-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'R8D returned correction ' || fixture_key,
  'approved',
  timezone('utc',now())
from (values
  ('intake'),('teaching'),('schedule'),('reviewed'),('concurrency'),
  ('reactivate'),('wordonly'),('skillonly'),('both'),
  ('intakeb'),('reviewedb')
) fixtures(fixture_key);

insert into public.writing_samples(
  id,child_id,parent_user_id,title,sample_text,task_submission_id
)
select
  md5('r8d-sample-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'R8D ' || fixture_key,
  misspelling,
  md5('r8d-submission-original-' || fixture_key)::uuid
from (values
  ('intake','intaek'),
  ('teaching','taecht'),
  ('schedule','scehduled'),
  ('reviewed','reveiwed'),
  ('concurrency','concurent'),
  ('reactivate','reactivte'),
  ('wordonly','wrodonly'),
  ('skillonly','skilonly'),
  ('both','bauth'),
  ('intakeb','intaekk'),
  ('reviewedb','revuewed')
) fixtures(fixture_key,misspelling);

insert into public.misspelling_instances(
  id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word
)
select
  md5('r8d-misspelling-' || fixture_key)::uuid,
  md5('r8d-sample-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  misspelling,
  old_correct
from (values
  ('intake','intaek','intake'),
  ('teaching','taecht','taught'),
  ('schedule','scehduled','scheduled'),
  ('reviewed','reveiwed','reviewed'),
  ('concurrency','concurent','concurrent'),
  ('reactivate','reactivte','reactivate'),
  ('wordonly','wrodonly','wordonly'),
  ('skillonly','skilonly','replay'),
  ('both','bauth','both'),
  ('intakeb','intaekk','intake'),
  ('reviewedb','revuewed','reviewed')
) fixtures(fixture_key,misspelling,old_correct);

insert into public.writing_issues(
  id,child_id,parent_user_id,task_submission_id,
  source_misspelling_instance_id,issue_status,final_classification,
  observed_text,suggested_replacement,approved_replacement,micro_skill_key,
  final_classified_at,metadata
)
select
  md5('r8d-issue-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  md5('r8d-submission-original-' || fixture_key)::uuid,
  md5('r8d-misspelling-' || fixture_key)::uuid,
  'finalised','concept_gap',misspelling,old_correct,old_correct,old_skill,
  timezone('utc',now()),'{}'::jsonb
from (values
  ('intake','intaek','intake','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('teaching','taecht','taught','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('schedule','scehduled','scheduled','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('reviewed','reveiwed','reviewed','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('concurrency','concurent','concurrent','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('reactivate','reactivte','reactivate','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('wordonly','wrodonly','wordonly','D4_MOR_PREFIXES_RE_PRE'),
  ('skillonly','skilonly','replay','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('both','bauth','both','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('intakeb','intaekk','intake','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('reviewedb','revuewed','reviewed','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS')
) fixtures(fixture_key,misspelling,old_correct,old_skill);

insert into public.writing_issue_correction_attempts(
  id,writing_issue_id,child_id,parent_user_id,task_submission_id,
  attempted_correction,reflection
)
select
  md5('r8d-attempt-' || fixture_key)::uuid,
  md5('r8d-issue-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  md5('r8d-submission-approval-' || fixture_key)::uuid,
  old_correct,'medium'
from (values
  ('intake','intake'),('teaching','taught'),('schedule','scheduled'),
  ('reviewed','reviewed'),('concurrency','concurrent'),
  ('reactivate','reactivate'),('wordonly','wordonly'),
  ('skillonly','replay'),('both','both'),
  ('intakeb','intake'),('reviewedb','reviewed')
) fixtures(fixture_key,old_correct);

insert into public.parent_verifications(
  id,child_id,parent_user_id,domain_module,source_type,source_entity_id,decision
)
select
  md5('r8d-verification-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'spelling','authentic_writing','r8d-' || fixture_key,'accepted'
from (values
  ('intake'),('teaching'),('schedule'),('reviewed'),('concurrency'),
  ('reactivate'),('wordonly'),('skillonly'),('both'),
  ('intakeb'),('reviewedb')
) fixtures(fixture_key);

insert into public.parent_verified_spelling_candidate_mappings(
  id,parent_user_id,child_id,parent_verification_id,task_submission_id,
  source_misspelling_instance_id,source_provenance,
  reviewed_event_source_entity_id,misspelling_normalized,
  correct_spelling_normalized,micro_skill_key,candidate_status,promotion_scope,
  canonical_intake_handoff_state,authority_version
)
select
  md5('r8d-source-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  md5('r8d-verification-' || fixture_key)::uuid,
  md5('r8d-submission-original-' || fixture_key)::uuid,
  md5('r8d-misspelling-' || fixture_key)::uuid,
  'lesson_submission_existing_output','r8d-' || fixture_key,
  misspelling,old_correct,old_skill,
  'parent_local_promoted','parent_local',
  case when fixture_key in (
      'intake','intakeb','reviewed','concurrency','wordonly'
    ) then null
    else 'r8c_exact_id_handed_off' end,1
from (values
  ('intake','intaek','intake','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('teaching','taecht','taught','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('schedule','scehduled','scheduled','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('reviewed','reveiwed','reviewed','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('concurrency','concurent','concurrent','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('reactivate','reactivte','reactivate','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('wordonly','wrodonly','wordonly','D4_MOR_PREFIXES_RE_PRE'),
  ('skillonly','skilonly','replay','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('both','bauth','both','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('intakeb','intaekk','intake','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'),
  ('reviewedb','revuewed','reviewed','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS')
) fixtures(fixture_key,misspelling,old_correct,old_skill);

insert into public.canonical_teaching_dictionary_words(
  id,import_batch_id,source_sheet,source_row_number,source_row_hash,
  word_key,normalised_word,display_word,source_category,confidence,review_status,
  row_status
)
select
  md5('r8d-word-' || fixture_key)::uuid,
  md5('r8d-word-import')::uuid,
  'r8d_fixture',row_number,
  md5('r8d-word-hash-' || fixture_key),
  canonical_word,canonical_word,canonical_word,
  'internal_reviewed_seed','high','approved_for_first_exposure','active'
from (values
  ('intake','intake',10),
  ('teaching','taught',11),
  ('schedule','scheduled',12),
  ('reviewed','reviewed',13),
  ('concurrency','concurrent',14)
) fixtures(fixture_key,canonical_word,row_number);

insert into public.adle_learning_items(
  id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,
  source_ref,source_attempt_text,intake_on,row_status
)
select
  md5('r8d-item-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  md5('r8d-word-' || fixture_key)::uuid,
  'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS',
  case when fixture_key = 'intake' then 'pending'
    else 'awaiting_review_outcome' end,
  'verified_misspelling','r8d:' || fixture_key,misspelling,current_date,'active'
from (values
  ('intake','intaek'),('teaching','taecht'),
  ('schedule','scehduled'),('reviewed','reveiwed'),
  ('concurrency','concurent')
) fixtures(fixture_key,misspelling);

insert into public.adle_learning_item_sources(
  id,learning_item_id,parent_verified_candidate_mapping_id,
  misspelling_normalized,correct_spelling_normalized,micro_skill_key,
  source_ref,row_status
)
select
  md5('r8d-lineage-' || fixture_key)::uuid,
  md5('r8d-item-' || case
    when fixture_key = 'intakeb' then 'intake'
    when fixture_key = 'reviewedb' then 'reviewed'
    else fixture_key end)::uuid,
  md5('r8d-source-' || fixture_key)::uuid,
  misspelling,correct_spelling,'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS',
  'r8d:' || fixture_key,'active'
from (values
  ('intake','intaek','intake'),
  ('teaching','taecht','taught'),
  ('schedule','scehduled','scheduled'),
  ('reviewed','reveiwed','reviewed'),
  ('concurrency','concurent','concurrent'),
  ('intakeb','intaekk','intake'),
  ('reviewedb','revuewed','reviewed')
) fixtures(fixture_key,misspelling,correct_spelling);

insert into public.adle_canonical_intake_candidates(
  id,source_candidate_mapping_id,source_submission_id,child_id,
  normalized_target_token,canonical_word_id,target_identity_status,
  route_id,route_version,micro_skill_key,candidate_state,blockers,
  readiness_fingerprint,learning_item_id,activated_at,last_evaluated_at
)
select
  md5('r8d-intake-' || fixture_key)::uuid,
  md5('r8d-source-' || fixture_key)::uuid,
  md5('r8d-submission-original-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  correct_spelling,md5('r8d-word-' || case
    when fixture_key = 'intakeb' then 'intake'
    when fixture_key = 'reviewedb' then 'reviewed'
    else fixture_key end)::uuid,'established',
  'compound_word_lab','v2','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS',
  'activated','[]'::jsonb,md5('r8d-ready-' || fixture_key),
  md5('r8d-item-' || case
    when fixture_key = 'intakeb' then 'intake'
    when fixture_key = 'reviewedb' then 'reviewed'
    else fixture_key end)::uuid,timezone('utc',now()),timezone('utc',now())
from (values
  ('intake','intake'),('teaching','taught'),
  ('schedule','scheduled'),('reviewed','reviewed'),
  ('concurrency','concurrent'),('intakeb','intake'),
  ('reviewedb','reviewed')
) fixtures(fixture_key,correct_spelling);

insert into public.adle_review_policy_versions(
  schedule_policy_version,is_active,interval_ladder_days,catch_up_offsets_days,
  session_cap,pre_retirement_check_gap_days,formula_reference,activated_at,
  completion_grace_minutes
) values (
  'r8d-proof-v1',true,array[1,3,7],array[1,2],10,7,
  'R8D disposable proof',timezone('utc',now()),60
);

insert into public.adle_review_bundles(
  id,child_id,source_ref,interval_index,next_due_on,
  schedule_policy_version,bundle_status,row_status
)
select
  md5('r8d-bundle-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  'r8d:' || fixture_key,0,current_date,'r8d-proof-v1','active','active'
from (values ('schedule'),('reviewed'),('concurrency')) fixtures(fixture_key);

insert into public.adle_review_schedule_words(
  id,child_id,canonical_word_id,bundle_id,membership_status,
  catch_up_stage,next_retest_due_on,reteach_cycle_count,taught_on,row_status,
  word_schedule_version,word_interval_index,word_next_due_on,
  word_schedule_policy_version
)
select
  md5('r8d-schedule-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  md5('r8d-word-' || fixture_key)::uuid,
  md5('r8d-bundle-' || fixture_key)::uuid,
  'scheduled',0,current_date,0,current_date - 1,'active',
  'adle_review_per_word_schedule_v1',0,current_date,'r8d-proof-v1'
from (values ('schedule'),('reviewed'),('concurrency')) fixtures(fixture_key);

insert into public.adle_review_schedule_word_routes(
  id,schedule_word_id,learning_item_id,micro_skill_key,
  attached_on,attachment_ordinal,row_status
)
select
  md5('r8d-schedule-route-' || fixture_key)::uuid,
  md5('r8d-schedule-' || fixture_key)::uuid,
  md5('r8d-item-' || fixture_key)::uuid,
  'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS',current_date,1,'active'
from (values ('schedule'),('reviewed'),('concurrency')) fixtures(fixture_key);

-- Teaching evidence for the teaching-only and protected-Review cases.
insert into public.daily_assignments(
  id,child_id,parent_user_id,assignment_date,title,status,
  assignment_generation_source
)
select
  md5('r8d-teaching-assignment-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  current_date - 2,'R8D teaching ' || fixture_key,'completed','adle_composer_v1'
from (values ('teaching'),('reviewed')) fixtures(fixture_key);

insert into public.assignment_items(
  id,daily_assignment_id,child_id,parent_user_id,domain_module,item_type,
  source_type,source_entity_id,learning_item_id,template_key,target_word,
  position,status,metadata
)
select
  md5('r8d-teaching-item-' || fixture_key)::uuid,
  md5('r8d-teaching-assignment-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'spelling','lesson','adle_learning_item','r8d:' || fixture_key,
  md5('r8d-item-' || fixture_key)::uuid,'r8d-teaching',correct_spelling,
  1,'completed','{}'::jsonb
from (values ('teaching','taught'),('reviewed','reviewed'))
  fixtures(fixture_key,correct_spelling);

insert into public.adle_assignment_attempt_events(
  id,child_id,parent_user_id,daily_assignment_id,assignment_item_id,
  canonical_word_id,micro_skill_key,section_key,template_key,target_word,
  attempt_text,is_correct,attempt_kind,evidence_class,source_ref
)
select
  md5('r8d-teaching-event-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  md5('r8d-teaching-assignment-' || fixture_key)::uuid,
  md5('r8d-teaching-item-' || fixture_key)::uuid,
  md5('r8d-word-' || fixture_key)::uuid,
  'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','lesson_production',
  'r8d-teaching',correct_spelling,correct_spelling,true,
  'lesson_production','first_exposure_lesson_attempt','r8d:' || fixture_key
from (values ('teaching','taught'),('reviewed','reviewed'))
  fixtures(fixture_key,correct_spelling);

insert into public.adle_assignment_attempt_event_routes(
  id,attempt_event_id,learning_item_id,micro_skill_key
)
select
  md5('r8d-teaching-event-route-' || fixture_key)::uuid,
  md5('r8d-teaching-event-' || fixture_key)::uuid,
  md5('r8d-item-' || fixture_key)::uuid,
  'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'
from (values ('teaching'),('reviewed')) fixtures(fixture_key);

insert into public.adle_taught_word_history(
  id,child_id,canonical_word_id,event_kind,occurred_on,source_ref,
  row_status,attempt_text
)
select
  md5('r8d-taught-history-' || fixture_key)::uuid,
  '10000000-0000-4000-8000-000000000002',
  md5('r8d-word-' || fixture_key)::uuid,
  'taught',current_date - 2,'r8d:' || fixture_key,'active',correct_spelling
from (values ('teaching','taught'),('reviewed','reviewed'))
  fixtures(fixture_key,correct_spelling);

-- One completed Review chain exercises every protected row family.
insert into public.daily_assignments(
  id,child_id,parent_user_id,assignment_date,title,status,
  assignment_generation_source,compiled_review_snapshot
) values (
  md5('r8d-review-assignment')::uuid,
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  current_date - 1,'R8D protected Review','completed','adle_review_r6',
  jsonb_build_object(
    'snapshotSchemaVersion','review_snapshot_v3',
    'compilerVersion','adle_review_snapshot_compiler_v3',
    'validatorVersion','adle_review_snapshot_validator_v3',
    'contractRegistryVersion','adle_review_contracts_v1',
    'assignment',jsonb_build_object(
      'generationSource','adle_review_writing_challenge_v3',
      'assignmentId',md5('r8d-review-assignment')::text,
      'reviewItemId',md5('r8d-review-assignment-item')::text
    ),
    'targets',jsonb_build_array(jsonb_build_object(
      'contractVersion','3','encounterId',md5('r8d-review-encounter')::text,
      'canonicalWordId',md5('r8d-word-reviewed')::text,
      'canonicalSpelling','reviewed','order',1,
      'schedule',jsonb_build_object(
        'scheduleWordId',md5('r8d-schedule-reviewed')::text,
        'schedulePolicyVersion','r8d-proof-v1',
        'wordScheduleVersion','adle_review_per_word_schedule_v1'
      )
    )),
    'promptCandidates',(
      select jsonb_agg(jsonb_build_object(
        'contractVersion','3','promptVersionId',md5('r8d-prompt-' || challenge)::text,
        'stablePromptKey','r8d-' || challenge,'promptText','R8D prompt',
        'instructionText','Write safely','challengeType',challenge,
        'reusePolicy',case when challenge = 'reflection'
          then 'reusable_lru_no_immediate_repeat' else 'once_per_learner' end
      ) order by challenge)
      from unnest(array['conundrums','fortunately_unfortunately','persuasion','reflection','stories']) challenge
    ),
    'timerPolicy',jsonb_build_object(
      'writingDurationSeconds',600,'extensionOptionsSeconds',jsonb_build_array(300,600,900),
      'maximumExtensions',1,'parentReauthenticationRequired',true,
      'scope','creative_writing_only'
    ),
    'activitySequence',jsonb_build_array(1,2,3,4,5),
    'completionContract',jsonb_build_object(
      'targetProgressRole','challenge_progress_only',
      'perfectProgressRole','achievement_only',
      'requireOriginalOutcomeForEveryTarget',true,
      'requireTerminalRepairForEveryFailure',true
    ),
    'contentVersions','[]'::jsonb,
    'provenance',jsonb_build_object(
      'sourceKind','compiled_review_assignment','fingerprintAlgorithm','sha256',
      'fingerprintVersion',1,'sourceFingerprint',repeat('d',64)
    ),
    'initialChallengeType','reflection'
  )
);

insert into public.assignment_items(
  id,daily_assignment_id,child_id,parent_user_id,domain_module,item_type,
  source_type,source_entity_id,template_key,target_word,position,status,metadata
) values (
  md5('r8d-review-assignment-item')::uuid,
  md5('r8d-review-assignment')::uuid,
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'spelling','lesson','adle_review','r8d:protected-review','r8d-review',
  'reviewed',1,'completed','{}'::jsonb
);

insert into public.adle_review_sessions(
  id,daily_assignment_id,assignment_item_id,child_id,parent_user_id,
  snapshot_fingerprint,selected_challenge_type,stage,draft_text,
  submitted_writing_text,writing_started_at,writing_deadline_at,
  writing_submitted_at,state_version,completed_at
) values (
  md5('r8d-review-session')::uuid,
  md5('r8d-review-assignment')::uuid,
  md5('r8d-review-assignment-item')::uuid,
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  repeat('a',64),'reflection','completed','reviewed','reviewed',
  timezone('utc',now()) - interval '20 minutes',
  timezone('utc',now()) - interval '5 minutes',
  timezone('utc',now()) - interval '10 minutes',5,
  timezone('utc',now()) - interval '4 minutes'
);

insert into public.adle_review_word_encounters(
  id,review_session_id,schedule_word_id,canonical_word_id,target_order,
  writing_disposition,original_outcome,original_outcome_source,
  attribution_algorithm_version,attribution_provenance,revealed_at,
  repair_state
) values (
  md5('r8d-review-encounter')::uuid,
  md5('r8d-review-session')::uuid,
  md5('r8d-schedule-reviewed')::uuid,
  md5('r8d-word-reviewed')::uuid,
  1,'correct_in_writing','success','writing','r8d-proof-v1','{}'::jsonb,
  timezone('utc',now()) - interval '6 minutes','not_required'
);

insert into public.adle_review_outcome_events(
  id,child_id,canonical_word_id,bundle_id,event_type,occurred_on,
  interval_index,schedule_policy_version,attempt_text,daily_assignment_id,
  assignment_item_id,review_session_id,review_encounter_id,schedule_word_id,
  original_result,result_source,due_kind,frozen_due_on,
  frozen_interval_index,word_schedule_version,assignment_practice_date,
  review_completed_on,completed_at,original_attempted_at,
  writing_submitted_at,source_provenance
) values (
  md5('r8d-review-outcome')::uuid,
  '10000000-0000-4000-8000-000000000002',
  md5('r8d-word-reviewed')::uuid,md5('r8d-bundle-reviewed')::uuid,
  'review_pass',current_date - 1,0,'r8d-proof-v1','reviewed',
  md5('r8d-review-assignment')::uuid,
  md5('r8d-review-assignment-item')::uuid,
  md5('r8d-review-session')::uuid,md5('r8d-review-encounter')::uuid,
  md5('r8d-schedule-reviewed')::uuid,
  'success','review_writing','scheduled_review',current_date - 1,0,
  'adle_review_per_word_schedule_v1',current_date - 1,current_date - 1,
  timezone('utc',now()) - interval '4 minutes',
  timezone('utc',now()) - interval '7 minutes',
  timezone('utc',now()) - interval '10 minutes','{}'::jsonb
);

update public.adle_review_word_encounters
set review_outcome_event_id = md5('r8d-review-outcome')::uuid
where id = md5('r8d-review-encounter')::uuid;

insert into public.adle_review_outcome_event_routes(
  id,outcome_event_id,learning_item_id,micro_skill_key
) values (
  md5('r8d-review-outcome-route')::uuid,
  md5('r8d-review-outcome')::uuid,
  md5('r8d-item-reviewed')::uuid,
  'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'
);

insert into public.adle_review_transition_receipts(
  id,review_session_id,idempotency_key,transition_kind,
  request_fingerprint,resulting_state_version
) values (
  md5('r8d-review-transition-receipt')::uuid,
  md5('r8d-review-session')::uuid,'r8d-complete-review','complete_review',
  repeat('b',64),5
);

insert into public.adle_review_completion_receipts(
  id,review_session_id,idempotency_key,snapshot_fingerprint,
  request_fingerprint,completed_at,review_completed_on,result_payload
) values (
  md5('r8d-review-completion-receipt')::uuid,
  md5('r8d-review-session')::uuid,'r8d-completion',repeat('a',64),
  repeat('c',64),timezone('utc',now()) - interval '4 minutes',
  current_date - 1,jsonb_build_object('status','completed')
);

set local session_replication_role = origin;

create temporary table r8d_protected_hashes(
  table_name text primary key,
  before_rows integer not null,
  before_hash text not null
);
insert into r8d_protected_hashes(table_name,before_rows,before_hash) values
  ('daily_assignments',(select count(*) from public.daily_assignments),public.r8d_table_hash('public.daily_assignments')),
  ('assignment_items',(select count(*) from public.assignment_items),public.r8d_table_hash('public.assignment_items')),
  ('adle_assignment_attempt_events',(select count(*) from public.adle_assignment_attempt_events),public.r8d_table_hash('public.adle_assignment_attempt_events')),
  ('adle_assignment_attempt_event_routes',(select count(*) from public.adle_assignment_attempt_event_routes),public.r8d_table_hash('public.adle_assignment_attempt_event_routes')),
  ('adle_taught_word_history',(select count(*) from public.adle_taught_word_history),public.r8d_table_hash('public.adle_taught_word_history')),
  ('adle_review_sessions',(select count(*) from public.adle_review_sessions),public.r8d_table_hash('public.adle_review_sessions')),
  ('adle_review_word_encounters',(select count(*) from public.adle_review_word_encounters),public.r8d_table_hash('public.adle_review_word_encounters')),
  ('adle_review_outcome_events',(select count(*) from public.adle_review_outcome_events),public.r8d_table_hash('public.adle_review_outcome_events')),
  ('adle_review_outcome_event_routes',(select count(*) from public.adle_review_outcome_event_routes),public.r8d_table_hash('public.adle_review_outcome_event_routes')),
  ('adle_review_transition_receipts',(select count(*) from public.adle_review_transition_receipts),public.r8d_table_hash('public.adle_review_transition_receipts')),
  ('adle_review_completion_receipts',(select count(*) from public.adle_review_completion_receipts),public.r8d_table_hash('public.adle_review_completion_receipts'));

-- The pre-fix run of this production-shaped `intake` fixture proved that both
-- direct statements succeeded. The remediated trust boundary must reject them
-- for authenticated and service-role callers, while an unconsumed legacy NULL
-- source (`wordonly`) retains the pre-R8D reversible behavior.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select public.r8d_expect_error(
  format(
    $$update public.parent_verified_spelling_candidate_mappings
      set candidate_status = 'pending_parent_promotion'
      where id = %L::uuid$$,
    md5('r8d-source-intake')::uuid
  ),
  'consumed spelling source requires the governed R8D reconciliation path'
);
select public.r8d_expect_error(
  format(
    $$update public.writing_issues
      set approved_replacement = 'rewritten-directly'
      where id = %L::uuid$$,
    md5('r8d-issue-intake')::uuid
  ),
  'consumed spelling decision requires the governed R8D reconciliation path'
);
select public.r8d_expect_error(
  format(
    $$update public.parent_verified_spelling_candidate_mappings
      set candidate_status = 'pending_parent_promotion'
      where id = %L::uuid$$,
    '10000000-0000-4000-8000-000000000304'::uuid
  ),
  'consumed spelling source requires the governed R8D reconciliation path'
);

savepoint r8d_consumed_non_authority_metadata;
update public.parent_verified_spelling_candidate_mappings
set metadata = metadata || '{"r8d_non_authority_edit":true}'::jsonb
where id = md5('r8d-source-intake')::uuid;
update public.writing_issues
set metadata = metadata || '{"r8d_non_authority_edit":true}'::jsonb
where id = md5('r8d-issue-intake')::uuid;
do $$
begin
  if not (select metadata @> '{"r8d_non_authority_edit":true}'::jsonb
      from public.parent_verified_spelling_candidate_mappings
      where id = md5('r8d-source-intake')::uuid)
    or not (select metadata @> '{"r8d_non_authority_edit":true}'::jsonb
      from public.writing_issues
      where id = md5('r8d-issue-intake')::uuid)
  then
    raise exception 'consumed-source non-authority metadata edit was frozen';
  end if;
end $$;
rollback to savepoint r8d_consumed_non_authority_metadata;

savepoint r8d_unconsumed_legacy_reversion;
update public.parent_verified_spelling_candidate_mappings
set candidate_status = 'pending_parent_promotion'
where id = md5('r8d-source-wordonly')::uuid;
do $$
begin
  if (select candidate_status
      from public.parent_verified_spelling_candidate_mappings
      where id = md5('r8d-source-wordonly')::uuid)
      <> 'pending_parent_promotion' then
    raise exception 'unconsumed legacy NULL source lost reversible behavior';
  end if;
end $$;
rollback to savepoint r8d_unconsumed_legacy_reversion;

savepoint r8d_unconsumed_legacy_issue_change;
update public.writing_issues
set final_classification = 'fragile_knowledge'
where id = md5('r8d-issue-wordonly')::uuid;
do $$
begin
  if (select final_classification
      from public.writing_issues
      where id = md5('r8d-issue-wordonly')::uuid)
      <> 'fragile_knowledge' then
    raise exception 'unconsumed legacy NULL writing decision was falsely frozen';
  end if;
end $$;
rollback to savepoint r8d_unconsumed_legacy_issue_change;
reset role;

set local role service_role;
select public.r8d_expect_error(
  format(
    $$update public.parent_verified_spelling_candidate_mappings
      set candidate_status = 'pending_parent_promotion'
      where id = %L::uuid$$,
    md5('r8d-source-intake')::uuid
  ),
  'consumed spelling source requires the governed R8D reconciliation path'
);
select public.r8d_expect_error(
  format(
    $$update public.writing_issues
      set final_classification = 'not_an_issue'
      where id = %L::uuid$$,
    md5('r8d-issue-intake')::uuid
  ),
  'consumed spelling decision requires the governed R8D reconciliation path'
);
select public.r8d_expect_error(
  format(
    $$delete from public.parent_verified_spelling_candidate_mappings
      where id = %L::uuid$$,
    md5('r8d-source-intake')::uuid
  ),
  'consumed spelling source cannot be deleted'
);
reset role;

do $$
begin
  if not public.adle_spelling_source_requires_reconciliation_r8d(
      md5('r8d-source-intake')::uuid
    )
    or not public.adle_spelling_source_requires_reconciliation_r8d(
      '10000000-0000-4000-8000-000000000304'::uuid
    )
    or public.adle_spelling_source_requires_reconciliation_r8d(
      md5('r8d-source-wordonly')::uuid
    )
  then
    raise exception 'R8D consumed-source predicate disagrees with fixture semantics';
  end if;
end $$;

-- The pre-R8D direct mutation path is now unavailable to an authenticated
-- parent once an occurrence has a governed handoff identity.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select public.r8d_expect_error(
  $$update public.writing_issues
    set approved_replacement = 'rewritten-directly'
    where id = '10000000-0000-4000-8000-000000000101'$$,
  'governed R8D reconciliation path'
);
reset role;

create temporary table r8d_results(
  fixture_key text primary key,
  payload jsonb not null
);

-- 1-6: before intake consumption, blocked content, intake only, teaching only,
-- scheduled without Review history, and protected Review history.
insert into r8d_results values (
  'not_consumed',
  public.r8d_reconcile_nonlearning(
    '10000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000301',1,'r8d:not-consumed'
  )
);
insert into r8d_results values (
  'content_blocked',
  public.r8d_reconcile_nonlearning(
    '10000000-0000-4000-8000-000000000104',
    '10000000-0000-4000-8000-000000000304',1,'r8d:content-blocked'
  )
);
insert into r8d_results values (
  'intake',
  public.r8d_reconcile_nonlearning(
    md5('r8d-issue-intake')::uuid,md5('r8d-source-intake')::uuid,
    1,'r8d:intake'
  )
);
do $$
begin
  if (select (payload ->> 'authoritativeSourceCountAfter')::integer
      from r8d_results where fixture_key = 'intake') <> 1
    or (select row_status from public.adle_learning_items
      where id = md5('r8d-item-intake')::uuid) <> 'active'
    or (select row_status from public.adle_learning_item_sources
      where id = md5('r8d-lineage-intakeb')::uuid) <> 'active'
    or (select candidate_status
      from public.parent_verified_spelling_candidate_mappings
      where id = md5('r8d-source-intakeb')::uuid) <> 'parent_local_promoted'
  then
    raise exception 'legacy+legacy first-source removal did not preserve source B authority';
  end if;
end $$;
insert into r8d_results values (
  'intake_last',
  public.r8d_reconcile_nonlearning(
    md5('r8d-issue-intakeb')::uuid,md5('r8d-source-intakeb')::uuid,
    1,'r8d:intake-last'
  )
);
insert into r8d_results values (
  'teaching',
  public.r8d_reconcile_nonlearning(
    md5('r8d-issue-teaching')::uuid,md5('r8d-source-teaching')::uuid,
    1,'r8d:teaching'
  )
);
insert into r8d_results values (
  'schedule',
  public.r8d_reconcile_nonlearning(
    md5('r8d-issue-schedule')::uuid,md5('r8d-source-schedule')::uuid,
    1,'r8d:schedule'
  )
);
insert into r8d_results values (
  'reviewed',
  public.r8d_reconcile_nonlearning(
    md5('r8d-issue-reviewed')::uuid,md5('r8d-source-reviewed')::uuid,
    1,'r8d:reviewed'
  )
);
do $$
begin
  if (select (payload ->> 'authoritativeSourceCountAfter')::integer
      from r8d_results where fixture_key = 'reviewed') <> 1
    or (select row_status from public.adle_learning_items
      where id = md5('r8d-item-reviewed')::uuid) <> 'active'
    or (select row_status from public.adle_learning_item_sources
      where id = md5('r8d-lineage-reviewedb')::uuid) <> 'active'
    or (select row_status from public.adle_review_schedule_words
      where id = md5('r8d-schedule-reviewed')::uuid) <> 'active'
    or (select row_status from public.adle_review_schedule_word_routes
      where id = md5('r8d-schedule-route-reviewed')::uuid) <> 'active'
    or exists (
      select 1 from r8d_protected_hashes hash
      where hash.before_hash <> public.r8d_table_hash(
        ('public.' || quote_ident(hash.table_name))::regclass
      )
    )
  then
    raise exception 'legacy/R8C first-source removal changed remaining authority or history';
  end if;
end $$;
insert into r8d_results values (
  'reviewed_last',
  public.r8d_reconcile_nonlearning(
    md5('r8d-issue-reviewedb')::uuid,md5('r8d-source-reviewedb')::uuid,
    1,'r8d:reviewed-last'
  )
);

-- Two occurrence sources share the same active target. The first removal must
-- retain it; the second is the last-source retirement boundary.
insert into r8d_results values (
  'shared_first',
  public.r8d_reconcile_nonlearning(
    '10000000-0000-4000-8000-000000000103',
    '10000000-0000-4000-8000-000000000303',1,'r8d:shared-first'
  )
);
insert into r8d_results values (
  'shared_last',
  public.r8d_reconcile_nonlearning(
    '20000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000301',1,'r8d:shared-last'
  )
);

-- Same request/key replays the durable result before the stale-version check;
-- a different key with the old version and a wrong learner both fail.
insert into r8d_results values (
  'idempotent_replay',
  public.r8d_reconcile_nonlearning(
    md5('r8d-issue-reviewed')::uuid,md5('r8d-source-reviewed')::uuid,
    1,'r8d:reviewed'
  )
);
select public.r8d_expect_error(
  format(
    $$select public.r8d_reconcile_nonlearning(%L::uuid,%L::uuid,1,'r8d:stale')$$,
    md5('r8d-issue-reviewed')::uuid,md5('r8d-source-reviewed')::uuid
  ),
  'authority version is stale'
);
select public.r8d_expect_error(
  format(
    $$select public.adle_reconcile_parent_spelling_decision_r8d(
      %L::uuid,%L::uuid,
      '10000000-0000-4000-8000-000000000001'::uuid,
      %L::uuid,1,'not_an_issue',null,null,null,null,
      'wrong learner proof','r8d:wrong-learner')$$,
    md5('r8d-issue-concurrency')::uuid,
    md5('r8d-source-concurrency')::uuid,
    md5('r8d-unactivated-child')::uuid
  ),
  'another learner'
);

do $$
declare
  v_expected jsonb := jsonb_build_object(
    'not_consumed','not_consumed_downstream',
    'content_blocked','content_blocked',
    'intake','shared_active_target',
    'intake_last','intake_without_teaching',
    'teaching','teaching_without_schedule',
    'schedule','schedule_without_review_history',
    'reviewed','shared_active_target',
    'reviewed_last','protected_review_history',
    'shared_first','shared_active_target'
  );
  v_key text;
  v_class text;
begin
  for v_key,v_class in select key,value #>> '{}' from jsonb_each(v_expected)
  loop
    if (select payload ->> 'reconciliationClass'
        from r8d_results where fixture_key = v_key) <> v_class then
      raise exception 'R8D class mismatch for %', v_key;
    end if;
  end loop;
  if (select payload ->> 'targetAction' from r8d_results
      where fixture_key = 'shared_first') <> 'kept_active_other_sources' then
    raise exception 'first shared-source reversal retired the target';
  end if;
  if (select payload ->> 'targetAction' from r8d_results
      where fixture_key = 'intake') <> 'kept_active_other_sources'
    or (select payload ->> 'targetAction' from r8d_results
      where fixture_key = 'reviewed') <> 'kept_active_other_sources' then
    raise exception 'legacy/mixed first-source reversal retired a shared target';
  end if;
  if (select payload ->> 'targetAction' from r8d_results
      where fixture_key = 'intake_last') <> 'superseded_last_source'
    or (select payload ->> 'targetAction' from r8d_results
      where fixture_key = 'reviewed_last') <> 'superseded_last_source' then
    raise exception 'legacy/mixed last-source reversal retained stale authority';
  end if;
  if (select payload ->> 'targetAction' from r8d_results
      where fixture_key = 'shared_last') <> 'superseded_last_source' then
    raise exception 'last shared-source reversal retained stale authority';
  end if;
  if not (select (payload ->> 'replayed')::boolean from r8d_results
      where fixture_key = 'idempotent_replay') then
    raise exception 'same-key retry did not replay';
  end if;
  if (select count(*) from public.adle_spelling_decision_reconciliations
      where idempotency_key = 'r8d:reviewed') <> 1 then
    raise exception 'same-key retry duplicated its reconciliation receipt';
  end if;
end $$;

-- Four visible exact mappings exercise corrected word, corrected micro-skill,
-- corrected word+micro-skill, and non-learning -> learning reactivation.
set local session_replication_role = replica;
insert into public.spelling_canonical_mappings(
  id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,
  created_by_admin_user_id,mapping_status,resolver_visibility_status
)
select
  md5('r8d-replacement-mapping-' || fixture_key)::uuid,
  misspelling,'replay','D4_MOR_PREFIXES_RE_PRE',
  '10000000-0000-4000-8000-000000000001','active','visible'
from (values
  ('reactivate','reactivte'),('wordonly','wrodonly'),
  ('skillonly','skilonly'),('both','bauth')
) fixtures(fixture_key,misspelling);

insert into public.spelling_canonical_mapping_events(
  id,mapping_id,event_type,new_resolver_visibility_status,
  admin_user_id,note
)
select
  md5('r8d-replacement-event-' || fixture_key)::uuid,
  md5('r8d-replacement-mapping-' || fixture_key)::uuid,
  'resolver_visibility_enabled','visible',
  '10000000-0000-4000-8000-000000000001','R8D proof'
from (values ('reactivate'),('wordonly'),('skillonly'),('both'))
  fixtures(fixture_key);
set local session_replication_role = origin;

insert into r8d_results values (
  'reactivate_nonlearning',
  public.r8d_reconcile_nonlearning(
    md5('r8d-issue-reactivate')::uuid,
    md5('r8d-source-reactivate')::uuid,1,'r8d:reactivate-nonlearning'
  )
);

insert into r8d_results
select 'replacement_' || fixture_key,
  public.adle_reconcile_parent_spelling_decision_r8d(
    md5('r8d-issue-' || fixture_key)::uuid,
    md5('r8d-source-' || fixture_key)::uuid,
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    expected_version,'concept_gap','replay','D4_MOR_PREFIXES_RE_PRE',
    md5('r8d-replacement-mapping-' || fixture_key)::uuid,
    md5('r8d-submission-approval-' || fixture_key)::uuid,
    'R8D exact corrected authority proof',
    'r8d:replacement-' || fixture_key
  )
from (values
  ('reactivate',2::bigint),('wordonly',1::bigint),
  ('skillonly',1::bigint),('both',1::bigint)
) fixtures(fixture_key,expected_version);

create temporary table r8d_replacement_specs as
select
  replace(result.fixture_key,'replacement_','') fixture_key,
  (result.payload ->> 'replacementCandidateMappingId')::uuid candidate_id,
  md5(
    'r8d-replacement-mapping-' || replace(result.fixture_key,'replacement_','')
  )::uuid mapping_id
from r8d_results result
where result.fixture_key like 'replacement_%';
grant select on r8d_replacement_specs to service_role;

set local role service_role;
do $$
declare
  v_spec record;
  v_misspelling text;
begin
  for v_spec in select * from r8d_replacement_specs order by fixture_key
  loop
    select misspelling_normalized into v_misspelling
    from public.parent_verified_spelling_candidate_mappings
    where id = v_spec.candidate_id;
    perform public.adle_seed_canonical_intake_candidate(
      v_spec.candidate_id,'replay','dynamic_prefix_word_lab','v2',
      'D4_MOR_PREFIXES_RE_PRE','r8d:replacement-intake:' || v_spec.fixture_key
    );
    perform public.adle_persist_canonical_intake(
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000601',
      'D4_MOR_PREFIXES_RE_PRE',v_spec.candidate_id,v_spec.mapping_id,
      v_misspelling,'replay','r8d:replacement-intake:' || v_spec.fixture_key,
      current_date,'dynamic_prefix_word_lab','v2',null,null,null,null
    );
  end loop;
end $$;
reset role;

-- The append-only audit receipt is itself protected.
set local role service_role;
select public.r8d_expect_error(
  $$update public.adle_spelling_decision_reconciliations
    set reason = 'rewritten'
    where idempotency_key = 'r8d:reviewed'$$,
  'append-only'
);
reset role;

do $$
declare
  v_row record;
begin
  if (select count(*) from public.adle_learning_items
      where child_id = '10000000-0000-4000-8000-000000000002'
        and canonical_word_id = '10000000-0000-4000-8000-000000000601'
        and micro_skill_key = 'D4_MOR_PREFIXES_RE_PRE'
        and row_status = 'active') <> 1 then
    raise exception 'replacement intake did not converge on one active target';
  end if;
  if (select count(*)
      from public.adle_learning_item_sources source
      join public.adle_learning_items item on item.id = source.learning_item_id
      where item.child_id = '10000000-0000-4000-8000-000000000002'
        and item.canonical_word_id = '10000000-0000-4000-8000-000000000601'
        and item.micro_skill_key = 'D4_MOR_PREFIXES_RE_PRE'
        and item.row_status = 'active'
        and source.row_status = 'active'
        and source.parent_verified_candidate_mapping_id in (
          select candidate_id from r8d_replacement_specs
        )) <> 4 then
    raise exception 'replacement intake did not retain four active lineage rows';
  end if;
  if (select payload ->> 'reconciliationClass' from r8d_results
      where fixture_key = 'replacement_reactivate') <> 'historical_reactivation' then
    raise exception 'non-learning -> learning did not use historical reactivation';
  end if;
  if exists (
    select 1 from r8d_protected_hashes hash
    where hash.before_hash <> public.r8d_table_hash(
      ('public.' || quote_ident(hash.table_name))::regclass
    )
  ) then
    raise exception 'R8D changed protected teaching or Review history';
  end if;
  if exists (
    select 1 from public.adle_review_schedule_words
    where id in (
      md5('r8d-schedule-schedule')::uuid,
      md5('r8d-schedule-reviewed')::uuid
    ) and row_status <> 'superseded'
  ) then
    raise exception 'future Review remained active after last-source reversal';
  end if;
  if exists (
    select 1 from public.adle_review_schedule_word_routes
    where id in (
      md5('r8d-schedule-route-schedule')::uuid,
      md5('r8d-schedule-route-reviewed')::uuid
    ) and row_status <> 'superseded'
  ) then
    raise exception 'stale Review routes remained active';
  end if;
  if (select count(*) from public.adle_review_r6_child_rollouts
      where child_id = md5('r8d-unactivated-child')::uuid) <> 0
    or (select count(*) from public.daily_assignments
      where child_id = md5('r8d-unactivated-child')::uuid) <> 0
    or (select count(*) from public.adle_review_sessions
      where child_id = md5('r8d-unactivated-child')::uuid) <> 0
    or (select count(*) from public.adle_review_word_encounters encounter
      join public.adle_review_sessions session
        on session.id = encounter.review_session_id
      where session.child_id = md5('r8d-unactivated-child')::uuid) <> 0 then
    raise exception 'R8D created learner-facing state for an unactivated learner';
  end if;
end $$;

select 'R8D_SQL_RECEIPT:' || jsonb_build_object(
  'migrationCompiled',true,
  'lifecycleClasses',jsonb_build_object(
    'notConsumed',true,'contentBlocked',true,'intakeWithoutTeaching',true,
    'teachingWithoutSchedule',true,'scheduleWithoutReview',true,
    'protectedReviewHistory',true,'sharedSourceFirstAndLast',true
  ),
  'legacyNullCompatibility',jsonb_build_object(
    'authenticatedCandidateBypassRejected',true,
    'authenticatedWritingIssueBypassRejected',true,
    'serviceRoleCandidateBypassRejected',true,
    'serviceRoleWritingIssueBypassRejected',true,
    'consumedDeleteRejected',true,
    'consumedNonAuthorityMetadataAllowed',true,
    'unconsumedMissingIntakeStillReversible',true,
    'unconsumedWritingDecisionStillMutable',true,
    'pendingContentProtected',true,
    'legacyLegacySharedTarget',true,
    'legacyR8CSharedTarget',true,
    'firstSourcePreservedAuthority',true,
    'lastSourceStoppedFutureAuthority',true,
    'legacyProtectedHistoryUnchanged',true,
    'explicitR8CProtectedHistoryUnchanged',true
  ),
  'protectedHistoryTablesHashed',(select count(*) from r8d_protected_hashes),
  'protectedHistoryRows',(select sum(before_rows) from r8d_protected_hashes),
  'protectedHistoryAggregateDigest',(
    select md5(string_agg(table_name || ':' || before_hash, '|' order by table_name))
    from r8d_protected_hashes
  ),
  'protectedHistory',(
    select jsonb_object_agg(
      table_name,
      jsonb_build_object(
        'rows',before_rows,
        'beforeDigest',before_hash,
        'afterDigest',public.r8d_table_hash(
          ('public.' || quote_ident(table_name))::regclass
        ),
        'unchanged',before_hash = public.r8d_table_hash(
          ('public.' || quote_ident(table_name))::regclass
        )
      )
      order by table_name
    )
    from r8d_protected_hashes
  ),
  'idempotentReplay',true,
  'staleVersionRejected',true,
  'wrongLearnerRejected',true,
  'directMutationRejected',true,
  'correctedWord',true,
  'correctedMicroSkill',true,
  'correctedWordAndMicroSkill',true,
  'nonLearningToLearning',true,
  'replacementActiveTargets',1,
  'replacementActiveSources',4,
  'unactivatedLearnerSafe',true,
  'concurrency',jsonb_build_object(
    'issueId',md5('r8d-issue-concurrency')::uuid,
    'sourceId',md5('r8d-source-concurrency')::uuid,
    'parentId','10000000-0000-4000-8000-000000000001'::uuid,
    'childId','10000000-0000-4000-8000-000000000002'::uuid,
    'approvalSubmissionId',md5('r8d-submission-approval-concurrency')::uuid,
    'expectedAuthorityVersion',1
  )
)::text;

commit;
