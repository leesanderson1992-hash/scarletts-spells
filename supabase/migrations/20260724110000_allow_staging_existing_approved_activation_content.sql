-- A staging activation may use already-approved content while keeping its
-- reviewed Base Word family data in this immutable manifest batch. Production
-- still requires every dependency to be in the manifest batch.
begin;

create or replace function public.apply_adle_curriculum_activation_manifest_v1(
  p_manifest jsonb,
  p_manifest_file_sha256 text,
  p_environment_key text,
  p_applied_by text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_manifest_id uuid;
  v_route jsonb;
  v_skill public.micro_skill_catalog%rowtype;
  v_import_batch_id uuid;
  v_content_import_batch_id uuid;
  v_manifest_payload_sha256 text;
begin
  if p_environment_key not in ('local', 'staging', 'production')
     or p_manifest->>'schemaVersion' <> '1'
     or p_manifest_file_sha256 !~ '^[a-f0-9]{64}$'
     or nullif(btrim(p_applied_by), '') is null
     or jsonb_typeof(p_manifest->'approvalRefs') <> 'array'
     or jsonb_array_length(p_manifest->'approvalRefs') = 0
     or not (p_manifest->'excludedBatchStatuses' @> '["in_review"]'::jsonb)
     or jsonb_typeof(p_manifest->'artifacts') <> 'array'
     or jsonb_array_length(p_manifest->'artifacts') = 0
     or jsonb_typeof(p_manifest->'routes') <> 'array'
     or jsonb_array_length(p_manifest->'routes') = 0 then
    raise exception 'invalid ADLE curriculum activation manifest';
  end if;
  v_manifest_payload_sha256 := encode(extensions.digest(convert_to(p_manifest::text, 'utf8'), 'sha256'), 'hex');
  v_import_batch_id := (p_manifest->'routes'->0->>'importBatchId')::uuid;
  if exists (select 1 from jsonb_array_elements(p_manifest->'routes') route where (route->>'importBatchId')::uuid <> v_import_batch_id) then
    raise exception 'one activation manifest must reference one immutable import batch';
  end if;
  if not exists (select 1 from public.canonical_teaching_dictionary_import_batches where id = v_import_batch_id and batch_status = 'applied') then
    raise exception 'activation manifest import batch is not applied';
  end if;

  insert into public.adle_curriculum_import_manifests (
    manifest_key, schema_version, manifest_file_sha256, manifest_payload_sha256, source_package_path,
    source_package_sha256, approval_refs, manifest_payload, import_batch_id, environment_key, applied_by
  ) values (
    p_manifest->>'manifestKey', 1, p_manifest_file_sha256, v_manifest_payload_sha256,
    p_manifest->>'sourcePackagePath', p_manifest->>'sourcePackageSha256', p_manifest->'approvalRefs',
    p_manifest, v_import_batch_id, p_environment_key, p_applied_by
  ) on conflict (environment_key, manifest_payload_sha256) do nothing returning id into v_manifest_id;
  if v_manifest_id is null then
    select id into v_manifest_id from public.adle_curriculum_import_manifests
    where environment_key = p_environment_key and manifest_payload_sha256 = v_manifest_payload_sha256 and manifest_payload = p_manifest;
    if v_manifest_id is null then raise exception 'manifest hash already exists with different immutable payload'; end if;
  end if;

  for v_route in select value from jsonb_array_elements(p_manifest->'routes') loop
    v_content_import_batch_id := coalesce((v_route->>'contentImportBatchId')::uuid, v_import_batch_id);
    if p_environment_key <> 'staging' and v_content_import_batch_id <> v_import_batch_id then
      raise exception 'only staging activation may use content outside the manifest import batch';
    end if;
    select * into v_skill from public.micro_skill_catalog where micro_skill_key = v_route->>'microSkillKey' and mastery_domain_key = 'D4' and is_active and is_assignable;
    if not found then raise exception 'activation requires active assignable D4 micro-skill %', v_route->>'microSkillKey'; end if;
    if v_route->>'lessonRouteKey' <> 'base_word_family_v1' or (v_route->>'payloadVersion')::integer <> 1 then
      raise exception 'activation requires a registered route and payload version';
    end if;
    if v_route->>'lessonRouteKey' = 'base_word_family_v1' and v_route->>'microSkillKey' not in ('D4_MOR_BASE_WORDS_PRESERVE_BASE', 'D4_MOR_BASE_WORDS_IDENTIFY_BASE') then
      raise exception 'Base Word Lab activation requires an approved Base Word Lab micro-skill';
    end if;
    if v_route->>'requestedStatus' = 'production_enabled' and (jsonb_typeof(v_route->'readinessReport') <> 'object' or v_route->'readinessReport' = '{}'::jsonb) then
      raise exception 'production activation requires readiness evidence';
    end if;
    if v_route->>'requestedStatus' = 'production_enabled' and not exists (
      select 1 from public.canonical_teaching_dictionary_content_versions content
      where content.import_batch_id = v_content_import_batch_id and content.micro_skill_key = v_route->>'microSkillKey'
        and content.content_version = v_route->>'contentVersion' and content.version_status = 'active'
        and content.is_active = true and content.final_readiness_review_status = 'signed_off'
    ) then raise exception 'production activation requires signed-off content in the manifest import batch'; end if;
    if v_route->>'requestedStatus' = 'production_enabled' and v_route->>'lessonRouteKey' = 'base_word_family_v1' and not exists (
      select 1 from public.canonical_teaching_dictionary_base_word_families family
      where family.import_batch_id = v_import_batch_id and family.micro_skill_key = v_route->>'microSkillKey'
        and family.row_status = 'active' and family.review_status = 'approved_for_first_exposure'
    ) then raise exception 'Base Word Lab production activation requires an approved family in the manifest import batch'; end if;
    if exists (
      select 1 from public.adle_lesson_route_activations activation
      where activation.micro_skill_key = v_route->>'microSkillKey' and activation.lesson_route_key = v_route->>'lessonRouteKey'
        and activation.environment_key = p_environment_key and activation.row_status = 'active'
        and activation.activation_status = v_route->>'requestedStatus' and activation.payload_version = (v_route->>'payloadVersion')::integer
        and activation.content_version = v_route->>'contentVersion' and activation.import_manifest_id = v_manifest_id
        and activation.readiness_report = v_route->'readinessReport'
    ) then continue; end if;
    update public.adle_lesson_route_activations set row_status = 'superseded', updated_at = timezone('utc', now())
      where micro_skill_key = v_route->>'microSkillKey' and lesson_route_key = v_route->>'lessonRouteKey'
        and environment_key = p_environment_key and row_status = 'active';
    insert into public.adle_lesson_route_activations (
      micro_skill_key, lesson_route_key, payload_version, environment_key, activation_status, content_version,
      import_manifest_id, readiness_report, activated_at, paused_at, retired_at
    ) values (
      v_route->>'microSkillKey', v_route->>'lessonRouteKey', (v_route->>'payloadVersion')::integer,
      p_environment_key, v_route->>'requestedStatus', v_route->>'contentVersion', v_manifest_id, v_route->'readinessReport',
      case when v_route->>'requestedStatus' = 'production_enabled' then timezone('utc', now()) end,
      case when v_route->>'requestedStatus' = 'paused' then timezone('utc', now()) end,
      case when v_route->>'requestedStatus' = 'retired' then timezone('utc', now()) end
    );
  end loop;
  return v_manifest_id;
end;
$$;

revoke all on function public.apply_adle_curriculum_activation_manifest_v1(jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.apply_adle_curriculum_activation_manifest_v1(jsonb,text,text,text) to service_role;

commit;
