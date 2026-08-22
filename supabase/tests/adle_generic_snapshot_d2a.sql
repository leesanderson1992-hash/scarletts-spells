begin;

create table public.d2a_snapshot_concurrency_inputs (
  case_key text primary key,
  plan_date date not null,
  header jsonb not null,
  items jsonb not null,
  snapshot jsonb not null
);

do $proof$
declare
  v_parent constant uuid := 'd2a00000-0000-4000-8000-000000000001';
  v_child constant uuid := 'd2a00000-0000-4000-8000-000000000002';
  v_header jsonb;
  v_items jsonb;
  v_snapshot jsonb;
  v_changed jsonb;
  v_concurrent_snapshot jsonb;
  v_concurrent_header jsonb;
  v_concurrent_items jsonb;
  v_v2_header jsonb;
  v_v2_items jsonb;
  v_v2_snapshot jsonb;
  v_id uuid;
  v_retry_id uuid;
  v_before_assignments integer;
  v_before_items integer;
begin
  if has_function_privilege('anon', 'public.persist_adle_generic_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.persist_adle_generic_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.persist_adle_generic_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE')
  then
    raise exception 'D2A v3 RPC grants are not service-role-only';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_parent,
    'authenticated', 'authenticated', 'd2a-parent@example.test', '',
    timezone('utc', now()), '{}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now())
  );
  insert into public.children (id, parent_user_id, first_name)
  values (v_child, v_parent, 'D2A');

  v_header := jsonb_build_object(
    'childId', v_child, 'parentUserId', v_parent,
    'assignmentDate', '2099-01-03', 'title', 'ADLE Daily Plan',
    'status', 'pending', 'targetWords', jsonb_build_array('proof'),
    'reviewWords', '[]'::jsonb, 'assignmentGenerationSource', 'adle_composer_v1',
    'lessonRouteMetadata', jsonb_build_object(
      'metadataSchemaVersion', 1,
      'route', jsonb_build_object('routeId', 'generic_composer', 'routeVersion', 'v1'),
      'recipe', jsonb_build_object('recipeKey', 'generic_first_exposure', 'recipeVersion', 'v1'),
      'payload', jsonb_build_object('kind', 'composed_daily_plan', 'version', 1)
    )
  );
  v_items := jsonb_build_array(jsonb_build_object(
    'childId', v_child, 'parentUserId', v_parent,
    'domainModule', 'spelling', 'itemType', 'adle_lesson',
    'sourceType', 'adle_composer', 'sourceEntityId', 'd2a:v3:item:1',
    'templateKey', 'd2a_structural_proof', 'targetWord', 'proof',
    'position', 1, 'status', 'ready',
    'promptData', jsonb_build_object('structuralProof', true),
    'metadata', jsonb_build_object('planDate', '2099-01-03', 'sectionKey', 'lesson')
  ));
  v_snapshot := jsonb_build_object(
    'snapshotSchemaVersion', 3,
    'compilerVersion', 'adle_generic_canonical_snapshot_compiler_v3',
    'validatorVersion', 'adle_generic_canonical_snapshot_validator_v3',
    'canonicalContractRegistryVersion', 'adle_generic_canonical_contracts_v1',
    'route', jsonb_build_object('routeId', 'generic_composer', 'routeVersion', 'v1'),
    'recipe', jsonb_build_object('recipeKey', 'generic_first_exposure', 'recipeVersion', 'v1'),
    'payload', jsonb_build_object('kind', 'composed_daily_plan', 'version', 1),
    'runtime', jsonb_build_object('adapterKey', 'generic_composer_v1', 'rendererKey', 'canonical_activity_host_v1'),
    'assignment', jsonb_build_object('generationSource', 'adle_composer_v1', 'itemCount', 1),
    'taxonomy', jsonb_build_object('lesson', null, 'reviewFamilyKeys', '[]'::jsonb, 'reviewMicroSkillKeys', '[]'::jsonb),
    'words', '[]'::jsonb,
    'activities', jsonb_build_array(jsonb_build_object(
      'contractVersion', 3, 'activityId', 'd2a-v3-activity-1',
      'label', 'Durable structural proof', 'order', 1, 'part', 'lesson',
      'sectionKey', 'lesson',
      'canonical', jsonb_build_object('concept', 'STRUCTURAL_ONLY_NOT_APPLICATION_AUTHORISED', 'mode', 'proof', 'contractVersion', 1),
      'payload', '{}'::jsonb,
      'itemBinding', jsonb_build_object('sourceEntityId', 'd2a:v3:item:1', 'position', 1, 'inputSource', 'assignment_items.prompt_data'),
      'wordSnapshotIds', '[]'::jsonb, 'contentVersionRefs', '[]'::jsonb,
      'condition', jsonb_build_object('kind', 'always'),
      'answerVisibility', 'teaching', 'evidence', '{}'::jsonb,
      'completion', jsonb_build_object('binding', 'part_submission', 'part', 'lesson'),
      'scheduleRole', 'none', 'rewardRole', 'none'
    )),
    'segments', jsonb_build_array(
      jsonb_build_object('segmentId', 'review', 'wordSnapshotIds', '[]'::jsonb, 'activityIds', '[]'::jsonb),
      jsonb_build_object('segmentId', 'lesson', 'wordSnapshotIds', '[]'::jsonb, 'activityIds', jsonb_build_array('d2a-v3-activity-1'))
    ),
    'contentVersions', '[]'::jsonb,
    'provenance', jsonb_build_object(
      'sourceKind', 'compiled_generic_canonical_assignment',
      'fingerprintAlgorithm', 'sha256', 'fingerprintVersion', 1,
      'sourceFingerprint', repeat('0', 64)
    )
  );
  v_snapshot := jsonb_set(
    v_snapshot,
    '{provenance,sourceFingerprint}',
    to_jsonb(public.adle_canonical_json_sha256_v1(v_snapshot #- '{provenance,sourceFingerprint}'))
  );
  if not public.adle_generic_lesson_snapshot_is_structurally_valid_v3(v_snapshot) then
    raise exception 'D2A valid durable v3 fixture was rejected';
  end if;

  v_concurrent_snapshot := jsonb_set(
    v_snapshot, '{activities,0,itemBinding,sourceEntityId}',
    to_jsonb('d2a:v3:concurrent:1'::text)
  );
  v_concurrent_snapshot := jsonb_set(
    v_concurrent_snapshot, '{provenance,sourceFingerprint}',
    to_jsonb(public.adle_canonical_json_sha256_v1(v_concurrent_snapshot #- '{provenance,sourceFingerprint}'))
  );
  v_concurrent_header := jsonb_set(v_header, '{assignmentDate}', to_jsonb('2099-01-06'::text));
  v_concurrent_items := jsonb_set(v_items, '{0,metadata,planDate}', to_jsonb('2099-01-06'::text));
  v_concurrent_items := jsonb_set(v_concurrent_items, '{0,sourceEntityId}', to_jsonb('d2a:v3:concurrent:1'::text));
  insert into public.d2a_snapshot_concurrency_inputs (case_key, plan_date, header, items, snapshot)
  values ('identical', '2099-01-06', v_concurrent_header, v_concurrent_items, v_concurrent_snapshot);

  v_concurrent_header := jsonb_set(v_header, '{assignmentDate}', to_jsonb('2099-01-07'::text));
  v_concurrent_items := jsonb_set(v_items, '{0,metadata,planDate}', to_jsonb('2099-01-07'::text));
  v_concurrent_items := jsonb_set(v_concurrent_items, '{0,sourceEntityId}', to_jsonb('d2a:v3:conflict:1'::text));
  v_concurrent_snapshot := jsonb_set(
    v_snapshot, '{activities,0,itemBinding,sourceEntityId}',
    to_jsonb('d2a:v3:conflict:1'::text)
  );
  v_concurrent_snapshot := jsonb_set(
    v_concurrent_snapshot, '{provenance,sourceFingerprint}',
    to_jsonb(public.adle_canonical_json_sha256_v1(v_concurrent_snapshot #- '{provenance,sourceFingerprint}'))
  );
  insert into public.d2a_snapshot_concurrency_inputs (case_key, plan_date, header, items, snapshot)
  values ('conflict-a', '2099-01-07', v_concurrent_header, v_concurrent_items, v_concurrent_snapshot);
  v_concurrent_snapshot := jsonb_set(
    v_concurrent_snapshot, '{activities,0,label}', to_jsonb('Concurrent conflicting content'::text)
  );
  v_concurrent_snapshot := jsonb_set(
    v_concurrent_snapshot, '{provenance,sourceFingerprint}',
    to_jsonb(public.adle_canonical_json_sha256_v1(v_concurrent_snapshot #- '{provenance,sourceFingerprint}'))
  );
  insert into public.d2a_snapshot_concurrency_inputs (case_key, plan_date, header, items, snapshot)
  values ('conflict-b', '2099-01-07', v_concurrent_header, v_concurrent_items, v_concurrent_snapshot);

  v_id := public.persist_adle_generic_daily_plan_v3(
    v_parent, v_child, '2099-01-03', v_header, v_items, '[]'::jsonb, v_snapshot
  );
  v_retry_id := public.persist_adle_generic_daily_plan_v3(
    v_parent, v_child, '2099-01-03', v_header, v_items, '[]'::jsonb, v_snapshot
  );
  if v_id is distinct from v_retry_id then
    raise exception 'D2A identical v3 retry changed assignment identity';
  end if;
  if (select compiled_lesson_snapshot->>'snapshotSchemaVersion' from public.daily_assignments where id = v_id) <> '3'
    or (select count(*) from public.assignment_items where daily_assignment_id = v_id) <> 1
  then
    raise exception 'D2A v3 assignment/item/snapshot transaction is incomplete';
  end if;

  select count(*) into v_before_assignments from public.daily_assignments;
  select count(*) into v_before_items from public.assignment_items;
  begin
    perform public.persist_adle_generic_daily_plan_v3(
      v_parent, v_child, '2099-01-03', v_header, v_items, '[]'::jsonb,
      jsonb_set(v_snapshot, '{provenance,sourceFingerprint}', to_jsonb(repeat('f', 64)))
    );
    raise exception 'D2A_EXPECTED_FINGERPRINT_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'D2A_EXPECTED_FINGERPRINT_REJECTION_MISSING' then raise; end if;
  end;
  begin
    perform public.persist_adle_generic_daily_plan_v3(
      v_parent, v_child, '2099-01-03', v_header,
      jsonb_set(v_items, '{0,childId}', to_jsonb('d2a00000-0000-4000-8000-000000000099'::text)),
      '[]'::jsonb, v_snapshot
    );
    raise exception 'D2A_EXPECTED_IDENTITY_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'D2A_EXPECTED_IDENTITY_REJECTION_MISSING' then raise; end if;
  end;
  begin
    perform public.persist_adle_generic_daily_plan_v3(
      v_parent, v_child, '2099-01-03', v_header,
      jsonb_set(v_items, '{0,sourceEntityId}', to_jsonb('d2a:v3:mismatch'::text)),
      '[]'::jsonb, v_snapshot
    );
    raise exception 'D2A_EXPECTED_BINDING_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'D2A_EXPECTED_BINDING_REJECTION_MISSING' then raise; end if;
  end;
  if (select count(*) from public.daily_assignments) <> v_before_assignments
    or (select count(*) from public.assignment_items) <> v_before_items
  then
    raise exception 'D2A malformed v3 write left partial state';
  end if;

  v_changed := jsonb_set(v_snapshot, '{activities,0,label}', to_jsonb('Different durable content'::text));
  v_changed := jsonb_set(
    v_changed, '{provenance,sourceFingerprint}',
    to_jsonb(public.adle_canonical_json_sha256_v1(v_changed #- '{provenance,sourceFingerprint}'))
  );
  begin
    perform public.persist_adle_generic_daily_plan_v3(
      v_parent, v_child, '2099-01-03', v_header, v_items, '[]'::jsonb, v_changed
    );
    raise exception 'D2A_EXPECTED_IDEMPOTENCY_CONFLICT_MISSING';
  exception when others then
    if sqlerrm = 'D2A_EXPECTED_IDEMPOTENCY_CONFLICT_MISSING' then raise; end if;
  end;
  begin
    update public.daily_assignments
    set compiled_lesson_snapshot = v_changed
    where id = v_id;
    raise exception 'D2A_EXPECTED_IMMUTABILITY_REJECTION_MISSING';
  exception when others then
    if sqlerrm = 'D2A_EXPECTED_IMMUTABILITY_REJECTION_MISSING' then raise; end if;
  end;

  v_v2_header := jsonb_set(v_header, '{assignmentDate}', to_jsonb('2099-01-04'::text));
  v_v2_items := jsonb_set(v_items, '{0,metadata,planDate}', to_jsonb('2099-01-04'::text));
  v_v2_items := jsonb_set(v_v2_items, '{0,sourceEntityId}', to_jsonb('d2a:v2:item:1'::text));
  v_v2_snapshot := jsonb_build_object(
    'snapshotSchemaVersion', 2, 'compilerVersion', 'adle_generic_snapshot_compiler_v2',
    'validatorVersion', 'adle_generic_snapshot_validator_v2',
    'requirementRegistryVersion', 'adle_generic_activity_requirements_v2',
    'route', jsonb_build_object('routeId', 'generic_composer', 'routeVersion', 'v1'),
    'recipe', jsonb_build_object('recipeKey', 'generic_first_exposure', 'recipeVersion', 'v1'),
    'payload', jsonb_build_object('kind', 'composed_daily_plan', 'version', 1),
    'runtime', jsonb_build_object('adapterKey', 'generic_composer_v1', 'rendererKey', 'generic_session'),
    'assignment', jsonb_build_object('generationSource', 'adle_composer_v1', 'itemCount', 1),
    'taxonomy', jsonb_build_object('lesson', null, 'reviewFamilyKeys', '[]'::jsonb, 'reviewMicroSkillKeys', '[]'::jsonb),
    'words', '[]'::jsonb,
    'activities', jsonb_build_array(jsonb_build_object(
      'order', 1, 'sectionKey', 'lesson', 'templateKey', 'd2a_structural_proof',
      'itemBinding', jsonb_build_object('sourceEntityId', 'd2a:v2:item:1', 'position', 1)
    )),
    'segments', jsonb_build_array('{}'::jsonb, '{}'::jsonb),
    'contentVersions', '[]'::jsonb,
    'provenance', jsonb_build_object(
      'sourceKind', 'compiled_generic_assignment', 'fingerprintAlgorithm', 'sha256',
      'fingerprintVersion', 1, 'sourceFingerprint', repeat('a', 64)
    )
  );
  perform public.persist_adle_generic_daily_plan_v2(
    v_parent, v_child, '2099-01-04', v_v2_header, v_v2_items, '[]'::jsonb, v_v2_snapshot
  );
  if (select count(*) from public.daily_assignments where compiled_lesson_snapshot->>'snapshotSchemaVersion' = '2') <> 1
    or (select count(*) from public.daily_assignments where compiled_lesson_snapshot->>'snapshotSchemaVersion' = '3') <> 1
  then
    raise exception 'D2A v2/v3 coexistence proof failed';
  end if;

  insert into public.daily_assignments (
    child_id, parent_user_id, assignment_date, title, status,
    assignment_generation_source, lesson_route_metadata, compiled_lesson_snapshot
  ) values (
    v_child, v_parent, '2099-01-05', 'ADLE Specialist Proof', 'pending',
    'adle_base_word_family_pilot_v1', null, null
  );
  if not exists (
    select 1 from public.daily_assignments
    where title = 'ADLE Specialist Proof' and compiled_lesson_snapshot is null
  ) then
    raise exception 'D2A snapshot-null specialist behavior changed';
  end if;
end
$proof$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2a00000-0000-4000-8000-000000000001', true);
do $rls$
begin
  if (select count(*) from public.daily_assignments where assignment_date between '2099-01-03' and '2099-01-05') <> 3 then
    raise exception 'D2A parent-scoped assignment read failed';
  end if;
end
$rls$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2a00000-0000-4000-8000-000000000099', true);
do $rls$
begin
  if exists (select 1 from public.daily_assignments where assignment_date between '2099-01-03' and '2099-01-05') then
    raise exception 'D2A RLS exposed another parent assignment';
  end if;
end
$rls$;
reset role;

commit;

select 'PASS: D2A local SQL persistence, rollback, coexistence, immutability, grants, and RLS' as result;
