\set ON_ERROR_STOP on

begin;

create temp table r8e_stage_f_authority (
  occurrence_id uuid primary key,
  writing_issue_id uuid not null,
  observed_word text not null,
  corrected_word text not null,
  micro_skill_key text not null,
  admin_case_id uuid not null,
  admin_decision_id uuid not null,
  canonical_mapping_id uuid not null,
  ordinal integer not null
) on commit drop;

insert into r8e_stage_f_authority values
  ('a38d85fc-ea0f-4190-b87c-4a0a24420037','10823fc2-ed52-468a-919b-0090cb872816','imergrants','immigrants','D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX','a444a17b-8258-4451-833c-6acfdefc2f95','a6107f26-4834-43d6-9dd5-19ac8dea8ef6','4b869f34-64fb-4390-b0c8-94debf8f0d92',1),
  ('852e2923-9622-4668-b659-923c2d018530','1b33ccec-eb97-4a37-9d89-513f4b870530','goviment','government','D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX','de68beb3-110b-4e08-a3fb-4730558c3f6a','2abea965-3709-42fc-9682-57c8666283ca','343b55d5-46e9-4006-82e5-8bf927e1f89f',2),
  ('a659de3f-ab82-481b-9b2f-2a4fefb1385f','32616f9c-2597-4cf7-8d93-81f16d86cf00','summery','summary','D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS','56a40a7b-6189-4509-9bfd-ce5a0178dfab','9aec2d88-ddc1-4f39-9a7f-2202f95e4ccf','c81a3880-0c8e-4798-8b72-c9a4b10322f4',3),
  ('76a6e7fc-7460-4f4f-b8b5-7a5e65c77f2d','66e76e5c-21d3-4957-8ba7-83cee076a10d','browny','brownie','D4_PG_LONG_EE_IE','4e9fdb05-77de-499b-a3a9-87da60b5b063','02dffedf-5e48-4c83-9f21-5cea6f348654','8db6f7bd-0283-4456-85df-bce62cf59df6',4),
  ('3ebb3ecb-ad41-4461-b571-db340373ed9e','7f13d192-d03d-461e-8eb7-a1d0cd270ef3','ether','either','D4_PG_LONG_EE_EI','143231fd-e793-4fc7-a010-0bb9ed960ce3','101ab10b-b564-41a8-90cc-b9dbd79ae434','7a6cca4d-3fb9-4b8a-8e46-6a3f84d71199',5),
  ('5e6bc904-d0c3-431b-a9aa-004650454e81','89a8348a-9c5d-4c55-a0e6-5f057f04d836','diebieties','diabetes','D4_MOR_ROOTS_COMMON_GREEK_ROOTS','3626643a-1bcf-485a-bb0d-642cfc2dc34e','0277d456-74d2-4298-b5fb-1e5138b07b89','5a14271c-df0e-4308-944f-907c656d6643',6),
  ('9b306e4f-e3c6-4699-9de0-59c4934b927e','b746ed11-eb20-47ee-8d39-cf0676424bb6','dierbeties','diabetes','D4_MOR_ROOTS_SCIENCE_MATH_ROOTS','5dc04750-7750-448d-9229-ed36cad19564','739eb12f-d825-4c44-9e93-414abce418f5','5ccf3db6-3213-49ba-bf24-dfaad5efd02c',7);

set local session_replication_role = replica;

insert into auth.users(id,email,role,aud,created_at,updated_at) values
  ('a28d4885-8328-4853-ba11-6c676619b9ea','stage-f-parent@example.invalid','authenticated','authenticated',timezone('utc',now()),timezone('utc',now())),
  ('f0000000-0000-4000-8000-000000000001','stage-f-admin@example.invalid','authenticated','authenticated',timezone('utc',now()),timezone('utc',now()));

insert into public.children(id,parent_user_id,first_name)
values ('e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e','a28d4885-8328-4853-ba11-6c676619b9ea','Stage-F Fixture');

insert into public.micro_skill_catalog(
  id,mastery_domain_key,skill_family_key,skill_cluster_key,micro_skill_key,
  display_name,practice_route,is_assignable,is_active
)
select
  gen_random_uuid(),'D4',split_part(authority.micro_skill_key,'_',2),
  authority.micro_skill_key,authority.micro_skill_key,authority.micro_skill_key,
  'grouped_set_practice',true,true
from r8e_stage_f_authority authority;

insert into public.task_submissions(
  id,task_id,course_id,child_id,parent_user_id,submission_text,
  parent_review_status,parent_reviewed_at
) values
  ('63446883-2b8d-4437-8b28-1f48ff43f814','f0000000-0000-4000-8000-000000000010','f0000000-0000-4000-8000-000000000011','e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e','a28d4885-8328-4853-ba11-6c676619b9ea','Stage-F original fixture','approved',timezone('utc',now())),
  ('f0000000-0000-4000-8000-000000000012','f0000000-0000-4000-8000-000000000010','f0000000-0000-4000-8000-000000000011','e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e','a28d4885-8328-4853-ba11-6c676619b9ea','Stage-F returned correction fixture','approved',timezone('utc',now()));

insert into public.writing_samples(
  id,child_id,parent_user_id,title,sample_text,task_submission_id
) values (
  'f0000000-0000-4000-8000-000000000020',
  'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
  'a28d4885-8328-4853-ba11-6c676619b9ea',
  'Stage-F historical fixture','Seven deterministic occurrences',
  '63446883-2b8d-4437-8b28-1f48ff43f814'
);

insert into public.misspelling_instances(
  id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word,
  position_start,position_end
)
select
  authority.occurrence_id,'f0000000-0000-4000-8000-000000000020',
  'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
  'a28d4885-8328-4853-ba11-6c676619b9ea',
  authority.observed_word,authority.corrected_word,
  authority.ordinal * 10,authority.ordinal * 10 + length(authority.observed_word)
from r8e_stage_f_authority authority;

insert into public.writing_issues(
  id,child_id,parent_user_id,task_submission_id,writing_sample_id,
  source_misspelling_instance_id,issue_status,final_classification,
  observed_text,suggested_replacement,approved_replacement,micro_skill_key,
  final_classified_at,metadata
)
select
  authority.writing_issue_id,
  'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
  'a28d4885-8328-4853-ba11-6c676619b9ea',
  '63446883-2b8d-4437-8b28-1f48ff43f814',
  'f0000000-0000-4000-8000-000000000020',
  authority.occurrence_id,'finalised','concept_gap',authority.observed_word,
  authority.corrected_word,authority.corrected_word,authority.micro_skill_key,
  '2026-06-25T17:15:31Z'::timestamptz,
  jsonb_build_object(
    'returned_correction_stage_f_replay',jsonb_build_object(
      'action','attached_verified_route',
      'replayed_at','2026-06-25T17:15:31.423031',
      'route_source','canonical_mapping',
      'admin_case_id',authority.admin_case_id,
      'dry_run_first',true,
      'admin_decision_id',authority.admin_decision_id,
      'canonical_mapping_id',authority.canonical_mapping_id
    )
  )
from r8e_stage_f_authority authority;

insert into public.writing_issue_correction_attempts(
  id,writing_issue_id,child_id,parent_user_id,task_submission_id,
  attempted_correction,reflection,created_at
)
select
  gen_random_uuid(),authority.writing_issue_id,
  'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
  'a28d4885-8328-4853-ba11-6c676619b9ea',
  'f0000000-0000-4000-8000-000000000012',authority.corrected_word,
  'medium','2026-06-25T17:00:00Z'::timestamptz + authority.ordinal * interval '1 second'
from r8e_stage_f_authority authority;

insert into public.spelling_catalog_review_cases(
  id,parent_user_id,child_id,task_submission_id,writing_sample_id,
  source_misspelling_instance_id,source_provenance,
  reviewed_event_source_entity_id,original_child_spelling,
  original_correct_spelling,misspelling_normalized,
  correct_spelling_normalized,case_status
)
select
  authority.admin_case_id,'a28d4885-8328-4853-ba11-6c676619b9ea',
  'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
  '63446883-2b8d-4437-8b28-1f48ff43f814',
  'f0000000-0000-4000-8000-000000000020',authority.occurrence_id,
  'lesson_submission_existing_output',concat('stage-f-case-',authority.ordinal),
  authority.observed_word,authority.corrected_word,authority.observed_word,
  authority.corrected_word,'add_canonical_mapping'
from r8e_stage_f_authority authority;

insert into public.spelling_catalog_review_case_decisions(
  id,case_id,admin_user_id,admin_email,decision_type,previous_status,
  new_status,linked_micro_skill_key,canonical_mapping_id,metadata
)
select
  authority.admin_decision_id,authority.admin_case_id,
  'f0000000-0000-4000-8000-000000000001','stage-f-admin@example.invalid',
  'add_canonical_mapping','open','add_canonical_mapping',
  authority.micro_skill_key,authority.canonical_mapping_id,
  jsonb_build_object('canonical_mapping_created',true)
from r8e_stage_f_authority authority;

insert into public.spelling_canonical_mappings(
  id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,
  mapping_status,dialect_code,normalization_version,source_case_id,
  source_decision_id,created_by_admin_user_id,created_by_admin_email,
  resolver_visibility_status
)
select
  authority.canonical_mapping_id,authority.observed_word,
  authority.corrected_word,authority.micro_skill_key,'active','en-GB',
  'spelling_normalize_v1',authority.admin_case_id,authority.admin_decision_id,
  'f0000000-0000-4000-8000-000000000001','stage-f-admin@example.invalid',
  'visible'
from r8e_stage_f_authority authority;

insert into public.spelling_canonical_mapping_events(
  mapping_id,event_type,new_resolver_visibility_status,admin_user_id,
  admin_email,source_case_id,source_decision_id
)
select
  authority.canonical_mapping_id,'resolver_visibility_enabled','visible',
  'f0000000-0000-4000-8000-000000000001','stage-f-admin@example.invalid',
  authority.admin_case_id,authority.admin_decision_id
from r8e_stage_f_authority authority;

insert into public.learning_items(
  id,child_id,parent_user_id,source_writing_issue_id,micro_skill_key,
  mastery_domain_key,skill_family_key,practice_route,current_competency_level
)
select
  gen_random_uuid(),'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
  'a28d4885-8328-4853-ba11-6c676619b9ea',authority.writing_issue_id,
  authority.micro_skill_key,'D4',split_part(authority.micro_skill_key,'_',2),
  'grouped_set_practice',1
from r8e_stage_f_authority authority;

insert into public.learning_item_issue_links(
  learning_item_id,writing_issue_id,child_id,parent_user_id,link_role,
  metadata
)
select
  item.id,item.source_writing_issue_id,item.child_id,item.parent_user_id,
  'origin',jsonb_build_object('stage_f_fixture',true)
from public.learning_items item
where item.source_writing_issue_id in (
  select writing_issue_id from r8e_stage_f_authority
);

insert into public.learning_item_evidence(
  learning_item_id,child_id,parent_user_id,writing_issue_id,
  task_submission_id,evidence_type,competency_signal,source_context,metadata
)
select
  item.id,item.child_id,item.parent_user_id,item.source_writing_issue_id,
  '63446883-2b8d-4437-8b28-1f48ff43f814','incorrect_use',1,
  'finalised_issue_outcome',jsonb_build_object('stage_f_fixture',true)
from public.learning_items item
where item.source_writing_issue_id in (
  select writing_issue_id from r8e_stage_f_authority
);

set local session_replication_role = origin;

create temp table r8e_stage_f_before on commit drop as
select
  md5(jsonb_build_object(
    'misspellings',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.misspelling_instances row_data
      where row_data.id in (select occurrence_id from r8e_stage_f_authority)),
    'issues',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.writing_issues row_data
      where row_data.id in (select writing_issue_id from r8e_stage_f_authority)),
    'attempts',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.writing_issue_correction_attempts row_data
      where row_data.writing_issue_id in (select writing_issue_id from r8e_stage_f_authority)),
    'cases',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.spelling_catalog_review_cases row_data
      where row_data.id in (select admin_case_id from r8e_stage_f_authority)),
    'decisions',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.spelling_catalog_review_case_decisions row_data
      where row_data.id in (select admin_decision_id from r8e_stage_f_authority)),
    'mappings',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.spelling_canonical_mappings row_data
      where row_data.id in (select canonical_mapping_id from r8e_stage_f_authority)),
    'mapping_events',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.spelling_canonical_mapping_events row_data
      where row_data.mapping_id in (select canonical_mapping_id from r8e_stage_f_authority)),
    'legacy_items',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.learning_items row_data
      where row_data.source_writing_issue_id in (select writing_issue_id from r8e_stage_f_authority)),
    'legacy_links',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.learning_item_issue_links row_data
      where row_data.writing_issue_id in (select writing_issue_id from r8e_stage_f_authority)),
    'legacy_evidence',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.learning_item_evidence row_data
      where row_data.writing_issue_id in (select writing_issue_id from r8e_stage_f_authority))
  )::text) as history_digest,
  (select count(*) from public.adle_review_schedule_words) as review_schedules,
  (select count(*) from public.adle_review_schedule_word_routes) as review_routes,
  (select count(*) from public.daily_assignments) as assignments,
  (select count(*) from public.adle_review_sessions) as review_sessions,
  (select count(*) from public.adle_review_word_encounters) as encounters,
  (select count(*) from public.adle_review_r6_child_rollouts) as rollouts;

create or replace function pg_temp.r8e_expect_error(
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

-- The released normal R8B boundary correctly rejects this terminal historical
-- authority shape; compatibility is separate rather than a weakened R8B rule.
select pg_temp.r8e_expect_error(
  $$select public.ensure_parent_approved_spelling_occurrence_source(
    '10823fc2-ed52-468a-919b-0090cb872816',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e','concept_gap'
  )$$,
  'requires a governed known route or admin handoff'
);

select pg_temp.r8e_expect_error(
  $$select public.materialize_r8e_stage_f_historical_occurrence_source(
    'f0000000-0000-4000-8000-000000000099',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  )$$,
  'not in the exact R8E Stage-F compatibility manifest'
);
select pg_temp.r8e_expect_error(
  $$select public.materialize_r8e_stage_f_historical_occurrence_source(
    'a38d85fc-ea0f-4190-b87c-4a0a24420037',
    'f0000000-0000-4000-8000-000000000099',
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  )$$,
  'governing-parent identity disagrees'
);
select pg_temp.r8e_expect_error(
  $$select public.materialize_r8e_stage_f_historical_occurrence_source(
    'a38d85fc-ea0f-4190-b87c-4a0a24420037',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'f0000000-0000-4000-8000-000000000099'
  )$$,
  'learner or governing-parent identity disagrees'
);

do $$
begin
  begin
    update public.writing_issues
    set observed_text = 'changed'
    where id = '10823fc2-ed52-468a-919b-0090cb872816';
    perform public.materialize_r8e_stage_f_historical_occurrence_source(
      'a38d85fc-ea0f-4190-b87c-4a0a24420037',
      'a28d4885-8328-4853-ba11-6c676619b9ea',
      'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
    );
    raise exception 'changed word did not fail closed';
  exception when others then
    if position('word or micro-skill identity changed' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    update public.writing_issues
    set micro_skill_key = 'D4_CHANGED_ROUTE'
    where id = '10823fc2-ed52-468a-919b-0090cb872816';
    perform public.materialize_r8e_stage_f_historical_occurrence_source(
      'a38d85fc-ea0f-4190-b87c-4a0a24420037',
      'a28d4885-8328-4853-ba11-6c676619b9ea',
      'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
    );
    raise exception 'changed micro-skill did not fail closed';
  exception when others then
    if position('word or micro-skill identity changed' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    update public.writing_issues
    set metadata = metadata #- '{returned_correction_stage_f_replay,admin_decision_id}'
    where id = '10823fc2-ed52-468a-919b-0090cb872816';
    perform public.materialize_r8e_stage_f_historical_occurrence_source(
      'a38d85fc-ea0f-4190-b87c-4a0a24420037',
      'a28d4885-8328-4853-ba11-6c676619b9ea',
      'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
    );
    raise exception 'missing Stage-F provenance did not fail closed';
  exception when others then
    if position('replay provenance is absent or disagrees' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    update public.spelling_canonical_mappings
    set correct_spelling_normalized = 'changed'
    where id = '4b869f34-64fb-4390-b0c8-94debf8f0d92';
    perform public.materialize_r8e_stage_f_historical_occurrence_source(
      'a38d85fc-ea0f-4190-b87c-4a0a24420037',
      'a28d4885-8328-4853-ba11-6c676619b9ea',
      'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
    );
    raise exception 'changed canonical mapping did not fail closed';
  exception when others then
    if position('canonical mapping is not active, visible, and exact' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    insert into public.spelling_catalog_review_case_decisions(
      id,case_id,admin_user_id,decision_type,previous_status,new_status,
      linked_micro_skill_key,canonical_mapping_id
    ) values (
      'f0000000-0000-4000-8000-000000000095',
      'a444a17b-8258-4451-833c-6acfdefc2f95',
      'f0000000-0000-4000-8000-000000000001','add_canonical_mapping',
      'open','add_canonical_mapping','D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX',
      '4b869f34-64fb-4390-b0c8-94debf8f0d92'
    );
    perform public.materialize_r8e_stage_f_historical_occurrence_source(
      'a38d85fc-ea0f-4190-b87c-4a0a24420037',
      'a28d4885-8328-4853-ba11-6c676619b9ea',
      'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
    );
    raise exception 'ambiguous authority did not fail closed';
  exception when others then
    if position('ambiguous historical canonical authority' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    insert into public.parent_verifications(
      id,child_id,parent_user_id,domain_module,source_type,source_entity_id,
      decision
    ) values (
      'f0000000-0000-4000-8000-000000000091',
      'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
      'a28d4885-8328-4853-ba11-6c676619b9ea','spelling',
      'authentic_writing','foreign-source','overridden'
    );
    insert into public.parent_verified_spelling_candidate_mappings(
      id,parent_user_id,child_id,parent_verification_id,task_submission_id,
      source_misspelling_instance_id,source_provenance,
      reviewed_event_source_entity_id,misspelling_normalized,
      correct_spelling_normalized,micro_skill_key,candidate_status,
      promotion_scope
    ) values (
      'f0000000-0000-4000-8000-000000000092',
      'a28d4885-8328-4853-ba11-6c676619b9ea',
      'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
      'f0000000-0000-4000-8000-000000000091',
      'f0000000-0000-4000-8000-000000000012',
      'a38d85fc-ea0f-4190-b87c-4a0a24420037',
      'lesson_submission_existing_output','foreign-source','imergrants',
      'immigrants','D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX',
      'parent_local_promoted','parent_local'
    );
    perform public.materialize_r8e_stage_f_historical_occurrence_source(
      'a38d85fc-ea0f-4190-b87c-4a0a24420037',
      'a28d4885-8328-4853-ba11-6c676619b9ea',
      'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
    );
    raise exception 'foreign live source did not fail closed';
  exception when others then
    if position('already represented by a different governed source' in sqlerrm) = 0 then
      raise;
    end if;
  end;
end;
$$;

savepoint r8e_non_learning_state;
set local session_replication_role = replica;
update public.writing_issues
set final_classification = 'not_an_issue'
where id = '10823fc2-ed52-468a-919b-0090cb872816';
set local session_replication_role = origin;
select pg_temp.r8e_expect_error(
  $$select public.materialize_r8e_stage_f_historical_occurrence_source(
    'a38d85fc-ea0f-4190-b87c-4a0a24420037',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
  )$$,
  'no longer has a final learning decision'
);
rollback to savepoint r8e_non_learning_state;

create temp table r8e_stage_f_results(
  occurrence_id uuid primary key,
  result jsonb not null
) on commit drop;

do $$
declare
  v_authority record;
  v_result jsonb;
begin
  for v_authority in
    select * from r8e_stage_f_authority order by ordinal
  loop
    v_result := public.materialize_r8e_stage_f_historical_occurrence_source(
      v_authority.occurrence_id,
      'a28d4885-8328-4853-ba11-6c676619b9ea',
      'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
    );
    if v_result ->> 'action' <> 'materialized' then
      raise exception 'Stage-F source was not materialized: %', v_result;
    end if;
    insert into r8e_stage_f_results values (v_authority.occurrence_id,v_result);
  end loop;
end;
$$;

do $$
declare
  v_result_row record;
  v_reused jsonb;
begin
  for v_result_row in
    select * from r8e_stage_f_results order by occurrence_id
  loop
    v_reused := public.materialize_r8e_stage_f_historical_occurrence_source(
      v_result_row.occurrence_id,
      'a28d4885-8328-4853-ba11-6c676619b9ea',
      'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e'
    );
    if v_reused ->> 'action' <> 'reused'
      or v_reused ->> 'candidate_mapping_id'
        <> v_result_row.result ->> 'candidate_mapping_id'
    then
      raise exception 'Stage-F idempotent reuse failed: %', v_reused;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_ids uuid[];
  v_handoff jsonb;
begin
  select array_agg((result ->> 'candidate_mapping_id')::uuid order by occurrence_id)
  into v_ids
  from r8e_stage_f_results;
  v_handoff := public.adle_authorize_parent_approval_exact_id_handoff(
    'f0000000-0000-4000-8000-000000000012',
    'a28d4885-8328-4853-ba11-6c676619b9ea',
    'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e',
    v_ids
  );
  if coalesce((v_handoff ->> 'transitioned_count')::integer, -1) <> 7 then
    raise exception 'R8C did not hand off all seven exact Stage-F sources: %', v_handoff;
  end if;
end;
$$;

do $$
declare
  v_before r8e_stage_f_before%rowtype;
  v_after_digest text;
begin
  select * into v_before from r8e_stage_f_before;
  select md5(jsonb_build_object(
    'misspellings',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.misspelling_instances row_data
      where row_data.id in (select occurrence_id from r8e_stage_f_authority)),
    'issues',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.writing_issues row_data
      where row_data.id in (select writing_issue_id from r8e_stage_f_authority)),
    'attempts',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.writing_issue_correction_attempts row_data
      where row_data.writing_issue_id in (select writing_issue_id from r8e_stage_f_authority)),
    'cases',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.spelling_catalog_review_cases row_data
      where row_data.id in (select admin_case_id from r8e_stage_f_authority)),
    'decisions',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.spelling_catalog_review_case_decisions row_data
      where row_data.id in (select admin_decision_id from r8e_stage_f_authority)),
    'mappings',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.spelling_canonical_mappings row_data
      where row_data.id in (select canonical_mapping_id from r8e_stage_f_authority)),
    'mapping_events',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.spelling_canonical_mapping_events row_data
      where row_data.mapping_id in (select canonical_mapping_id from r8e_stage_f_authority)),
    'legacy_items',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.learning_items row_data
      where row_data.source_writing_issue_id in (select writing_issue_id from r8e_stage_f_authority)),
    'legacy_links',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.learning_item_issue_links row_data
      where row_data.writing_issue_id in (select writing_issue_id from r8e_stage_f_authority)),
    'legacy_evidence',(select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from public.learning_item_evidence row_data
      where row_data.writing_issue_id in (select writing_issue_id from r8e_stage_f_authority))
  )::text) into v_after_digest;
  if v_after_digest <> v_before.history_digest then
    raise exception 'Stage-F historical/admin rows changed during materialization.';
  end if;
  if (select count(*) from public.parent_verifications
      where metadata ->> 'r8e_stage_f_compatibility_version' = '1') <> 7
    or (select count(*) from public.parent_verified_spelling_candidate_mappings
      where metadata ->> 'route_authority' =
        'historical_stage_f_canonical_reconstruction') <> 7
    or (select count(*) from public.parent_verified_spelling_candidate_mappings
      where metadata ->> 'route_authority' =
          'historical_stage_f_canonical_reconstruction'
        and canonical_intake_handoff_state = 'r8c_exact_id_handed_off') <> 7
  then
    raise exception 'Stage-F governed-source or R8C handoff counts are not exactly seven.';
  end if;
  if (select count(*) from public.adle_canonical_intake_candidates) <> 0
    or (select count(*) from public.adle_learning_items) <> 0
    or (select count(*) from public.adle_learning_item_sources) <> 0
    or (select count(*) from public.adle_review_schedule_words) <> v_before.review_schedules
    or (select count(*) from public.adle_review_schedule_word_routes) <> v_before.review_routes
    or (select count(*) from public.daily_assignments) <> v_before.assignments
    or (select count(*) from public.adle_review_sessions) <> v_before.review_sessions
    or (select count(*) from public.adle_review_word_encounters) <> v_before.encounters
    or (select count(*) from public.adle_review_r6_child_rollouts) <> v_before.rollouts
  then
    raise exception 'Stage-F compatibility created downstream, Review, or rollout state.';
  end if;
  if has_function_privilege(
      'authenticated',
      'public.materialize_r8e_stage_f_historical_occurrence_source(uuid,uuid,uuid)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.materialize_r8e_stage_f_historical_occurrence_source(uuid,uuid,uuid)',
      'EXECUTE'
    )
  then
    raise exception 'Stage-F compatibility function ACL is not service-only.';
  end if;
end;
$$;

select 'R8E_STAGE_F_SQL_RECEIPT:' || jsonb_build_object(
  'status','PASS',
  'exact_occurrences',7,
  'new_parent_verifications',7,
  'new_governed_sources',7,
  'historical_source_rows_changed',0,
  'historical_writing_issues_changed',0,
  'admin_history_changed',0,
  'r8c_exact_id_handed_off',7,
  'canonical_intake_candidates',0,
  'adle_learning_items',0,
  'review_schedules_added',0,
  'review_routes_added',0,
  'assignments_added',0,
  'review_sessions_added',0,
  'review_encounters_added',0,
  'rollout_rows_added',0,
  'idempotent_reuse',true,
  'normal_r8b_rejection_preserved',true,
  'authenticated_execute',false,
  'service_role_exact_allowlist_only',true
)::text;

rollback;
