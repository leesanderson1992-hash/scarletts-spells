-- D2A: reconcile the deliberately deferred Generic Snapshot persistence
-- baseline. This forward migration is safe from either the repository state
-- (the historical v2 migration is present) or the current Production state
-- (all snapshot objects are absent). Existing assignments remain NULL and no
-- learner row is backfilled.

begin;

do $$
declare
  v_column_exists boolean := exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_assignments'
      and column_name = 'compiled_lesson_snapshot'
  );
  v_v2_validator_exists boolean := to_regprocedure(
    'public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)'
  ) is not null;
  v_v2_rpc_exists boolean := to_regprocedure(
    'public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)'
  ) is not null;
  v_constraint_exists boolean := exists (
    select 1 from pg_constraint
    where conrelid = 'public.daily_assignments'::regclass
      and conname = 'daily_assignments_compiled_lesson_snapshot_v2_check'
  );
  v_index_exists boolean := to_regclass(
    'public.daily_assignments_compiled_snapshot_version_idx'
  ) is not null;
  v_trigger_exists boolean := exists (
    select 1 from pg_trigger
    where tgrelid = 'public.daily_assignments'::regclass
      and tgname = 'daily_assignments_compiled_lesson_snapshot_immutable'
      and not tgisinternal
  );
begin
  if to_regprocedure('public.adle_canonical_json_sha256_v1(jsonb)') is null then
    raise exception 'D2A requires adle_canonical_json_sha256_v1(jsonb)';
  end if;

  if to_regprocedure('public.adle_lesson_route_metadata_is_valid_v1(jsonb)') is null then
    raise exception 'D2A requires adle_lesson_route_metadata_is_valid_v1(jsonb)';
  end if;

  if v_column_exists then
    if not (
      v_v2_validator_exists
      and v_v2_rpc_exists
      and v_constraint_exists
      and v_index_exists
      and v_trigger_exists
    ) then
      raise exception 'D2A refuses a partial historical Generic Snapshot v2 schema';
    end if;
    if exists (
      select 1 from public.daily_assignments
      where compiled_lesson_snapshot is not null
        and compiled_lesson_snapshot->>'snapshotSchemaVersion' <> '2'
    ) then
      raise exception 'D2A repository topology contains a non-v2 snapshot before reconciliation';
    end if;
  elsif v_v2_validator_exists
    or v_v2_rpc_exists
    or v_constraint_exists
    or v_index_exists
    or v_trigger_exists
  then
    raise exception 'D2A refuses snapshot objects without compiled_lesson_snapshot';
  end if;

  if to_regprocedure('public.adle_generic_lesson_snapshot_is_structurally_valid_v3(jsonb)') is not null
    or to_regprocedure('public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb)') is not null
    or to_regprocedure('public.persist_adle_generic_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)') is not null
    or exists (
      select 1 from pg_constraint
      where conrelid = 'public.daily_assignments'::regclass
        and conname = 'daily_assignments_compiled_lesson_snapshot_versioned_check'
    )
  then
    raise exception 'D2A target objects already exist without the D2A ledger entry';
  end if;
end
$$;

alter table public.daily_assignments
  add column if not exists compiled_lesson_snapshot jsonb null;

-- This body is intentionally identical to the established v2 validator.
create or replace function public.adle_generic_lesson_snapshot_is_structurally_valid_v2(
  p_snapshot jsonb
) returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_snapshot) <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot)) <> 15
    or jsonb_typeof(p_snapshot->'snapshotSchemaVersion') <> 'number'
    or p_snapshot->>'snapshotSchemaVersion' <> '2'
    or p_snapshot->>'compilerVersion' <> 'adle_generic_snapshot_compiler_v2'
    or p_snapshot->>'validatorVersion' <> 'adle_generic_snapshot_validator_v2'
    or p_snapshot->>'requirementRegistryVersion' <> 'adle_generic_activity_requirements_v2'
    or jsonb_typeof(p_snapshot->'route') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'route')) <> 2
    or p_snapshot#>>'{route,routeId}' <> 'generic_composer'
    or p_snapshot#>>'{route,routeVersion}' <> 'v1'
    or jsonb_typeof(p_snapshot->'recipe') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'recipe')) <> 2
    or p_snapshot#>>'{recipe,recipeKey}' <> 'generic_first_exposure'
    or p_snapshot#>>'{recipe,recipeVersion}' <> 'v1'
    or jsonb_typeof(p_snapshot->'payload') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'payload')) <> 2
    or p_snapshot#>>'{payload,kind}' <> 'composed_daily_plan'
    or p_snapshot#>>'{payload,version}' <> '1'
    or jsonb_typeof(p_snapshot->'runtime') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'runtime')) <> 2
    or p_snapshot#>>'{runtime,adapterKey}' <> 'generic_composer_v1'
    or p_snapshot#>>'{runtime,rendererKey}' <> 'generic_session'
    or jsonb_typeof(p_snapshot->'assignment') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'assignment')) <> 2
    or p_snapshot#>>'{assignment,generationSource}' <> 'adle_composer_v1'
    or jsonb_typeof(p_snapshot#>'{assignment,itemCount}') <> 'number'
    or (p_snapshot#>>'{assignment,itemCount}') !~ '^[0-9]+$'
    or (p_snapshot#>>'{assignment,itemCount}')::integer < 1
    or jsonb_typeof(p_snapshot->'taxonomy') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'taxonomy')) <> 3
    or jsonb_typeof(p_snapshot->'words') <> 'array'
    or jsonb_typeof(p_snapshot->'activities') <> 'array'
    or jsonb_array_length(p_snapshot->'activities') < 1
    or jsonb_typeof(p_snapshot->'segments') <> 'array'
    or jsonb_array_length(p_snapshot->'segments') <> 2
    or jsonb_typeof(p_snapshot->'contentVersions') <> 'array'
    or jsonb_typeof(p_snapshot->'provenance') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'provenance')) <> 4
    or p_snapshot#>>'{provenance,sourceKind}' <> 'compiled_generic_assignment'
    or p_snapshot#>>'{provenance,fingerprintAlgorithm}' <> 'sha256'
    or p_snapshot#>>'{provenance,fingerprintVersion}' <> '1'
    or coalesce(p_snapshot#>>'{provenance,sourceFingerprint}', '') !~ '^[a-f0-9]{64}$'
  then
    return false;
  end if;
  return true;
exception
  when others then
    return false;
end;
$$;

-- Durable v3 persistence validation only. Canonical contract eligibility and
-- activity-specific payload semantics remain owned by the Phase D application
-- validator and are deliberately not duplicated here.
create or replace function public.adle_generic_lesson_snapshot_is_structurally_valid_v3(
  p_snapshot jsonb
) returns boolean
language plpgsql
immutable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_word jsonb;
  v_activity jsonb;
  v_segment jsonb;
  v_content jsonb;
  v_ordinal integer;
begin
  if jsonb_typeof(p_snapshot) <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot)) <> 15
    or not p_snapshot ?& array[
      'snapshotSchemaVersion', 'compilerVersion', 'validatorVersion',
      'canonicalContractRegistryVersion', 'route', 'recipe', 'payload',
      'runtime', 'assignment', 'taxonomy', 'words', 'activities', 'segments',
      'contentVersions', 'provenance'
    ]
    or jsonb_typeof(p_snapshot->'snapshotSchemaVersion') <> 'number'
    or p_snapshot->>'snapshotSchemaVersion' <> '3'
    or p_snapshot->>'compilerVersion' <> 'adle_generic_canonical_snapshot_compiler_v3'
    or p_snapshot->>'validatorVersion' <> 'adle_generic_canonical_snapshot_validator_v3'
    or p_snapshot->>'canonicalContractRegistryVersion' <> 'adle_generic_canonical_contracts_v1'
    or jsonb_typeof(p_snapshot->'route') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'route')) <> 2
    or not p_snapshot->'route' ?& array['routeId', 'routeVersion']
    or p_snapshot#>>'{route,routeId}' <> 'generic_composer'
    or p_snapshot#>>'{route,routeVersion}' <> 'v1'
    or jsonb_typeof(p_snapshot->'recipe') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'recipe')) <> 2
    or not p_snapshot->'recipe' ?& array['recipeKey', 'recipeVersion']
    or p_snapshot#>>'{recipe,recipeKey}' <> 'generic_first_exposure'
    or p_snapshot#>>'{recipe,recipeVersion}' <> 'v1'
    or jsonb_typeof(p_snapshot->'payload') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'payload')) <> 2
    or not p_snapshot->'payload' ?& array['kind', 'version']
    or p_snapshot#>>'{payload,kind}' <> 'composed_daily_plan'
    or jsonb_typeof(p_snapshot#>'{payload,version}') <> 'number'
    or p_snapshot#>>'{payload,version}' <> '1'
    or jsonb_typeof(p_snapshot->'runtime') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'runtime')) <> 2
    or not p_snapshot->'runtime' ?& array['adapterKey', 'rendererKey']
    or p_snapshot#>>'{runtime,adapterKey}' <> 'generic_composer_v1'
    or p_snapshot#>>'{runtime,rendererKey}' <> 'canonical_activity_host_v1'
    or jsonb_typeof(p_snapshot->'assignment') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'assignment')) <> 2
    or not p_snapshot->'assignment' ?& array['generationSource', 'itemCount']
    or p_snapshot#>>'{assignment,generationSource}' <> 'adle_composer_v1'
    or jsonb_typeof(p_snapshot#>'{assignment,itemCount}') <> 'number'
    or (p_snapshot#>>'{assignment,itemCount}') !~ '^[0-9]+$'
    or (p_snapshot#>>'{assignment,itemCount}')::integer < 1
    or jsonb_typeof(p_snapshot->'taxonomy') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'taxonomy')) <> 3
    or not p_snapshot->'taxonomy' ?& array['lesson', 'reviewFamilyKeys', 'reviewMicroSkillKeys']
    or jsonb_typeof(p_snapshot#>'{taxonomy,reviewFamilyKeys}') <> 'array'
    or jsonb_typeof(p_snapshot#>'{taxonomy,reviewMicroSkillKeys}') <> 'array'
    or exists (
      select 1 from jsonb_array_elements(p_snapshot#>'{taxonomy,reviewFamilyKeys}') entry
      where jsonb_typeof(entry.value) <> 'string' or nullif(btrim(entry.value#>>'{}'), '') is null
    )
    or exists (
      select 1 from jsonb_array_elements(p_snapshot#>'{taxonomy,reviewMicroSkillKeys}') entry
      where jsonb_typeof(entry.value) <> 'string' or nullif(btrim(entry.value#>>'{}'), '') is null
    )
    or (
      p_snapshot#>'{taxonomy,lesson}' <> 'null'::jsonb
      and (
        jsonb_typeof(p_snapshot#>'{taxonomy,lesson}') <> 'object'
        or (select count(*) from jsonb_object_keys(p_snapshot#>'{taxonomy,lesson}')) <> 2
        or not p_snapshot#>'{taxonomy,lesson}' ?& array['familyKey', 'microSkillKey']
        or jsonb_typeof(p_snapshot#>'{taxonomy,lesson,familyKey}') <> 'string'
        or jsonb_typeof(p_snapshot#>'{taxonomy,lesson,microSkillKey}') <> 'string'
        or nullif(btrim(p_snapshot#>>'{taxonomy,lesson,familyKey}'), '') is null
        or nullif(btrim(p_snapshot#>>'{taxonomy,lesson,microSkillKey}'), '') is null
      )
    )
    or jsonb_typeof(p_snapshot->'words') <> 'array'
    or jsonb_typeof(p_snapshot->'activities') <> 'array'
    or jsonb_array_length(p_snapshot->'activities') < 1
    or jsonb_typeof(p_snapshot->'segments') <> 'array'
    or jsonb_array_length(p_snapshot->'segments') <> 2
    or jsonb_typeof(p_snapshot->'contentVersions') <> 'array'
    or jsonb_typeof(p_snapshot->'provenance') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'provenance')) <> 4
    or not p_snapshot->'provenance' ?& array[
      'sourceKind', 'fingerprintAlgorithm', 'fingerprintVersion', 'sourceFingerprint'
    ]
    or p_snapshot#>>'{provenance,sourceKind}' <> 'compiled_generic_canonical_assignment'
    or p_snapshot#>>'{provenance,fingerprintAlgorithm}' <> 'sha256'
    or jsonb_typeof(p_snapshot#>'{provenance,fingerprintVersion}') <> 'number'
    or p_snapshot#>>'{provenance,fingerprintVersion}' <> '1'
    or jsonb_typeof(p_snapshot#>'{provenance,sourceFingerprint}') <> 'string'
    or coalesce(p_snapshot#>>'{provenance,sourceFingerprint}', '') !~ '^[a-f0-9]{64}$'
  then
    return false;
  end if;

  if (
    select count(*) <> count(distinct value#>>'{}')
    from jsonb_array_elements(p_snapshot#>'{taxonomy,reviewFamilyKeys}')
  ) or (
    select count(*) <> count(distinct value#>>'{}')
    from jsonb_array_elements(p_snapshot#>'{taxonomy,reviewMicroSkillKeys}')
  ) then
    return false;
  end if;

  for v_word, v_ordinal in
    select value, ordinality::integer
    from jsonb_array_elements(p_snapshot->'words') with ordinality
  loop
    if jsonb_typeof(v_word) <> 'object'
      or (select count(*) from jsonb_object_keys(v_word)) <> 13
      or not v_word ?& array[
        'contractVersion', 'wordSnapshotId', 'order', 'canonicalWordId',
        'displayWord', 'familyKey', 'microSkillKey', 'learningItemId', 'role',
        'selectionProvenance', 'source', 'contentVersionRefs', 'factFingerprint'
      ]
      or jsonb_typeof(v_word->'contractVersion') <> 'number'
      or v_word->>'contractVersion' <> '3'
      or jsonb_typeof(v_word->'order') <> 'number'
      or v_word->>'order' <> v_ordinal::text
      or jsonb_typeof(v_word->'wordSnapshotId') <> 'string'
      or jsonb_typeof(v_word->'canonicalWordId') <> 'string'
      or jsonb_typeof(v_word->'displayWord') <> 'string'
      or nullif(btrim(v_word->>'wordSnapshotId'), '') is null
      or nullif(btrim(v_word->>'canonicalWordId'), '') is null
      or nullif(btrim(v_word->>'displayWord'), '') is null
      or (v_word->'familyKey' <> 'null'::jsonb and (jsonb_typeof(v_word->'familyKey') <> 'string' or nullif(btrim(v_word->>'familyKey'), '') is null))
      or (v_word->'microSkillKey' <> 'null'::jsonb and (jsonb_typeof(v_word->'microSkillKey') <> 'string' or nullif(btrim(v_word->>'microSkillKey'), '') is null))
      or (v_word->'learningItemId' <> 'null'::jsonb and (jsonb_typeof(v_word->'learningItemId') <> 'string' or nullif(btrim(v_word->>'learningItemId'), '') is null))
      or jsonb_typeof(v_word->'role') <> 'string'
      or jsonb_typeof(v_word->'selectionProvenance') <> 'string'
      or nullif(btrim(v_word->>'role'), '') is null
      or nullif(btrim(v_word->>'selectionProvenance'), '') is null
      or jsonb_typeof(v_word->'source') <> 'object'
      or (select count(*) from jsonb_object_keys(v_word->'source')) <> 2
      or not v_word->'source' ?& array['kind', 'referenceId']
      or jsonb_typeof(v_word#>'{source,kind}') <> 'string'
      or nullif(btrim(v_word#>>'{source,kind}'), '') is null
      or (v_word#>'{source,referenceId}' <> 'null'::jsonb and (jsonb_typeof(v_word#>'{source,referenceId}') <> 'string' or nullif(btrim(v_word#>>'{source,referenceId}'), '') is null))
      or jsonb_typeof(v_word->'contentVersionRefs') <> 'array'
      or exists (
        select 1 from jsonb_array_elements(v_word->'contentVersionRefs') entry
        where jsonb_typeof(entry.value) <> 'string' or nullif(btrim(entry.value#>>'{}'), '') is null
      )
      or jsonb_typeof(v_word->'factFingerprint') <> 'string'
      or coalesce(v_word->>'factFingerprint', '') !~ '^[a-f0-9]{64}$'
      or public.adle_canonical_json_sha256_v1(v_word - 'factFingerprint') <> v_word->>'factFingerprint'
    then
      return false;
    end if;
  end loop;

  if (
    select count(*) <> count(distinct value->>'wordSnapshotId')
    from jsonb_array_elements(p_snapshot->'words')
  ) then
    return false;
  end if;

  for v_activity, v_ordinal in
    select value, ordinality::integer
    from jsonb_array_elements(p_snapshot->'activities') with ordinality
  loop
    if jsonb_typeof(v_activity) <> 'object'
      or (select count(*) from jsonb_object_keys(v_activity)) <> 17
      or not v_activity ?& array[
        'contractVersion', 'activityId', 'label', 'order', 'part', 'sectionKey',
        'canonical', 'payload', 'itemBinding', 'wordSnapshotIds',
        'contentVersionRefs', 'condition', 'answerVisibility', 'evidence',
        'completion', 'scheduleRole', 'rewardRole'
      ]
      or jsonb_typeof(v_activity->'contractVersion') <> 'number'
      or v_activity->>'contractVersion' <> '3'
      or jsonb_typeof(v_activity->'order') <> 'number'
      or v_activity->>'order' <> v_ordinal::text
      or jsonb_typeof(v_activity->'activityId') <> 'string'
      or jsonb_typeof(v_activity->'label') <> 'string'
      or jsonb_typeof(v_activity->'part') <> 'string'
      or jsonb_typeof(v_activity->'sectionKey') <> 'string'
      or nullif(btrim(v_activity->>'activityId'), '') is null
      or nullif(btrim(v_activity->>'label'), '') is null
      or v_activity->>'part' not in ('review', 'lesson')
      or nullif(btrim(v_activity->>'sectionKey'), '') is null
      or jsonb_typeof(v_activity->'canonical') <> 'object'
      or (select count(*) from jsonb_object_keys(v_activity->'canonical')) <> 3
      or not v_activity->'canonical' ?& array['concept', 'mode', 'contractVersion']
      or jsonb_typeof(v_activity#>'{canonical,concept}') <> 'string'
      or jsonb_typeof(v_activity#>'{canonical,mode}') <> 'string'
      or nullif(btrim(v_activity#>>'{canonical,concept}'), '') is null
      or nullif(btrim(v_activity#>>'{canonical,mode}'), '') is null
      or jsonb_typeof(v_activity#>'{canonical,contractVersion}') <> 'number'
      or (v_activity#>>'{canonical,contractVersion}') !~ '^[0-9]+$'
      or (v_activity#>>'{canonical,contractVersion}')::integer < 1
      or jsonb_typeof(v_activity->'payload') <> 'object'
      or jsonb_typeof(v_activity->'itemBinding') <> 'object'
      or (select count(*) from jsonb_object_keys(v_activity->'itemBinding')) <> 3
      or not v_activity->'itemBinding' ?& array['sourceEntityId', 'position', 'inputSource']
      or jsonb_typeof(v_activity#>'{itemBinding,sourceEntityId}') <> 'string'
      or jsonb_typeof(v_activity#>'{itemBinding,position}') <> 'number'
      or jsonb_typeof(v_activity#>'{itemBinding,inputSource}') <> 'string'
      or nullif(btrim(v_activity#>>'{itemBinding,sourceEntityId}'), '') is null
      or v_activity#>>'{itemBinding,position}' <> v_ordinal::text
      or v_activity#>>'{itemBinding,inputSource}' <> 'assignment_items.prompt_data'
      or jsonb_typeof(v_activity->'wordSnapshotIds') <> 'array'
      or jsonb_typeof(v_activity->'contentVersionRefs') <> 'array'
      or exists (
        select 1 from jsonb_array_elements(v_activity->'wordSnapshotIds') entry
        where jsonb_typeof(entry.value) <> 'string' or nullif(btrim(entry.value#>>'{}'), '') is null
      )
      or exists (
        select 1 from jsonb_array_elements(v_activity->'contentVersionRefs') entry
        where jsonb_typeof(entry.value) <> 'string' or nullif(btrim(entry.value#>>'{}'), '') is null
      )
      or jsonb_typeof(v_activity->'condition') <> 'object'
      or jsonb_typeof(v_activity#>'{condition,kind}') <> 'string'
      or nullif(btrim(v_activity#>>'{condition,kind}'), '') is null
      or jsonb_typeof(v_activity->'evidence') <> 'object'
      or jsonb_typeof(v_activity->'completion') <> 'object'
      or jsonb_typeof(v_activity->'answerVisibility') <> 'string'
      or jsonb_typeof(v_activity->'scheduleRole') <> 'string'
      or jsonb_typeof(v_activity->'rewardRole') <> 'string'
      or nullif(btrim(v_activity->>'answerVisibility'), '') is null
      or nullif(btrim(v_activity->>'scheduleRole'), '') is null
      or nullif(btrim(v_activity->>'rewardRole'), '') is null
    then
      return false;
    end if;
  end loop;

  if (
    select count(*) <> count(distinct value->>'activityId')
    from jsonb_array_elements(p_snapshot->'activities')
  ) or (
    select count(*) <> count(distinct value#>>'{itemBinding,sourceEntityId}')
    from jsonb_array_elements(p_snapshot->'activities')
  ) then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_snapshot->'activities') activity,
         jsonb_array_elements(activity.value->'wordSnapshotIds') word_id
    where not exists (
      select 1 from jsonb_array_elements(p_snapshot->'words') word
      where word.value->>'wordSnapshotId' = word_id.value#>>'{}'
    )
  ) then
    return false;
  end if;

  for v_content in select value from jsonb_array_elements(p_snapshot->'contentVersions')
  loop
    if jsonb_typeof(v_content) <> 'object'
      or (select count(*) from jsonb_object_keys(v_content)) <> 5
      or not v_content ?& array['contentRefId', 'kind', 'key', 'version', 'sourceRowHash']
      or jsonb_typeof(v_content->'contentRefId') <> 'string'
      or jsonb_typeof(v_content->'kind') <> 'string'
      or jsonb_typeof(v_content->'key') <> 'string'
      or jsonb_typeof(v_content->'version') <> 'string'
      or nullif(btrim(v_content->>'contentRefId'), '') is null
      or nullif(btrim(v_content->>'kind'), '') is null
      or nullif(btrim(v_content->>'key'), '') is null
      or nullif(btrim(v_content->>'version'), '') is null
      or v_content->>'contentRefId' <> concat(v_content->>'kind', ':', v_content->>'key', ':', v_content->>'version')
      or (v_content->'sourceRowHash' <> 'null'::jsonb and (jsonb_typeof(v_content->'sourceRowHash') <> 'string' or nullif(btrim(v_content->>'sourceRowHash'), '') is null))
    then
      return false;
    end if;
  end loop;

  if (
    select count(*) <> count(distinct value->>'contentRefId')
    from jsonb_array_elements(p_snapshot->'contentVersions')
  ) or exists (
    select 1
    from jsonb_array_elements(p_snapshot->'activities') activity,
         jsonb_array_elements(activity.value->'contentVersionRefs') content_id
    where not exists (
      select 1 from jsonb_array_elements(p_snapshot->'contentVersions') content
      where content.value->>'contentRefId' = content_id.value#>>'{}'
    )
  ) or exists (
    select 1
    from jsonb_array_elements(p_snapshot->'words') word,
         jsonb_array_elements(word.value->'contentVersionRefs') content_id
    where not exists (
      select 1 from jsonb_array_elements(p_snapshot->'contentVersions') content
      where content.value->>'contentRefId' = content_id.value#>>'{}'
    )
  ) then
    return false;
  end if;

  for v_segment, v_ordinal in
    select value, ordinality::integer
    from jsonb_array_elements(p_snapshot->'segments') with ordinality
  loop
    if jsonb_typeof(v_segment) <> 'object'
      or (select count(*) from jsonb_object_keys(v_segment)) <> 3
      or not v_segment ?& array['segmentId', 'wordSnapshotIds', 'activityIds']
      or jsonb_typeof(v_segment->'segmentId') <> 'string'
      or v_segment->>'segmentId' <> (case v_ordinal when 1 then 'review' else 'lesson' end)
      or jsonb_typeof(v_segment->'wordSnapshotIds') <> 'array'
      or jsonb_typeof(v_segment->'activityIds') <> 'array'
      or exists (
        select 1 from jsonb_array_elements(v_segment->'wordSnapshotIds') word_id
        where not exists (
          select 1 from jsonb_array_elements(p_snapshot->'words') word
          where word.value->>'wordSnapshotId' = word_id.value#>>'{}'
        )
      )
      or exists (
        select 1 from jsonb_array_elements(v_segment->'activityIds') activity_id
        where not exists (
          select 1 from jsonb_array_elements(p_snapshot->'activities') activity
          where activity.value->>'activityId' = activity_id.value#>>'{}'
            and activity.value->>'part' = v_segment->>'segmentId'
        )
      )
    then
      return false;
    end if;
  end loop;

  if (
    select count(*)
    from jsonb_array_elements(p_snapshot->'segments') segment,
         jsonb_array_elements(segment.value->'activityIds') activity_id
  ) <> jsonb_array_length(p_snapshot->'activities')
    or exists (
      select 1
      from jsonb_array_elements(p_snapshot->'activities') activity
      where (
        select count(*)
        from jsonb_array_elements(p_snapshot->'segments') segment,
             jsonb_array_elements(segment.value->'activityIds') activity_id
        where activity_id.value#>>'{}' = activity.value->>'activityId'
      ) <> 1
    )
    or (p_snapshot#>>'{assignment,itemCount}')::integer <> jsonb_array_length(p_snapshot->'activities')
    or public.adle_canonical_json_sha256_v1(
      p_snapshot #- '{provenance,sourceFingerprint}'
    ) <> p_snapshot#>>'{provenance,sourceFingerprint}'
  then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function public.adle_generic_lesson_snapshot_is_structurally_valid(
  p_snapshot jsonb
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_snapshot->>'snapshotSchemaVersion'
    when '2' then public.adle_generic_lesson_snapshot_is_structurally_valid_v2(p_snapshot)
    when '3' then public.adle_generic_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
    else false
  end
$$;

revoke all on function public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)
from public, anon, authenticated;
revoke all on function public.adle_generic_lesson_snapshot_is_structurally_valid_v3(jsonb)
from public, anon, authenticated;
revoke all on function public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb)
from public, anon, authenticated;
grant execute on function public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)
to authenticated, service_role;
grant execute on function public.adle_generic_lesson_snapshot_is_structurally_valid_v3(jsonb)
to authenticated, service_role;
grant execute on function public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb)
to authenticated, service_role;

alter table public.daily_assignments
  drop constraint if exists daily_assignments_compiled_lesson_snapshot_v2_check;
alter table public.daily_assignments
  add constraint daily_assignments_compiled_lesson_snapshot_versioned_check
  check (
    compiled_lesson_snapshot is null
    or public.adle_generic_lesson_snapshot_is_structurally_valid(compiled_lesson_snapshot)
  );

create index if not exists daily_assignments_compiled_snapshot_version_idx
  on public.daily_assignments ((compiled_lesson_snapshot->>'snapshotSchemaVersion'))
  where compiled_lesson_snapshot is not null;

create or replace function public.prevent_adle_compiled_lesson_snapshot_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.compiled_lesson_snapshot is distinct from new.compiled_lesson_snapshot then
    raise exception 'ADLE compiled lesson snapshot is immutable';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.daily_assignments'::regclass
      and tgname = 'daily_assignments_compiled_lesson_snapshot_immutable'
      and not tgisinternal
  ) then
    create trigger daily_assignments_compiled_lesson_snapshot_immutable
    before update of compiled_lesson_snapshot on public.daily_assignments
    for each row
    execute function public.prevent_adle_compiled_lesson_snapshot_update();
  end if;
end
$$;

-- The v2 RPC body below is kept semantically identical to the established
-- historical function. Do not factor it through the new v3 writer.
create or replace function public.persist_adle_generic_daily_plan_v2(
  p_parent_user_id uuid,
  p_child_id uuid,
  p_plan_date date,
  p_header jsonb,
  p_items jsonb,
  p_intakes jsonb,
  p_snapshot jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment_id uuid;
  v_existing_id uuid;
  v_item jsonb;
  v_intake jsonb;
  v_position integer;
begin
  if not exists (
    select 1
    from public.children
    where id = p_child_id
      and parent_user_id = p_parent_user_id
      and coalesce(is_archived, false) = false
  ) then
    raise exception 'ADLE generic plan child ownership validation failed';
  end if;

  if jsonb_typeof(p_header) <> 'object'
    or p_header->>'childId' <> p_child_id::text
    or p_header->>'parentUserId' <> p_parent_user_id::text
    or p_header->>'assignmentDate' <> p_plan_date::text
    or p_header->>'title' <> 'ADLE Daily Plan'
    or p_header->>'status' <> 'pending'
    or p_header->>'assignmentGenerationSource' <> 'adle_composer_v1'
    or not public.adle_lesson_route_metadata_is_valid_v1(p_header->'lessonRouteMetadata')
    or p_header#>>'{lessonRouteMetadata,route,routeId}' <> 'generic_composer'
    or p_header#>>'{lessonRouteMetadata,route,routeVersion}' <> 'v1'
    or p_header#>>'{lessonRouteMetadata,recipe,recipeKey}' <> 'generic_first_exposure'
    or p_header#>>'{lessonRouteMetadata,recipe,recipeVersion}' <> 'v1'
    or p_header#>>'{lessonRouteMetadata,payload,kind}' <> 'composed_daily_plan'
    or p_header#>>'{lessonRouteMetadata,payload,version}' <> '1'
  then
    raise exception 'ADLE generic plan header validation failed';
  end if;

  if not public.adle_generic_lesson_snapshot_is_structurally_valid_v2(p_snapshot) then
    raise exception 'ADLE generic plan snapshot structural validation failed';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_typeof(p_intakes) <> 'array'
    or (p_snapshot#>>'{assignment,itemCount}')::integer <> jsonb_array_length(p_items)
    or jsonb_array_length(p_snapshot->'activities') <> jsonb_array_length(p_items)
  then
    raise exception 'ADLE generic plan collection validation failed';
  end if;

  if (
    select count(*) <> count(distinct value->>'sourceEntityId')
    from jsonb_array_elements(p_items)
  ) then
    raise exception 'ADLE generic plan item source bindings must be unique';
  end if;
  if (
    select count(*) <> count(distinct value#>>'{itemBinding,sourceEntityId}')
    from jsonb_array_elements(p_snapshot->'activities')
  ) then
    raise exception 'ADLE generic plan snapshot bindings must be unique';
  end if;

  for v_item, v_position in
    select value, ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
  loop
    if v_item->>'childId' <> p_child_id::text
      or v_item->>'parentUserId' <> p_parent_user_id::text
      or (v_item->>'position')::integer <> v_position
      or v_item->>'domainModule' <> 'spelling'
      or v_item->>'sourceType' <> 'adle_composer'
      or v_item->>'status' <> 'ready'
      or nullif(btrim(v_item->>'sourceEntityId'), '') is null
      or nullif(btrim(v_item->>'templateKey'), '') is null
      or v_item#>>'{metadata,planDate}' <> p_plan_date::text
      or nullif(btrim(v_item#>>'{metadata,sectionKey}'), '') is null
    then
      raise exception 'ADLE generic plan item validation failed at position %', v_position;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_snapshot->'activities') activity
    full join jsonb_array_elements(p_items) item
      on activity.value#>>'{itemBinding,sourceEntityId}' = item.value->>'sourceEntityId'
    where activity.value is null
      or item.value is null
      or activity.value#>>'{itemBinding,position}' <> item.value->>'position'
      or activity.value->>'order' <> item.value->>'position'
      or activity.value->>'sectionKey' <> item.value#>>'{metadata,sectionKey}'
      or activity.value->>'templateKey' <> item.value->>'templateKey'
  ) then
    raise exception 'ADLE generic plan snapshot and item bindings disagree';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_child_id::text || ':' || p_plan_date::text || ':ADLE Daily Plan', 0)
  );
  select id into v_existing_id
  from public.daily_assignments
  where child_id = p_child_id
    and parent_user_id = p_parent_user_id
    and assignment_date = p_plan_date
    and title = 'ADLE Daily Plan'
    and assignment_generation_source = 'adle_composer_v1';
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if exists (
    select 1 from public.daily_assignments
    where child_id = p_child_id
      and assignment_date = p_plan_date
      and title = 'ADLE Daily Plan'
  ) then
    raise exception 'ADLE generic plan assignment envelope already exists';
  end if;

  insert into public.daily_assignments (
    child_id, parent_user_id, assignment_date, title, status,
    target_words, review_words, assignment_generation_source,
    lesson_route_metadata, compiled_lesson_snapshot
  ) values (
    p_child_id,
    p_parent_user_id,
    p_plan_date,
    p_header->>'title',
    p_header->>'status',
    array(select jsonb_array_elements_text(coalesce(p_header->'targetWords', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_header->'reviewWords', '[]'::jsonb))),
    p_header->>'assignmentGenerationSource',
    p_header->'lessonRouteMetadata',
    p_snapshot
  ) returning id into v_assignment_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.assignment_items (
      daily_assignment_id, child_id, parent_user_id, domain_module, item_type,
      source_type, source_entity_id, learning_item_id, template_key,
      target_word, position, status, prompt_data, metadata
    ) values (
      v_assignment_id,
      p_child_id,
      p_parent_user_id,
      v_item->>'domainModule',
      v_item->>'itemType',
      v_item->>'sourceType',
      v_item->>'sourceEntityId',
      null,
      v_item->>'templateKey',
      nullif(v_item->>'targetWord', ''),
      (v_item->>'position')::integer,
      v_item->>'status',
      coalesce(v_item->'promptData', '{}'::jsonb),
      coalesce(v_item->'metadata', '{}'::jsonb)
    );
  end loop;

  for v_intake in select value from jsonb_array_elements(p_intakes)
  loop
    if v_intake->>'childId' <> p_child_id::text
      or nullif(btrim(v_intake->>'canonicalWordId'), '') is null
      or nullif(btrim(v_intake->>'microSkillKey'), '') is null
      or v_intake->>'rowStatus' <> 'active'
    then
      raise exception 'ADLE generic plan intake validation failed';
    end if;

    update public.adle_learning_items
    set row_status = 'superseded', updated_at = timezone('utc', now())
    where child_id = p_child_id
      and canonical_word_id = (v_intake->>'canonicalWordId')::uuid
      and micro_skill_key = v_intake->>'microSkillKey'
      and row_status = 'active';

    insert into public.adle_learning_items (
      child_id, canonical_word_id, micro_skill_key, item_status, source_kind,
      source_ref, source_attempt_text, reteach_priority, ejected_on,
      intake_on, row_status
    ) values (
      p_child_id,
      (v_intake->>'canonicalWordId')::uuid,
      v_intake->>'microSkillKey',
      v_intake->>'itemStatus',
      v_intake->>'sourceKind',
      v_intake->>'sourceRef',
      nullif(v_intake->>'sourceAttemptText', ''),
      coalesce((v_intake->>'reteachPriority')::boolean, false),
      nullif(v_intake->>'ejectedOn', '')::date,
      (v_intake->>'intakeOn')::date,
      'active'
    );
  end loop;

  return v_assignment_id;
end;
$$;

create or replace function public.persist_adle_generic_daily_plan_v3(
  p_parent_user_id uuid,
  p_child_id uuid,
  p_plan_date date,
  p_header jsonb,
  p_items jsonb,
  p_intakes jsonb,
  p_snapshot jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment_id uuid;
  v_existing_id uuid;
  v_existing_snapshot jsonb;
  v_item jsonb;
  v_intake jsonb;
  v_position integer;
begin
  if not exists (
    select 1 from public.children
    where id = p_child_id
      and parent_user_id = p_parent_user_id
      and coalesce(is_archived, false) = false
  ) then
    raise exception 'ADLE generic v3 plan child ownership validation failed';
  end if;

  if jsonb_typeof(p_header) <> 'object'
    or not p_header ?& array[
      'childId', 'parentUserId', 'assignmentDate', 'title', 'status',
      'targetWords', 'reviewWords', 'assignmentGenerationSource',
      'lessonRouteMetadata'
    ]
    or p_header->>'childId' <> p_child_id::text
    or p_header->>'parentUserId' <> p_parent_user_id::text
    or p_header->>'assignmentDate' <> p_plan_date::text
    or p_header->>'title' <> 'ADLE Daily Plan'
    or p_header->>'status' <> 'pending'
    or p_header->>'assignmentGenerationSource' <> 'adle_composer_v1'
    or jsonb_typeof(p_header->'targetWords') <> 'array'
    or jsonb_typeof(p_header->'reviewWords') <> 'array'
    or exists (
      select 1 from jsonb_array_elements(p_header->'targetWords') entry
      where jsonb_typeof(entry.value) <> 'string'
    )
    or exists (
      select 1 from jsonb_array_elements(p_header->'reviewWords') entry
      where jsonb_typeof(entry.value) <> 'string'
    )
    or not public.adle_lesson_route_metadata_is_valid_v1(p_header->'lessonRouteMetadata')
    or p_header#>>'{lessonRouteMetadata,route,routeId}' <> 'generic_composer'
    or p_header#>>'{lessonRouteMetadata,route,routeVersion}' <> 'v1'
    or p_header#>>'{lessonRouteMetadata,recipe,recipeKey}' <> 'generic_first_exposure'
    or p_header#>>'{lessonRouteMetadata,recipe,recipeVersion}' <> 'v1'
    or p_header#>>'{lessonRouteMetadata,payload,kind}' <> 'composed_daily_plan'
    or p_header#>>'{lessonRouteMetadata,payload,version}' <> '1'
  then
    raise exception 'ADLE generic v3 plan header validation failed';
  end if;

  if not public.adle_generic_lesson_snapshot_is_structurally_valid_v3(p_snapshot) then
    raise exception 'ADLE generic v3 plan snapshot durable validation failed';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_typeof(p_intakes) <> 'array'
    or (p_snapshot#>>'{assignment,itemCount}')::integer <> jsonb_array_length(p_items)
    or jsonb_array_length(p_snapshot->'activities') <> jsonb_array_length(p_items)
  then
    raise exception 'ADLE generic v3 plan collection validation failed';
  end if;

  if (
    select count(*) <> count(distinct value->>'sourceEntityId')
    from jsonb_array_elements(p_items)
  ) or (
    select count(*) <> count(distinct value#>>'{itemBinding,sourceEntityId}')
    from jsonb_array_elements(p_snapshot->'activities')
  ) then
    raise exception 'ADLE generic v3 plan source bindings must be unique';
  end if;

  for v_item, v_position in
    select value, ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object'
      or not v_item ?& array[
        'childId', 'parentUserId', 'domainModule', 'itemType', 'sourceType',
        'sourceEntityId', 'templateKey', 'targetWord', 'position', 'status',
        'promptData', 'metadata'
      ]
      or v_item->>'childId' <> p_child_id::text
      or v_item->>'parentUserId' <> p_parent_user_id::text
      or jsonb_typeof(v_item->'position') <> 'number'
      or (v_item->>'position') !~ '^[0-9]+$'
      or (v_item->>'position')::integer <> v_position
      or v_item->>'domainModule' <> 'spelling'
      or nullif(btrim(v_item->>'itemType'), '') is null
      or v_item->>'sourceType' <> 'adle_composer'
      or v_item->>'status' <> 'ready'
      or nullif(btrim(v_item->>'sourceEntityId'), '') is null
      or nullif(btrim(v_item->>'templateKey'), '') is null
      or (v_item->'targetWord' <> 'null'::jsonb and jsonb_typeof(v_item->'targetWord') <> 'string')
      or jsonb_typeof(v_item->'promptData') <> 'object'
      or jsonb_typeof(v_item->'metadata') <> 'object'
      or not v_item->'metadata' ?& array['planDate', 'sectionKey']
      or v_item#>>'{metadata,planDate}' <> p_plan_date::text
      or nullif(btrim(v_item#>>'{metadata,sectionKey}'), '') is null
    then
      raise exception 'ADLE generic v3 plan item validation failed at position %', v_position;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_snapshot->'activities') activity
    full join jsonb_array_elements(p_items) item
      on activity.value#>>'{itemBinding,sourceEntityId}' = item.value->>'sourceEntityId'
    where activity.value is null
      or item.value is null
      or activity.value#>>'{itemBinding,position}' <> item.value->>'position'
      or activity.value->>'order' <> item.value->>'position'
      or activity.value->>'sectionKey' <> item.value#>>'{metadata,sectionKey}'
  ) then
    raise exception 'ADLE generic v3 snapshot and item bindings disagree';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_child_id::text || ':' || p_plan_date::text || ':ADLE Daily Plan', 0)
  );
  select id, compiled_lesson_snapshot
    into v_existing_id, v_existing_snapshot
  from public.daily_assignments
  where child_id = p_child_id
    and parent_user_id = p_parent_user_id
    and assignment_date = p_plan_date
    and title = 'ADLE Daily Plan'
    and assignment_generation_source = 'adle_composer_v1';
  if v_existing_id is not null then
    if v_existing_snapshot->>'snapshotSchemaVersion' is distinct from '3'
      or v_existing_snapshot#>>'{provenance,sourceFingerprint}'
        is distinct from p_snapshot#>>'{provenance,sourceFingerprint}'
    then
      raise exception 'ADLE generic v3 plan idempotency conflict';
    end if;
    return v_existing_id;
  end if;

  if exists (
    select 1 from public.daily_assignments
    where child_id = p_child_id
      and assignment_date = p_plan_date
      and title = 'ADLE Daily Plan'
  ) then
    raise exception 'ADLE generic v3 plan assignment envelope already exists';
  end if;

  insert into public.daily_assignments (
    child_id, parent_user_id, assignment_date, title, status,
    target_words, review_words, assignment_generation_source,
    lesson_route_metadata, compiled_lesson_snapshot
  ) values (
    p_child_id,
    p_parent_user_id,
    p_plan_date,
    p_header->>'title',
    p_header->>'status',
    array(select jsonb_array_elements_text(coalesce(p_header->'targetWords', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_header->'reviewWords', '[]'::jsonb))),
    p_header->>'assignmentGenerationSource',
    p_header->'lessonRouteMetadata',
    p_snapshot
  ) returning id into v_assignment_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.assignment_items (
      daily_assignment_id, child_id, parent_user_id, domain_module, item_type,
      source_type, source_entity_id, learning_item_id, template_key,
      target_word, position, status, prompt_data, metadata
    ) values (
      v_assignment_id,
      p_child_id,
      p_parent_user_id,
      v_item->>'domainModule',
      v_item->>'itemType',
      v_item->>'sourceType',
      v_item->>'sourceEntityId',
      null,
      v_item->>'templateKey',
      nullif(v_item->>'targetWord', ''),
      (v_item->>'position')::integer,
      v_item->>'status',
      coalesce(v_item->'promptData', '{}'::jsonb),
      coalesce(v_item->'metadata', '{}'::jsonb)
    );
  end loop;

  for v_intake in select value from jsonb_array_elements(p_intakes)
  loop
    if jsonb_typeof(v_intake) <> 'object'
      or not v_intake ?& array[
        'childId', 'canonicalWordId', 'microSkillKey', 'itemStatus',
        'sourceKind', 'sourceRef', 'sourceAttemptText', 'reteachPriority',
        'ejectedOn', 'intakeOn', 'rowStatus'
      ]
      or v_intake->>'childId' <> p_child_id::text
      or nullif(btrim(v_intake->>'canonicalWordId'), '') is null
      or nullif(btrim(v_intake->>'microSkillKey'), '') is null
      or nullif(btrim(v_intake->>'itemStatus'), '') is null
      or nullif(btrim(v_intake->>'sourceKind'), '') is null
      or nullif(btrim(v_intake->>'sourceRef'), '') is null
      or jsonb_typeof(v_intake->'reteachPriority') <> 'boolean'
      or coalesce(v_intake->>'intakeOn', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or v_intake->>'rowStatus' <> 'active'
    then
      raise exception 'ADLE generic v3 plan intake validation failed';
    end if;

    update public.adle_learning_items
    set row_status = 'superseded', updated_at = timezone('utc', now())
    where child_id = p_child_id
      and canonical_word_id = (v_intake->>'canonicalWordId')::uuid
      and micro_skill_key = v_intake->>'microSkillKey'
      and row_status = 'active';

    insert into public.adle_learning_items (
      child_id, canonical_word_id, micro_skill_key, item_status, source_kind,
      source_ref, source_attempt_text, reteach_priority, ejected_on,
      intake_on, row_status
    ) values (
      p_child_id,
      (v_intake->>'canonicalWordId')::uuid,
      v_intake->>'microSkillKey',
      v_intake->>'itemStatus',
      v_intake->>'sourceKind',
      v_intake->>'sourceRef',
      nullif(v_intake->>'sourceAttemptText', ''),
      coalesce((v_intake->>'reteachPriority')::boolean, false),
      nullif(v_intake->>'ejectedOn', '')::date,
      (v_intake->>'intakeOn')::date,
      'active'
    );
  end loop;

  return v_assignment_id;
end;
$$;

revoke all on function public.persist_adle_generic_daily_plan_v2(
  uuid, uuid, date, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.persist_adle_generic_daily_plan_v3(
  uuid, uuid, date, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_adle_generic_daily_plan_v2(
  uuid, uuid, date, jsonb, jsonb, jsonb, jsonb
) to service_role;
grant execute on function public.persist_adle_generic_daily_plan_v3(
  uuid, uuid, date, jsonb, jsonb, jsonb, jsonb
) to service_role;

comment on function public.adle_generic_lesson_snapshot_is_structurally_valid_v3(jsonb) is
  'D2A durable JSON/envelope/fingerprint validation only. Canonical activity eligibility and pedagogical payload validation remain application-owned.';
comment on function public.persist_adle_generic_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) is
  'D2A service-only atomic Generic Snapshot v3 persistence. Production writer selection remains separately gated and off.';

commit;
