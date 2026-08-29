begin;

do $proof$
declare
  v_parent constant uuid := 'e7b00000-0000-4000-8000-000000000001';
  v_child constant uuid := 'e7b00000-0000-4000-8000-000000000002';
  v_header jsonb;
  v_items jsonb;
  v_snapshot jsonb;
  v_assignment uuid;
  v_replay uuid;
  v_specialist_rejected boolean := false;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_parent,
    'authenticated', 'authenticated', 'e7b-parent@example.test', '',
    timezone('utc', now()), '{}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now())
  );
  insert into public.children (id, parent_user_id, first_name)
  values (v_child, v_parent, 'E7B disposable proof');

  v_header := jsonb_build_object(
    'childId', v_child, 'parentUserId', v_parent,
    'assignmentDate', '2099-07-07', 'title', 'ADLE Daily Plan',
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
    'sourceType', 'adle_composer', 'sourceEntityId', 'e7b:v3:item:1',
    'templateKey', 'e7b_structural_proof', 'targetWord', 'proof',
    'position', 1, 'status', 'ready',
    'promptData', jsonb_build_object('structuralProof', true),
    'metadata', jsonb_build_object('planDate', '2099-07-07', 'sectionKey', 'lesson')
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
      'contractVersion', 3, 'activityId', 'e7b-v3-activity-1',
      'label', 'Durable structural proof', 'order', 1, 'part', 'lesson',
      'sectionKey', 'lesson',
      'canonical', jsonb_build_object('concept', 'STRUCTURAL_ONLY_NOT_APPLICATION_AUTHORISED', 'mode', 'proof', 'contractVersion', 1),
      'payload', '{}'::jsonb,
      'itemBinding', jsonb_build_object('sourceEntityId', 'e7b:v3:item:1', 'position', 1, 'inputSource', 'assignment_items.prompt_data'),
      'wordSnapshotIds', '[]'::jsonb, 'contentVersionRefs', '[]'::jsonb,
      'condition', jsonb_build_object('kind', 'always'),
      'answerVisibility', 'teaching', 'evidence', '{}'::jsonb,
      'completion', jsonb_build_object('binding', 'part_submission', 'part', 'lesson'),
      'scheduleRole', 'none', 'rewardRole', 'none'
    )),
    'segments', jsonb_build_array(
      jsonb_build_object('segmentId', 'review', 'wordSnapshotIds', '[]'::jsonb, 'activityIds', '[]'::jsonb),
      jsonb_build_object('segmentId', 'lesson', 'wordSnapshotIds', '[]'::jsonb, 'activityIds', jsonb_build_array('e7b-v3-activity-1'))
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

  if not public.adle_generic_lesson_snapshot_is_structurally_valid_v3(v_snapshot)
     or not public.adle_lesson_snapshot_is_structurally_valid(v_snapshot)
  then
    raise exception 'Phase E7B current v3 aggregate/generic validation failed';
  end if;

  v_assignment := public.persist_adle_generic_daily_plan_v3(
    v_parent, v_child, '2099-07-07', v_header, v_items, '[]'::jsonb, v_snapshot
  );
  v_replay := public.persist_adle_generic_daily_plan_v3(
    v_parent, v_child, '2099-07-07', v_header, v_items, '[]'::jsonb, v_snapshot
  );
  if v_assignment is distinct from v_replay
     or (select compiled_lesson_snapshot->>'snapshotSchemaVersion' from public.daily_assignments where id = v_assignment) <> '3'
     or (select count(*) from public.assignment_items where daily_assignment_id = v_assignment) <> 1
  then
    raise exception 'Phase E7B current generic v3 atomic writer failed';
  end if;

  begin
    perform public.persist_adle_specialist_daily_plan_v3(
      v_parent, 'e7b00000-0000-4000-8000-000000000099', '2099-07-08',
      '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
    );
  exception when others then
    if sqlerrm = 'ADLE specialist v3 child ownership validation failed' then
      v_specialist_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_specialist_rejected then
    raise exception 'Phase E7B specialist v3 authority did not execute its fail-closed ownership guard';
  end if;

  if to_regprocedure('public.complete_adle_base_word_family_pilot_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)') is null
     or to_regprocedure('public.complete_adle_base_word_family_pilot_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)') is null
     or to_regprocedure('public.complete_adle_release_bound_word_lab_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)') is null
  then
    raise exception 'Phase E7B protected historical/current completion authority is missing';
  end if;
end
$proof$;

rollback;
