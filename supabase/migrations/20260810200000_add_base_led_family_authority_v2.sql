-- Base-led Base Word family authority. V1 authorities and releases remain
-- immutable and replayable; only a newly published schema-v2 authority opts
-- into learner-evidence authenticity and assignment-time family practice.

begin;

alter table public.adle_curriculum_dependency_authorities
  drop constraint adle_curriculum_dependency_authorities_source_check;
alter table public.adle_curriculum_dependency_authorities
  add constraint adle_curriculum_dependency_authorities_source_check
  check (source_classification in (
    'release_ledger',
    'legacy_pre_release_ledger_projection',
    'composite_release_and_legacy_projection'
  ));

create or replace function public.publish_adle_base_word_family_membership_authority_v2(
  p_manifest jsonb,
  p_manifest_file_sha256 text,
  p_source_classification text,
  p_published_by text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_authority_id uuid;
  v_projection jsonb;
  v_manifest_sha256 text;
  v_semantic_fingerprint text;
  v_family jsonb;
  v_member jsonb;
  v_source_family public.canonical_teaching_dictionary_base_word_families%rowtype;
  v_source_member public.canonical_teaching_dictionary_base_word_family_members%rowtype;
  v_source_batch public.canonical_teaching_dictionary_import_batches%rowtype;
  v_base_word public.canonical_teaching_dictionary_words%rowtype;
  v_member_word public.canonical_teaching_dictionary_words%rowtype;
  v_used_batch_ids uuid[] := array[]::uuid[];
  v_declared_batch_ids uuid[] := array[]::uuid[];
  v_source_kind text;
  v_source_id text;
  v_source_authority jsonb;
  v_expected_source_fingerprint text;
  v_legacy_cutoff constant timestamptz := '2026-07-26 00:00:00+00'::timestamptz;
begin
  if p_manifest_file_sha256 !~ '^[a-f0-9]{64}$'
     or p_source_classification not in (
       'release_ledger','legacy_pre_release_ledger_projection','composite_release_and_legacy_projection'
     )
     or nullif(btrim(p_published_by), '') is null
     or jsonb_typeof(p_manifest) <> 'object'
     or (select count(*) from jsonb_object_keys(p_manifest)) <> 6
     or p_manifest->>'schemaVersion' <> '2'
     or nullif(btrim(p_manifest->>'authorityKey'), '') is null
     or p_manifest->>'skillClusterKey' <> 'D4_MOR_BASE_WORDS'
     or jsonb_typeof(p_manifest->'sourceAuthorities') <> 'array'
     or jsonb_array_length(p_manifest->'sourceAuthorities') = 0
     or jsonb_typeof(p_manifest->'approvalRefs') <> 'array'
     or jsonb_array_length(p_manifest->'approvalRefs') = 0
     or jsonb_typeof(p_manifest->'families') <> 'array'
     or jsonb_array_length(p_manifest->'families') < 2 then
    raise exception 'invalid Base Word family membership authority v2 manifest';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_manifest->'sourceAuthorities') source
    where jsonb_typeof(source) <> 'object'
       or source->>'sourceKind' not in ('teaching_dictionary_import_batch','approved_repository_artifact')
       or nullif(btrim(source->>'authorityKey'),'') is null
       or nullif(btrim(source->>'sourceId'),'') is null
       or source->>'sourceFingerprint' !~ '^[a-f0-9]{64}$'
       or (source->>'sourceKind'='teaching_dictionary_import_batch' and
           source->>'sourceId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  ) or exists (
    select 1 from jsonb_array_elements(p_manifest->'sourceAuthorities') with ordinality current_source(value, ordinality)
    left join jsonb_array_elements(p_manifest->'sourceAuthorities') with ordinality prior_source(value, ordinality)
      on prior_source.ordinality=current_source.ordinality-1
    where prior_source.value is not null and prior_source.value->>'authorityKey'>=current_source.value->>'authorityKey'
  ) or exists (
    select 1 from jsonb_array_elements(p_manifest->'approvalRefs') with ordinality current_ref(value, ordinality)
    left join jsonb_array_elements(p_manifest->'approvalRefs') with ordinality prior_ref(value, ordinality)
      on prior_ref.ordinality = current_ref.ordinality - 1
    where jsonb_typeof(current_ref.value) <> 'string'
       or nullif(btrim(current_ref.value#>>'{}'), '') is null
       or (prior_ref.value is not null and prior_ref.value#>>'{}' >= current_ref.value#>>'{}')
  ) then raise exception 'Base Word family authority v2 provenance lists must be uniquely sorted'; end if;

  select coalesce(array_agg((source->>'sourceId')::uuid order by (source->>'sourceId')::uuid),array[]::uuid[])
    into v_declared_batch_ids
  from jsonb_array_elements(p_manifest->'sourceAuthorities') source
  where source->>'sourceKind'='teaching_dictionary_import_batch';

  if exists (
    select 1
    from jsonb_array_elements(p_manifest->'families') with ordinality current_family(value, ordinality)
    left join jsonb_array_elements(p_manifest->'families') with ordinality prior_family(value, ordinality)
      on prior_family.ordinality=current_family.ordinality-1
    where prior_family.value is not null
      and concat(prior_family.value->>'baseFamilyKey', E'\x1f', prior_family.value->>'familyId') >=
          concat(current_family.value->>'baseFamilyKey', E'\x1f', current_family.value->>'familyId')
  ) then raise exception 'Base Word family authority v2 families must be uniquely sorted'; end if;

  for v_family in select value from jsonb_array_elements(p_manifest->'families') loop
    if jsonb_typeof(v_family) <> 'object'
       or (select count(*) from jsonb_object_keys(v_family)) <> 7
       or nullif(v_family->>'familyId','') is null
       or nullif(btrim(v_family->>'baseFamilyKey'),'') is null
       or nullif(v_family->>'baseWordId','') is null
       or nullif(btrim(v_family->>'baseMeaning'),'') is null
       or jsonb_typeof(v_family->'etymologyRoute') <> 'object'
       or jsonb_typeof(v_family->'members') <> 'array'
       or jsonb_array_length(v_family->'members') < 2
       or nullif(v_family->>'sourceFingerprint','') !~ '^[a-f0-9]{64}$' then
      raise exception 'Base Word family authority v2 contains an invalid family';
    end if;
    select * into v_source_family
    from public.canonical_teaching_dictionary_base_word_families family
    where family.id = (v_family->>'familyId')::uuid
      and family.base_family_key = v_family->>'baseFamilyKey'
      and family.base_word_id = (v_family->>'baseWordId')::uuid
      and family.base_meaning = v_family->>'baseMeaning'
      and family.etymology_route = v_family->'etymologyRoute'
      and family.source_row_hash = v_family->>'sourceFingerprint'
      and family.row_status = 'active'
      and family.review_status = 'approved_for_first_exposure'
    for share;
    if not found then raise exception 'Base Word family authority v2 family source drifted'; end if;
    v_used_batch_ids := array_append(v_used_batch_ids, v_source_family.import_batch_id);
    select * into strict v_base_word from public.canonical_teaching_dictionary_words
    where id = v_source_family.base_word_id and row_status = 'active'
      and review_status = 'approved_for_first_exposure' for share;
    if (select count(*) from jsonb_array_elements(v_family->'members') member
        where member->>'structuralRole' = 'base') <> 1
       or (select count(*) from jsonb_array_elements(v_family->'members') member
           where member->>'structuralRole' = 'base'
             and member->>'canonicalWordId' = v_family->>'baseWordId') <> 1 then
      raise exception 'Base Word family authority v2 requires one exact structural base member';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_family->'members') with ordinality current_member(value, ordinality)
      left join jsonb_array_elements(v_family->'members') with ordinality prior_member(value, ordinality)
        on prior_member.ordinality=current_member.ordinality-1
      where prior_member.value is not null
        and concat(prior_member.value->>'canonicalWordId', E'\x1f', prior_member.value->>'memberId') >=
            concat(current_member.value->>'canonicalWordId', E'\x1f', current_member.value->>'memberId')
    ) then raise exception 'Base Word family authority v2 members must be uniquely sorted'; end if;

    for v_member in select value from jsonb_array_elements(v_family->'members') loop
      if jsonb_typeof(v_member) <> 'object'
         or (select count(*) from jsonb_object_keys(v_member)) <> 13
         or nullif(v_member->>'memberId','') is null
         or nullif(v_member->>'canonicalWordId','') is null
         or v_member->>'structuralRole' not in ('base','family_member')
         or jsonb_typeof(v_member->'applicableMicroSkillKeys') <> 'array'
         or jsonb_array_length(v_member->'applicableMicroSkillKeys') = 0
         or jsonb_typeof(v_member->'assignmentEligible') <> 'boolean'
         or nullif(btrim(v_member->>'wordSum'),'') is null
         or jsonb_typeof(v_member->'morphologyParts') <> 'array'
         or jsonb_array_length(v_member->'morphologyParts') = 0
         or jsonb_typeof(v_member->'morphologyJoins') <> 'array'
         or jsonb_typeof(v_member->'morphologyTransformations') <> 'array'
         or nullif(btrim(v_member->>'childFriendlyMeaning'),'') is null
         or jsonb_typeof(v_member->'morphologySource') <> 'object' then
        raise exception 'Base Word family authority v2 contains an invalid member';
      end if;
      if exists (
        select 1 from jsonb_array_elements_text(v_member->'applicableMicroSkillKeys') skill_key
        left join public.micro_skill_catalog skill on skill.micro_skill_key = skill_key
        where skill.micro_skill_key is null or skill.skill_cluster_key <> 'D4_MOR_BASE_WORDS'
          or not skill.is_active or not skill.is_assignable
      ) or (select count(*) from jsonb_array_elements_text(v_member->'applicableMicroSkillKeys')) <>
           (select count(distinct value) from jsonb_array_elements_text(v_member->'applicableMicroSkillKeys') value)
         or exists (
           select 1
           from jsonb_array_elements_text(v_member->'applicableMicroSkillKeys') with ordinality current_skill(value, ordinality)
           left join jsonb_array_elements_text(v_member->'applicableMicroSkillKeys') with ordinality prior_skill(value, ordinality)
             on prior_skill.ordinality=current_skill.ordinality-1
           where prior_skill.value is not null and prior_skill.value >= current_skill.value
      ) then
        raise exception 'Base Word family authority v2 member applicability is not exact Base Word cluster truth';
      end if;
      select * into strict v_member_word from public.canonical_teaching_dictionary_words
      where id=(v_member->>'canonicalWordId')::uuid and row_status='active'
        and review_status='approved_for_first_exposure' for share;
      v_source_kind := v_member#>>'{morphologySource,sourceKind}';
      v_source_id := v_member#>>'{morphologySource,sourceId}';
      if v_member#>>'{morphologySource,sourceFingerprint}' !~ '^[a-f0-9]{64}$'
         or nullif(btrim(v_member#>>'{morphologySource,sourceAuthorityKey}'),'') is null
         or not exists (select 1 from jsonb_array_elements(p_manifest->'sourceAuthorities') source
           where source->>'authorityKey'=v_member#>>'{morphologySource,sourceAuthorityKey}') then
        raise exception 'Base Word family authority v2 member source fingerprint is invalid';
      end if;
      if v_source_kind = 'base_word_family_member' then
        select * into v_source_member from public.canonical_teaching_dictionary_base_word_family_members member
        where member.id = v_source_id::uuid
          and member.base_word_family_id = v_source_family.id
          and member.import_batch_id = v_source_family.import_batch_id
          and member.canonical_word_id = (v_member->>'canonicalWordId')::uuid
          and member.source_row_hash = v_member#>>'{morphologySource,sourceFingerprint}'
          and member.word_sum = v_member->>'wordSum'
          and member.morphology_parts = v_member->'morphologyParts'
          and member.morphology_joins = v_member->'morphologyJoins'
          and member.morphology_transformations = v_member->'morphologyTransformations'
          and coalesce(member.transformation_notes,'') = coalesce(v_member->>'transformationNotes','')
          and member.child_friendly_meaning = v_member->>'childFriendlyMeaning'
          and member.assignment_eligible = (v_member->>'assignmentEligible')::boolean
          and member.row_status = 'active' and member.review_status = 'approved_for_first_exposure'
        for share;
        if not found then raise exception 'Base Word family authority v2 member source drifted'; end if;
        if (v_member->>'structuralRole' = 'base') is distinct from (v_source_member.member_role = 'base') then
          raise exception 'Base Word family authority v2 structural base role differs from its governed source member';
        end if;
        if not exists (
          select 1 from jsonb_array_elements(p_manifest->'sourceAuthorities') source
          where source->>'authorityKey'=v_member#>>'{morphologySource,sourceAuthorityKey}'
            and source->>'sourceKind'='teaching_dictionary_import_batch'
            and (source->>'sourceId')::uuid=v_source_member.import_batch_id
        ) then
          raise exception 'Base Word family authority v2 source member names the wrong batch authority';
        end if;
        if v_member->'applicableMicroSkillKeys' <> jsonb_build_array(v_source_family.micro_skill_key) then
          raise exception 'Base Word family authority v2 source member does not govern the declared micro-skill applicability';
        end if;
        v_used_batch_ids := array_append(v_used_batch_ids, v_source_member.import_batch_id);
      elsif v_source_kind = 'approved_repository_analysis' then
        if not exists (
          select 1 from jsonb_array_elements(p_manifest->'sourceAuthorities') source
          where source->>'authorityKey'=v_member#>>'{morphologySource,sourceAuthorityKey}'
            and source->>'sourceKind'='approved_repository_artifact'
        ) or jsonb_array_length(v_member->'applicableMicroSkillKeys') <> 1
          or v_source_id <> (v_member->'applicableMicroSkillKeys'->>0)||'::'||v_member_word.display_word then
          raise exception 'Base Word family authority v2 repository analysis lacks exact artifact/skill/word authority';
        end if;
      else
        raise exception 'Base Word family authority v2 member source kind is unsupported';
      end if;
    end loop;
  end loop;

  select array_agg(distinct batch_id order by batch_id) into v_used_batch_ids from unnest(v_used_batch_ids) batch_id;
  if v_used_batch_ids is distinct from v_declared_batch_ids then
    raise exception 'Base Word family authority v2 declared source batches do not match exact semantic sources';
  end if;
  for v_source_batch in select batch.* from public.canonical_teaching_dictionary_import_batches batch
    where batch.id = any(v_used_batch_ids) for share loop
    if v_source_batch.batch_status <> 'applied' then
      raise exception 'Base Word family authority v2 requires applied immutable source batches';
    end if;
    if p_source_classification = 'release_ledger' and (
      v_source_batch.release_id is null or v_source_batch.package_sha256 is null or v_source_batch.verified_at is null
    ) then raise exception 'Base Word family authority v2 release-ledger provenance is incomplete'; end if;
    if p_source_classification = 'legacy_pre_release_ledger_projection' and (
      v_source_batch.release_id is not null or v_source_batch.created_at >= v_legacy_cutoff
    ) then raise exception 'Base Word family authority v2 legacy source is after the hard cutoff'; end if;
    if p_source_classification = 'composite_release_and_legacy_projection' and not (
      (v_source_batch.release_id is not null and v_source_batch.package_sha256 is not null and v_source_batch.verified_at is not null)
      or (v_source_batch.release_id is null and v_source_batch.created_at < v_legacy_cutoff)
    ) then raise exception 'Base Word family authority v2 composite provenance contains an ungoverned batch'; end if;
    select source into strict v_source_authority
    from jsonb_array_elements(p_manifest->'sourceAuthorities') source
    where source->>'sourceKind' = 'teaching_dictionary_import_batch'
      and (source->>'sourceId')::uuid = v_source_batch.id;
    v_expected_source_fingerprint := case
      when v_source_batch.release_id is not null then v_source_batch.package_sha256
      else public.adle_canonical_json_sha256_v1(jsonb_build_object(
        'importBatchId', v_source_batch.id,
        'sourceFolderSha256', v_source_batch.source_folder_sha256,
        'validatorVersion', v_source_batch.validator_version,
        'importMode', v_source_batch.import_mode,
        'createdAt', v_source_batch.created_at
      ))
    end;
    if v_source_authority->>'sourceFingerprint' is distinct from v_expected_source_fingerprint then
      raise exception 'Base Word family authority v2 source-batch fingerprint drifted';
    end if;
  end loop;

  v_projection := jsonb_build_object(
    'schemaVersion', 2,
    'skillClusterKey', 'D4_MOR_BASE_WORDS',
    'sourceAuthorities', p_manifest->'sourceAuthorities',
    'families', p_manifest->'families'
  );
  v_manifest_sha256 := public.adle_canonical_json_sha256_v1(p_manifest);
  v_semantic_fingerprint := public.adle_canonical_json_sha256_v1(v_projection);
  insert into public.adle_curriculum_dependency_authorities (
    authority_key, authority_type, schema_version, source_classification,
    manifest_file_sha256, authority_manifest, authority_manifest_sha256,
    semantic_projection, semantic_fingerprint, source_provenance, approval_refs, published_by
  ) values (
    p_manifest->>'authorityKey', 'family_membership', 2, p_source_classification,
    p_manifest_file_sha256, p_manifest, v_manifest_sha256, v_projection,
    v_semantic_fingerprint,
    jsonb_build_object('sourceAuthorities', p_manifest->'sourceAuthorities',
      'legacyCutoff', v_legacy_cutoff, 'memberSourceKinds', jsonb_build_array(
        'base_word_family_member','approved_repository_analysis')),
    p_manifest->'approvalRefs', p_published_by
  ) on conflict (authority_type, authority_key) do nothing returning id into v_authority_id;
  if v_authority_id is null then
    select id into v_authority_id from public.adle_curriculum_dependency_authorities
    where authority_type = 'family_membership'
      and authority_key = p_manifest->>'authorityKey'
      and schema_version = 2
      and authority_manifest = p_manifest
      and manifest_file_sha256 = p_manifest_file_sha256
      and semantic_fingerprint = v_semantic_fingerprint
      and source_classification = p_source_classification;
    if v_authority_id is null then
      raise exception 'Base Word family authority v2 key already names different immutable semantics';
    end if;
  end if;
  return v_authority_id;
end;
$$;

revoke all on function public.publish_adle_base_word_family_membership_authority_v2(jsonb,text,text,text)
  from public, anon, authenticated;
grant execute on function public.publish_adle_base_word_family_membership_authority_v2(jsonb,text,text,text)
  to service_role;

comment on function public.publish_adle_base_word_family_membership_authority_v2(jsonb,text,text,text) is
  'Publishes cluster-shared immutable Base Word family truth. Learner authenticity and assignment slot roles are deliberately excluded.';

-- Release manifests remain the single immutable combination authority. Allow
-- only the family-membership dependency to adopt schema v2; teaching content
-- and Teaching Dictionary closure stay on their independently reviewed v1
-- contracts. Route ownership comes from the canonical Base Word cluster.
do $migration$
declare
  v_signature constant text := 'public.publish_adle_curriculum_release_v2(jsonb,text,text)';
  v_definition text;
  v_old_schema text := $old$or dependency.value->>'authoritySchemaVersion' <> '1'$old$;
  v_new_schema text := $new$or (dependency.value->>'authorityType' = 'family_membership'
           and dependency.value->>'authoritySchemaVersion' not in ('1','2'))
         or (dependency.value->>'authorityType' <> 'family_membership'
           and dependency.value->>'authoritySchemaVersion' <> '1')$new$;
  v_old_skill text := $old$if v_skill->>'microSkillKey' not in (
      'D4_MOR_BASE_WORDS_IDENTIFY_BASE',
      'D4_MOR_BASE_WORDS_PRESERVE_BASE'
    ) then raise exception 'micro-skill is not yet governed by ADLE release authority v2'; end if;$old$;
  v_new_skill text := $new$if not public.adle_micro_skill_owns_base_word_lab_v2(v_skill->>'microSkillKey') then
      raise exception 'micro-skill is not governed by the Base Word route release authority';
    end if;$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null or position(v_old_schema in v_definition)=0 or position(v_old_skill in v_definition)=0 then
    raise exception 'curriculum release publisher predecessor differs from the reviewed Base Word contract';
  end if;
  v_definition := replace(replace(v_definition,v_old_schema,v_new_schema),v_old_skill,v_new_skill);
  if position(v_old_schema in v_definition)>0 or position(v_old_skill in v_definition)>0
     or position(v_new_schema in v_definition)=0 or position(v_new_skill in v_definition)=0 then
    raise exception 'curriculum release publisher Base Word v2 replacement was not exact';
  end if;
  execute v_definition;
end;
$migration$;

commit;
