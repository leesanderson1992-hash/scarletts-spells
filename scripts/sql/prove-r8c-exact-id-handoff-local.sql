\set ON_ERROR_STOP on

begin;

create or replace function public.r8c_expect_error(
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
grant execute on function public.r8c_expect_error(text,text)
  to authenticated, service_role;
-- pg_dump omits ACLs in the disposable clone. These reproduce the production
-- table grants so RLS/trigger protection is exercised rather than stubbed.
grant select,update on public.parent_verified_spelling_candidate_mappings
  to authenticated, service_role;

set local session_replication_role = replica;

insert into auth.users(id,email,role,aud,created_at,updated_at)
values (
  '10000000-0000-4000-8000-000000000001',
  'r8c-parent@example.invalid','authenticated','authenticated',
  timezone('utc',now()),timezone('utc',now())
);

insert into public.children(id,parent_user_id,first_name)
values (
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'R8C Fixture'
);

insert into public.micro_skill_catalog (
  id,mastery_domain_key,skill_family_key,skill_cluster_key,micro_skill_key,
  display_name,practice_route,is_assignable,is_active
) values
  (
    '10000000-0000-4000-8000-000000000801','D4','D4_MOR',
    'D4_MOR_COMPOUND_WORDS','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS',
    'Closed compounds','grouped_set_practice',true,true
  ),
  (
    '10000000-0000-4000-8000-000000000802','D4','D4_MOR',
    'D4_MOR_PREFIXES','D4_MOR_PREFIXES_RE_PRE',
    're-/pre- prefixes','grouped_set_practice',true,true
  );

insert into public.task_submissions (
  id,task_id,course_id,child_id,parent_user_id,submission_text,
  parent_review_status,parent_reviewed_at
) values
  (
    '10000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000012',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'R8C original four-word fixture','approved',timezone('utc',now())
  ),
  (
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000012',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'R8C returned correction fixture','approved',timezone('utc',now())
  ),
  (
    '20000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000012',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'R8C later evidence fixture','approved',timezone('utc',now())
  );

insert into public.writing_samples (
  id,child_id,parent_user_id,title,sample_text,task_submission_id
) values
  (
    '10000000-0000-4000-8000-000000000901',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'R8C four-word sample','futball ranebow riplay rinew',
    '10000000-0000-4000-8000-000000000009'
  ),
  (
    '20000000-0000-4000-8000-000000000901',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'R8C later sample','reeplay',
    '20000000-0000-4000-8000-000000000010'
  );

insert into public.misspelling_instances (
  id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word
) values
  ('10000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','futball','football'),
  ('10000000-0000-4000-8000-000000000202','10000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','ranebow','rainbow'),
  ('10000000-0000-4000-8000-000000000203','10000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','riplay','replay'),
  ('10000000-0000-4000-8000-000000000204','10000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','rinew','renew'),
  ('20000000-0000-4000-8000-000000000201','20000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','reeplay','replay'),
  ('30000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','extrra','extra');

insert into public.writing_issues (
  id,child_id,parent_user_id,task_submission_id,
  source_misspelling_instance_id,issue_status,final_classification,
  observed_text,suggested_replacement,approved_replacement,micro_skill_key,
  final_classified_at
) values
  (
    '10000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000201',
    'finalised','concept_gap','futball','football','football',
    'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS',timezone('utc',now())
  ),
  (
    '10000000-0000-4000-8000-000000000102',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000202',
    'finalised','concept_gap','ranebow','rainbow','rainbow',
    'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS',timezone('utc',now())
  ),
  (
    '10000000-0000-4000-8000-000000000103',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000203',
    'finalised','concept_gap','riplay','replay','replay',
    'D4_MOR_PREFIXES_RE_PRE',timezone('utc',now())
  ),
  (
    '10000000-0000-4000-8000-000000000104',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000204',
    'finalised','concept_gap','rinew','renew','renew',
    'D4_MOR_PREFIXES_RE_PRE',timezone('utc',now())
  ),
  (
    '20000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000201',
    'finalised','concept_gap','reeplay','replay','replay',
    'D4_MOR_PREFIXES_RE_PRE',timezone('utc',now())
  );

insert into public.writing_issue_correction_attempts (
  id,writing_issue_id,child_id,parent_user_id,task_submission_id,
  attempted_correction,reflection
) values
  ('10000000-0000-4000-8000-000000000501','10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010','football','medium'),
  ('10000000-0000-4000-8000-000000000502','10000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010','rainbow','medium'),
  ('10000000-0000-4000-8000-000000000503','10000000-0000-4000-8000-000000000103','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010','replay','medium'),
  ('10000000-0000-4000-8000-000000000504','10000000-0000-4000-8000-000000000104','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010','renew','medium'),
  ('20000000-0000-4000-8000-000000000501','20000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000010','replay','medium');

insert into public.parent_verifications (
  id,child_id,parent_user_id,domain_module,source_type,source_entity_id,decision
) values
  ('10000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','spelling','authentic_writing','r8c-football','accepted'),
  ('10000000-0000-4000-8000-000000000402','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','spelling','authentic_writing','r8c-rainbow','accepted'),
  ('10000000-0000-4000-8000-000000000403','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','spelling','authentic_writing','r8c-replay','accepted'),
  ('10000000-0000-4000-8000-000000000404','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','spelling','authentic_writing','r8c-renew','accepted'),
  ('20000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','spelling','authentic_writing','r8c-later-replay','accepted'),
  ('30000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','spelling','authentic_writing','r8c-extra','accepted');

insert into public.parent_verified_spelling_candidate_mappings (
  id,parent_user_id,child_id,parent_verification_id,task_submission_id,
  source_misspelling_instance_id,source_provenance,
  reviewed_event_source_entity_id,misspelling_normalized,
  correct_spelling_normalized,micro_skill_key,candidate_status,promotion_scope,
  canonical_intake_handoff_state
) values
  ('10000000-0000-4000-8000-000000000301','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000201','lesson_submission_parent_added_missed_word','r8c-football','futball','football','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','parent_local_promoted','parent_local','awaiting_r8c_exact_id_handoff'),
  ('10000000-0000-4000-8000-000000000302','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000402','10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000202','lesson_submission_parent_added_missed_word','r8c-rainbow','ranebow','rainbow','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','parent_local_promoted','parent_local',null),
  ('10000000-0000-4000-8000-000000000303','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000403','10000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000203','lesson_submission_parent_added_missed_word','r8c-replay','riplay','replay','D4_MOR_PREFIXES_RE_PRE','parent_local_promoted','parent_local','awaiting_r8c_exact_id_handoff'),
  ('10000000-0000-4000-8000-000000000304','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000404','10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000204','lesson_submission_parent_added_missed_word','r8c-renew','rinew','renew','D4_MOR_PREFIXES_RE_PRE','parent_local_promoted','parent_local',null),
  ('20000000-0000-4000-8000-000000000301','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000201','lesson_submission_parent_added_missed_word','r8c-later-replay','reeplay','replay','D4_MOR_PREFIXES_RE_PRE','parent_local_promoted','parent_local','awaiting_r8c_exact_id_handoff'),
  ('30000000-0000-4000-8000-000000000301','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000201','lesson_submission_parent_added_missed_word','r8c-extra','extrra','extra','D4_MOR_PREFIXES_RE_PRE','parent_local_promoted','parent_local','awaiting_r8c_exact_id_handoff');

-- The READY persistence proof uses the released Prefix route, which requires
-- an assignment-approved canonical word but no release-manifest fixture.
insert into public.canonical_teaching_dictionary_words (
  id,import_batch_id,source_sheet,source_row_number,source_row_hash,
  word_key,normalised_word,display_word,source_category,confidence,review_status,
  row_status
) values (
  '10000000-0000-4000-8000-000000000601',
  '10000000-0000-4000-8000-000000000602',
  'r8c_fixture',2,repeat('a',64),'replay','replay','replay','internal_reviewed_seed','high',
  'approved_for_first_exposure','active'
);

insert into public.spelling_canonical_mappings (
  id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,
  created_by_admin_user_id,mapping_status,resolver_visibility_status
) values
  ('10000000-0000-4000-8000-000000000701','riplay','replay','D4_MOR_PREFIXES_RE_PRE','10000000-0000-4000-8000-000000000001','active','visible'),
  ('20000000-0000-4000-8000-000000000701','reeplay','replay','D4_MOR_PREFIXES_RE_PRE','10000000-0000-4000-8000-000000000001','active','visible');

set local session_replication_role = origin;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.adle_authorize_parent_approval_exact_id_handoff(uuid,uuid,uuid,uuid[])',
    'execute'
  ) then
    raise exception 'authenticated role can execute the trusted R8C handoff';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.adle_authorize_parent_approval_exact_id_handoff(uuid,uuid,uuid,uuid[])',
    'execute'
  ) then
    raise exception 'service_role cannot execute the trusted R8C handoff';
  end if;
end $$;

-- Quarantine remains authoritative before exact-ID authorization.
select public.r8c_expect_error(
  $$select public.adle_seed_canonical_intake_candidate(
    '10000000-0000-4000-8000-000000000301','football',
    'compound_word_lab','v2','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','r8c:pre'
  )$$,
  'quarantined pending R8C exact-ID handoff'
);
select public.r8c_expect_error(
  $$insert into public.adle_canonical_intake_candidates(
    source_candidate_mapping_id,child_id,normalized_target_token,
    target_identity_status,route_id,route_version,micro_skill_key
  ) values (
    '10000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000002','football','established',
    'compound_word_lab','v2','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'
  )$$,
  'quarantined pending R8C exact-ID handoff'
);
select public.r8c_expect_error(
  $$insert into public.adle_learning_item_sources(
    learning_item_id,parent_verified_candidate_mapping_id,
    misspelling_normalized,correct_spelling_normalized,micro_skill_key,
    source_ref
  ) values (
    '90000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000301',
    'futball','football','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS',
    'r8c:direct-lineage-bypass'
  )$$,
  'quarantined pending R8C exact-ID handoff'
);
select public.r8c_expect_error(
  $$update public.parent_verified_spelling_candidate_mappings
    set canonical_intake_handoff_state = null
    where id = '10000000-0000-4000-8000-000000000301'$$,
  'no authorised transition'
);

-- Authenticated parents cannot self-authorise even though production grants
-- them row UPDATE under parent-owned RLS.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
do $$
begin
  begin
    update public.parent_verified_spelling_candidate_mappings
    set canonical_intake_handoff_state = 'r8c_exact_id_handed_off'
    where id = '10000000-0000-4000-8000-000000000301';
  exception when others then
    if position('server-controlled' in sqlerrm) = 0 then
      raise;
    end if;
  end;
end $$;
reset role;

do $$
begin
  if not exists (
    select 1 from public.parent_verified_spelling_candidate_mappings
    where id = '10000000-0000-4000-8000-000000000301'
      and canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff'
  ) then
    raise exception 'authenticated parent changed trusted R8C handoff state';
  end if;
end $$;

-- Service role cannot update the relational state directly or invoke the
-- renamed unguarded R8B delegate.
set local role service_role;
select public.r8c_expect_error(
  $$update public.parent_verified_spelling_candidate_mappings
    set canonical_intake_handoff_state = 'r8c_exact_id_handed_off'
    where id = '10000000-0000-4000-8000-000000000301'$$,
  'server-controlled'
);
select public.r8c_expect_error(
  $$select public.adle_seed_canonical_intake_candidate_r8b_delegate(
    '10000000-0000-4000-8000-000000000301','football',
    'compound_word_lab','v2','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS',
    'r8c:delegate-bypass'
  )$$,
  'permission denied'
);
reset role;

-- Existing pre-R8B/legacy NULL sources retain their current intake contract.
set local role service_role;
select public.adle_seed_canonical_intake_candidate(
  '10000000-0000-4000-8000-000000000302','rainbow',
  'compound_word_lab','v2','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','r8c:legacy'
);
reset role;

-- Missing, extra and duplicate IDs fail before any transition.
set local role service_role;
select public.r8c_expect_error(
  $$select public.adle_authorize_parent_approval_exact_id_handoff(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    array[
      '10000000-0000-4000-8000-000000000301'::uuid,
      '10000000-0000-4000-8000-000000000303'::uuid
    ]
  )$$,
  'exactly match the governed approval source set'
);
select public.r8c_expect_error(
  $$select public.adle_authorize_parent_approval_exact_id_handoff(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    array[
      '10000000-0000-4000-8000-000000000301'::uuid,
      '10000000-0000-4000-8000-000000000302'::uuid,
      '10000000-0000-4000-8000-000000000303'::uuid,
      '10000000-0000-4000-8000-000000000304'::uuid,
      '30000000-0000-4000-8000-000000000301'::uuid
    ]
  )$$,
  'exactly match the governed approval source set'
);
select public.r8c_expect_error(
  $$select public.adle_authorize_parent_approval_exact_id_handoff(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    array[
      '10000000-0000-4000-8000-000000000301'::uuid,
      '10000000-0000-4000-8000-000000000301'::uuid
    ]
  )$$,
  'must be unique'
);
reset role;

-- Every stale or conflicting approval identity fails atomically. The fixture
-- is restored between probes so the eventual successful call exercises the
-- original approval receipt exactly.
update public.parent_verified_spelling_candidate_mappings
set candidate_status = 'superseded'
where id = '10000000-0000-4000-8000-000000000301';
set local role service_role;
select public.r8c_expect_error(
  $$select public.adle_authorize_parent_approval_exact_id_handoff(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    array[
      '10000000-0000-4000-8000-000000000301'::uuid,
      '10000000-0000-4000-8000-000000000302'::uuid,
      '10000000-0000-4000-8000-000000000303'::uuid,
      '10000000-0000-4000-8000-000000000304'::uuid
    ]
  )$$,
  'exactly match the governed approval source set'
);
reset role;
update public.parent_verified_spelling_candidate_mappings
set candidate_status = 'parent_local_promoted'
where id = '10000000-0000-4000-8000-000000000301';

update public.parent_verified_spelling_candidate_mappings
set candidate_status = 'rejected'
where id = '10000000-0000-4000-8000-000000000301';
set local role service_role;
select public.r8c_expect_error(
  $$select public.adle_authorize_parent_approval_exact_id_handoff(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    array[
      '10000000-0000-4000-8000-000000000301'::uuid,
      '10000000-0000-4000-8000-000000000302'::uuid,
      '10000000-0000-4000-8000-000000000303'::uuid,
      '10000000-0000-4000-8000-000000000304'::uuid
    ]
  )$$,
  'exactly match the governed approval source set'
);
reset role;
update public.parent_verified_spelling_candidate_mappings
set candidate_status = 'parent_local_promoted'
where id = '10000000-0000-4000-8000-000000000301';

update public.writing_issues
set approved_replacement = 'footballs'
where id = '10000000-0000-4000-8000-000000000101';
set local role service_role;
select public.r8c_expect_error(
  $$select public.adle_authorize_parent_approval_exact_id_handoff(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    array[
      '10000000-0000-4000-8000-000000000301'::uuid,
      '10000000-0000-4000-8000-000000000302'::uuid,
      '10000000-0000-4000-8000-000000000303'::uuid,
      '10000000-0000-4000-8000-000000000304'::uuid
    ]
  )$$,
  'source identity or final learning intent changed'
);
reset role;
update public.writing_issues
set approved_replacement = 'football'
where id = '10000000-0000-4000-8000-000000000101';

update public.writing_issues
set micro_skill_key = 'D4_MOR_PREFIXES_RE_PRE'
where id = '10000000-0000-4000-8000-000000000101';
set local role service_role;
select public.r8c_expect_error(
  $$select public.adle_authorize_parent_approval_exact_id_handoff(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    array[
      '10000000-0000-4000-8000-000000000301'::uuid,
      '10000000-0000-4000-8000-000000000302'::uuid,
      '10000000-0000-4000-8000-000000000303'::uuid,
      '10000000-0000-4000-8000-000000000304'::uuid
    ]
  )$$,
  'source identity or final learning intent changed'
);
reset role;
update public.writing_issues
set micro_skill_key = 'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'
where id = '10000000-0000-4000-8000-000000000101';

set local session_replication_role = replica;
update public.writing_issues
set final_classification = 'not_an_issue'
where id = '10000000-0000-4000-8000-000000000101';
set local session_replication_role = origin;
set local role service_role;
select public.r8c_expect_error(
  $$select public.adle_authorize_parent_approval_exact_id_handoff(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    array[
      '10000000-0000-4000-8000-000000000301'::uuid,
      '10000000-0000-4000-8000-000000000302'::uuid,
      '10000000-0000-4000-8000-000000000303'::uuid,
      '10000000-0000-4000-8000-000000000304'::uuid
    ]
  )$$,
  'exactly match the governed approval source set'
);
reset role;
set local session_replication_role = replica;
update public.writing_issues
set final_classification = 'concept_gap'
where id = '10000000-0000-4000-8000-000000000101';
set local session_replication_role = origin;

-- Caller ownership is part of the approval provenance.
set local role service_role;
select public.r8c_expect_error(
  $$select public.adle_authorize_parent_approval_exact_id_handoff(
    '10000000-0000-4000-8000-000000000010',
    '90000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    array[
      '10000000-0000-4000-8000-000000000301'::uuid,
      '10000000-0000-4000-8000-000000000302'::uuid,
      '10000000-0000-4000-8000-000000000303'::uuid,
      '10000000-0000-4000-8000-000000000304'::uuid
    ]
  )$$,
  'owning approved submission'
);
select public.r8c_expect_error(
  $$select public.adle_authorize_parent_approval_exact_id_handoff(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000002',
    array[
      '10000000-0000-4000-8000-000000000301'::uuid,
      '10000000-0000-4000-8000-000000000302'::uuid,
      '10000000-0000-4000-8000-000000000303'::uuid,
      '10000000-0000-4000-8000-000000000304'::uuid
    ]
  )$$,
  'owning approved submission'
);
reset role;

-- A source occurrence that changed after approval is not rediscovered or
-- silently substituted.
set local session_replication_role = replica;
update public.writing_issues
set source_misspelling_instance_id = '30000000-0000-4000-8000-000000000201'
where id = '10000000-0000-4000-8000-000000000101';
set local session_replication_role = origin;
set local role service_role;
select public.r8c_expect_error(
  $$select public.adle_authorize_parent_approval_exact_id_handoff(
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    array[
      '10000000-0000-4000-8000-000000000301'::uuid,
      '10000000-0000-4000-8000-000000000302'::uuid,
      '10000000-0000-4000-8000-000000000303'::uuid,
      '10000000-0000-4000-8000-000000000304'::uuid
    ]
  )$$,
  'exactly match the governed approval source set'
);
reset role;
set local session_replication_role = replica;
update public.writing_issues
set source_misspelling_instance_id = '10000000-0000-4000-8000-000000000201'
where id = '10000000-0000-4000-8000-000000000101';
set local session_replication_role = origin;

do $$
begin
  if (
    select count(*) from public.parent_verified_spelling_candidate_mappings
    where id in (
      '10000000-0000-4000-8000-000000000301',
      '10000000-0000-4000-8000-000000000303'
    ) and canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff'
  ) <> 2 then
    raise exception 'failed R8C integrity probes left a partial handoff';
  end if;
end $$;

-- A retried application transaction that rolls back leaves every transition
-- available for the next exact-ID attempt.
savepoint r8c_transaction_retry;
set local role service_role;
select public.adle_authorize_parent_approval_exact_id_handoff(
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  array[
    '10000000-0000-4000-8000-000000000301'::uuid,
    '10000000-0000-4000-8000-000000000302'::uuid,
    '10000000-0000-4000-8000-000000000303'::uuid,
    '10000000-0000-4000-8000-000000000304'::uuid
  ]
);
reset role;
rollback to savepoint r8c_transaction_retry;
release savepoint r8c_transaction_retry;

do $$
begin
  if (
    select count(*) from public.parent_verified_spelling_candidate_mappings
    where id in (
      '10000000-0000-4000-8000-000000000301',
      '10000000-0000-4000-8000-000000000303'
    ) and canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff'
  ) <> 2 then
    raise exception 'rolled-back R8C transaction leaked a handoff transition';
  end if;
end $$;

create temporary table r8c_receipts(payload jsonb);
grant insert,select on r8c_receipts to service_role;

set local role service_role;
insert into r8c_receipts(payload)
select public.adle_authorize_parent_approval_exact_id_handoff(
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  array[
    '10000000-0000-4000-8000-000000000301'::uuid,
    '10000000-0000-4000-8000-000000000302'::uuid,
    '10000000-0000-4000-8000-000000000303'::uuid,
    '10000000-0000-4000-8000-000000000304'::uuid
  ]
);
insert into r8c_receipts(payload)
select public.adle_authorize_parent_approval_exact_id_handoff(
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  array[
    '10000000-0000-4000-8000-000000000304'::uuid,
    '10000000-0000-4000-8000-000000000303'::uuid,
    '10000000-0000-4000-8000-000000000302'::uuid,
    '10000000-0000-4000-8000-000000000301'::uuid
  ]
);
reset role;

do $$
begin
  if (select count(*) from r8c_receipts) <> 2 then
    raise exception 'R8C replay returned no stable receipts';
  end if;
  if (select (payload ->> 'transitioned_count')::integer from r8c_receipts limit 1) <> 2 then
    raise exception 'R8C did not transition exactly the two R8B quarantined sources';
  end if;
  if (select (payload ->> 'transitioned_count')::integer from r8c_receipts offset 1 limit 1) <> 0 then
    raise exception 'R8C replay was not idempotent';
  end if;
  if (
    select count(*)
    from public.parent_verified_spelling_candidate_mappings
    where id in (
      '10000000-0000-4000-8000-000000000301',
      '10000000-0000-4000-8000-000000000303'
    )
      and canonical_intake_handoff_state = 'r8c_exact_id_handed_off'
  ) <> 2 then
    raise exception 'R8C handed-off state was not retained';
  end if;
  if not exists (
    select 1 from public.parent_verified_spelling_candidate_mappings
    where id = '10000000-0000-4000-8000-000000000302'
      and canonical_intake_handoff_state is null
  ) then
    raise exception 'R8C rewrote the legacy NULL handoff contract';
  end if;
  if not exists (
    select 1 from public.parent_verified_spelling_candidate_mappings
    where id = '30000000-0000-4000-8000-000000000301'
      and canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff'
  ) then
    raise exception 'same-submission candidate outside the approval result was consumed';
  end if;
end $$;

-- All four exact IDs can now seed independent intake rows. The blocked word
-- remains durable after successful handoff.
set local role service_role;
select public.adle_seed_canonical_intake_candidate('10000000-0000-4000-8000-000000000301','football','compound_word_lab','v2','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','r8c:football');
select public.adle_seed_canonical_intake_candidate('10000000-0000-4000-8000-000000000302','rainbow','compound_word_lab','v2','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','r8c:rainbow');
select public.adle_seed_canonical_intake_candidate('10000000-0000-4000-8000-000000000303','replay','dynamic_prefix_word_lab','v2','D4_MOR_PREFIXES_RE_PRE','r8c:replay');
select public.adle_seed_canonical_intake_candidate('10000000-0000-4000-8000-000000000304','renew','dynamic_prefix_word_lab','v2','D4_MOR_PREFIXES_RE_PRE','r8c:renew');
select * from public.adle_record_canonical_intake_blocked(
  '10000000-0000-4000-8000-000000000304','renew',null,'established',
  'dynamic_prefix_word_lab','v2','D4_MOR_PREFIXES_RE_PRE','pending_content',
  '[{"code":"canonical_word_missing","demandType":"teaching_content"}]'::jsonb,
  repeat('b',64),'teaching_content','canonical_word_missing'
);
select * from public.adle_persist_canonical_intake(
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000601',
  'D4_MOR_PREFIXES_RE_PRE',
  '10000000-0000-4000-8000-000000000303',
  '10000000-0000-4000-8000-000000000701',
  'riplay','replay','r8c:replay',current_date,
  'dynamic_prefix_word_lab','v2',null,null,null,null
);
reset role;

-- Later evidence is another governed source, then strengthens the same active
-- child + canonical word + micro-skill target with a second lineage row.
create temporary table r8c_later_receipt(payload jsonb);
grant insert,select on r8c_later_receipt to service_role;
set local role service_role;
insert into r8c_later_receipt(payload)
select public.adle_authorize_parent_approval_exact_id_handoff(
  '20000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  array['20000000-0000-4000-8000-000000000301'::uuid]
);
select public.adle_seed_canonical_intake_candidate(
  '20000000-0000-4000-8000-000000000301','replay',
  'dynamic_prefix_word_lab','v2','D4_MOR_PREFIXES_RE_PRE','r8c:later-replay'
);
select * from public.adle_persist_canonical_intake(
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000601',
  'D4_MOR_PREFIXES_RE_PRE',
  '20000000-0000-4000-8000-000000000301',
  '20000000-0000-4000-8000-000000000701',
  'reeplay','replay','r8c:later-replay',current_date,
  'dynamic_prefix_word_lab','v2',null,null,null,null
);
reset role;

do $$
begin
  if (
    select count(*) from public.adle_canonical_intake_candidates
    where source_candidate_mapping_id in (
      '10000000-0000-4000-8000-000000000301',
      '10000000-0000-4000-8000-000000000302',
      '10000000-0000-4000-8000-000000000303',
      '10000000-0000-4000-8000-000000000304'
    )
  ) <> 4 then
    raise exception 'four exact governed IDs did not retain four intake candidates';
  end if;
  if not exists (
    select 1 from public.adle_canonical_intake_candidates
    where source_candidate_mapping_id = '10000000-0000-4000-8000-000000000304'
      and candidate_state = 'pending_content'
      and blockers @> '[{"code":"canonical_word_missing"}]'::jsonb
  ) then
    raise exception 'canonical_word_missing blocked intake was not durable';
  end if;
  if (
    select count(*) from public.adle_learning_items
    where child_id = '10000000-0000-4000-8000-000000000002'
      and canonical_word_id = '10000000-0000-4000-8000-000000000601'
      and micro_skill_key = 'D4_MOR_PREFIXES_RE_PRE'
      and row_status = 'active'
  ) <> 1 then
    raise exception 'later same-word evidence duplicated the active ADLE target';
  end if;
  if (
    select count(*) from public.adle_learning_item_sources source
    join public.adle_learning_items item on item.id = source.learning_item_id
    where item.child_id = '10000000-0000-4000-8000-000000000002'
      and item.canonical_word_id = '10000000-0000-4000-8000-000000000601'
      and item.micro_skill_key = 'D4_MOR_PREFIXES_RE_PRE'
      and source.parent_verified_candidate_mapping_id in (
        '10000000-0000-4000-8000-000000000303',
        '20000000-0000-4000-8000-000000000301'
      )
  ) <> 2 then
    raise exception 'later same-word evidence did not retain two lineage rows';
  end if;
  if (select count(*) from public.adle_review_schedule_words) <> 0
    or (select count(*) from public.adle_review_schedule_word_routes) <> 0
    or (select count(*) from public.daily_assignments) <> 0
    or (select count(*) from public.adle_review_sessions) <> 0
    or (select count(*) from public.adle_review_word_encounters) <> 0
    or (select count(*) from public.adle_review_r6_child_rollouts) <> 0
  then
    raise exception 'R8C wrote learner-facing Review state';
  end if;
end $$;

select 'R8C_SQL_RECEIPT:' || jsonb_build_object(
  'exactFourCandidateIds', 4,
  'mixedLegacySources', 2,
  'transitionedSources', 3,
  'blockedCanonicalWordMissing', true,
  'activeReplayTargets', 1,
  'replayEvidenceSources', 2,
  'sameSubmissionExtraConsumed', false,
  'canonicalIntakeCandidatesForExactFour', 4,
  'reviewScheduleRoutes', 0,
  'reviewAssignments', 0,
  'reviewSchedules', 0,
  'reviewSessions', 0,
  'reviewEncounters', 0,
  'rolloutRows', 0,
  'unactivatedLearner', true
)::text as receipt;

rollback;
