-- BW-2A-2: publish immutable Base Word dependencies and carry one exact
-- release/activation revision through intake and assignment persistence.
-- This migration creates no release, activation, assignment, or learner row.

begin;

create or replace function public.publish_adle_base_word_family_membership_authority_v1(
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
  v_batch public.canonical_teaching_dictionary_import_batches%rowtype;
  v_families jsonb;
  v_legacy_cutoff constant timestamptz := '2026-07-26 00:00:00+00'::timestamptz;
begin
  if p_manifest_file_sha256 !~ '^[a-f0-9]{64}$'
     or p_source_classification not in ('release_ledger', 'legacy_pre_release_ledger_projection')
     or nullif(btrim(p_published_by), '') is null
     or jsonb_typeof(p_manifest) <> 'object'
     or (select count(*) from jsonb_object_keys(p_manifest)) <> 6
     or p_manifest->>'schemaVersion' <> '1'
     or nullif(btrim(p_manifest->>'authorityKey'), '') is null
     or p_manifest->>'microSkillKey' not in (
       'D4_MOR_BASE_WORDS_IDENTIFY_BASE', 'D4_MOR_BASE_WORDS_PRESERVE_BASE'
     )
     or nullif(p_manifest->>'importBatchId', '') is null
     or jsonb_typeof(p_manifest->'approvalRefs') <> 'array'
     or jsonb_array_length(p_manifest->'approvalRefs') = 0
     or jsonb_typeof(p_manifest->'families') <> 'array'
     or jsonb_array_length(p_manifest->'families') = 0 then
    raise exception 'invalid Base Word family membership authority manifest';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_manifest->'approvalRefs') with ordinality current_ref(value, ordinality)
    left join jsonb_array_elements(p_manifest->'approvalRefs') with ordinality prior_ref(value, ordinality)
      on prior_ref.ordinality = current_ref.ordinality - 1
    where jsonb_typeof(current_ref.value) <> 'string'
       or nullif(btrim(current_ref.value#>>'{}'), '') is null
       or (prior_ref.value is not null and prior_ref.value#>>'{}' >= current_ref.value#>>'{}')
  ) then raise exception 'Base Word family approval refs must be uniquely sorted'; end if;

  select * into v_batch from public.canonical_teaching_dictionary_import_batches
  where id = (p_manifest->>'importBatchId')::uuid for share;
  if not found or v_batch.batch_status <> 'applied' then
    raise exception 'Base Word family authority requires an applied immutable batch';
  end if;
  if p_source_classification = 'release_ledger' and (
    v_batch.release_id is null or v_batch.package_sha256 is null or v_batch.verified_at is null
  ) then raise exception 'Base Word family authority requires verified release-ledger provenance'; end if;
  if p_source_classification = 'legacy_pre_release_ledger_projection' and (
    v_batch.release_id is not null or v_batch.created_at >= v_legacy_cutoff
  ) then raise exception 'legacy Base Word family authority is restricted to pre-ledger data'; end if;

  select jsonb_agg(jsonb_build_object(
    'familyId', family.id,
    'baseFamilyKey', family.base_family_key,
    'baseWordId', family.base_word_id,
    'baseMeaning', family.base_meaning,
    'etymologyRoute', family.etymology_route,
    'members', (
      select jsonb_agg(jsonb_build_object(
        'memberId', member.id,
        'canonicalWordId', member.canonical_word_id,
        'memberRole', member.member_role,
        'assignmentEligible', member.assignment_eligible,
        'complexityLevel', null,
        'wordSum', member.word_sum,
        'morphologyParts', member.morphology_parts,
        'morphologyJoins', member.morphology_joins,
        'morphologyTransformations', member.morphology_transformations,
        'transformationNotes', coalesce(member.transformation_notes, ''),
        'childFriendlyMeaning', member.child_friendly_meaning
      ) order by member.canonical_word_id::text, member.id::text)
      from public.canonical_teaching_dictionary_base_word_family_members member
      where member.base_word_family_id = family.id
        and member.import_batch_id = family.import_batch_id
        and member.row_status = 'active'
        and member.review_status = 'approved_for_first_exposure'
    )
  ) order by family.base_family_key, family.id::text)
  into v_families
  from public.canonical_teaching_dictionary_base_word_families family
  where family.import_batch_id = v_batch.id
    and family.micro_skill_key = p_manifest->>'microSkillKey'
    and family.row_status = 'active'
    and family.review_status = 'approved_for_first_exposure';

  if v_families is null or exists (
    select 1 from jsonb_array_elements(v_families) family
    where family->'etymologyRoute' = 'null'::jsonb
       or jsonb_typeof(family->'members') <> 'array'
       or jsonb_array_length(family->'members') = 0
       or not exists (
         select 1 from jsonb_array_elements(family->'members') member
         where member->>'memberRole' = 'base'
           and (member->>'canonicalWordId')::uuid = (family->>'baseWordId')::uuid
           and (member->>'assignmentEligible')::boolean
       )
       or exists (
         select 1 from jsonb_array_elements(family->'members') member
         where nullif(btrim(member->>'childFriendlyMeaning'), '') is null
            or jsonb_typeof(member->'morphologyParts') <> 'array'
            or jsonb_array_length(member->'morphologyParts') = 0
            or jsonb_typeof(member->'morphologyJoins') <> 'array'
            or jsonb_typeof(member->'morphologyTransformations') <> 'array'
       )
  ) then raise exception 'Base Word family authority source is incomplete'; end if;
  if p_manifest->'families' <> v_families then
    raise exception 'Base Word family semantic projection disagrees with reviewed source rows';
  end if;

  v_projection := jsonb_build_object(
    'schemaVersion', 1,
    'microSkillKey', p_manifest->>'microSkillKey',
    'importBatchId', p_manifest->>'importBatchId',
    'families', v_families
  );
  v_manifest_sha256 := public.adle_canonical_json_sha256_v1(p_manifest);
  v_semantic_fingerprint := public.adle_canonical_json_sha256_v1(v_projection);
  insert into public.adle_curriculum_dependency_authorities (
    authority_key, authority_type, schema_version, source_classification,
    manifest_file_sha256, authority_manifest, authority_manifest_sha256,
    semantic_projection, semantic_fingerprint, source_provenance, approval_refs, published_by
  ) values (
    p_manifest->>'authorityKey', 'family_membership', 1, p_source_classification,
    p_manifest_file_sha256, p_manifest, v_manifest_sha256, v_projection,
    v_semantic_fingerprint,
    jsonb_build_object('importBatchId', v_batch.id, 'releaseId', v_batch.release_id,
      'packageSha256', v_batch.package_sha256, 'legacyCutoff', v_legacy_cutoff),
    p_manifest->'approvalRefs', p_published_by
  ) on conflict (authority_type, authority_key) do nothing returning id into v_authority_id;
  if v_authority_id is null then
    select id into v_authority_id from public.adle_curriculum_dependency_authorities
    where authority_type = 'family_membership'
      and authority_key = p_manifest->>'authorityKey'
      and authority_manifest = p_manifest
      and manifest_file_sha256 = p_manifest_file_sha256
      and semantic_fingerprint = v_semantic_fingerprint
      and source_classification = p_source_classification;
    if v_authority_id is null then
      raise exception 'Base Word family authority key already names different immutable semantics';
    end if;
  end if;
  return v_authority_id;
end;
$$;

revoke all on function public.publish_adle_base_word_family_membership_authority_v1(jsonb,text,text,text)
  from public, anon, authenticated;
grant execute on function public.publish_adle_base_word_family_membership_authority_v1(jsonb,text,text,text)
  to service_role;

create or replace function public.publish_adle_base_word_teaching_content_authority_v1(
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
  v_content public.canonical_teaching_dictionary_content_versions%rowtype;
  v_batch public.canonical_teaching_dictionary_import_batches%rowtype;
  v_legacy_cutoff constant timestamptz := '2026-07-26 00:00:00+00'::timestamptz;
begin
  if p_manifest_file_sha256 !~ '^[a-f0-9]{64}$'
     or p_source_classification not in ('release_ledger', 'legacy_pre_release_ledger_projection')
     or nullif(btrim(p_published_by), '') is null
     or jsonb_typeof(p_manifest) <> 'object'
     or (select count(*) from jsonb_object_keys(p_manifest)) <> 5
     or p_manifest->>'schemaVersion' <> '1'
     or nullif(btrim(p_manifest->>'authorityKey'), '') is null
     or p_manifest->>'microSkillKey' not in (
       'D4_MOR_BASE_WORDS_IDENTIFY_BASE', 'D4_MOR_BASE_WORDS_PRESERVE_BASE'
     )
     or jsonb_typeof(p_manifest->'content') <> 'object'
     or nullif(p_manifest#>>'{content,contentVersionId}', '') is null
     or jsonb_typeof(p_manifest->'approvalRefs') <> 'array'
     or jsonb_array_length(p_manifest->'approvalRefs') = 0 then
    raise exception 'invalid Base Word teaching-content authority manifest';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_manifest->'approvalRefs') with ordinality current_ref(value, ordinality)
    left join jsonb_array_elements(p_manifest->'approvalRefs') with ordinality prior_ref(value, ordinality)
      on prior_ref.ordinality = current_ref.ordinality - 1
    where jsonb_typeof(current_ref.value) <> 'string'
       or nullif(btrim(current_ref.value#>>'{}'), '') is null
       or (prior_ref.value is not null and prior_ref.value#>>'{}' >= current_ref.value#>>'{}')
  ) then raise exception 'Base Word teaching-content approval refs must be uniquely sorted'; end if;

  select * into v_content from public.canonical_teaching_dictionary_content_versions
  where id = (p_manifest#>>'{content,contentVersionId}')::uuid
    and micro_skill_key = p_manifest->>'microSkillKey'
    and version_status = 'active' and is_active
    and final_readiness_review_status = 'signed_off'
  for share;
  if not found or nullif(btrim(v_content.teaching_objective), '') is null
     or nullif(btrim(v_content.child_friendly_explanation), '') is null
     or nullif(btrim(v_content.rule_explanation), '') is null then
    raise exception 'Base Word teaching content is not active, signed off, and complete';
  end if;
  select * into strict v_batch from public.canonical_teaching_dictionary_import_batches
  where id = v_content.import_batch_id for share;
  if v_batch.batch_status <> 'applied' then raise exception 'Base Word teaching content batch is not applied'; end if;
  if p_source_classification = 'release_ledger' and (
    v_batch.release_id is null or v_batch.package_sha256 is null or v_batch.verified_at is null
  ) then raise exception 'Base Word teaching content requires verified release-ledger provenance'; end if;
  if p_source_classification = 'legacy_pre_release_ledger_projection' and (
    v_batch.release_id is not null or v_batch.created_at >= v_legacy_cutoff
  ) then raise exception 'legacy Base Word teaching content is restricted to pre-ledger data'; end if;

  v_projection := jsonb_build_object(
    'schemaVersion', 1,
    'microSkillKey', v_content.micro_skill_key,
    'contentVersionId', v_content.id,
    'contentVersion', v_content.content_version,
    'teachingObjective', v_content.teaching_objective,
    'childFriendlyExplanation', v_content.child_friendly_explanation,
    'ruleExplanation', v_content.rule_explanation,
    'memoryTip', coalesce(v_content.memory_tip, ''),
    'commonMisconceptions', coalesce(v_content.common_misconceptions, ''),
    'firstExposureProgression', v_content.first_exposure_progression,
    'guidedPracticeProgression', v_content.guided_practice_progression,
    'reviewProofreadingProgression', v_content.review_proofreading_progression,
    'exampleSelectionGuidance', coalesce(v_content.example_selection_guidance, ''),
    'contrastPolicyGuidance', coalesce(v_content.contrast_policy_guidance, '')
  );
  if p_manifest->'content' <> v_projection - 'schemaVersion' - 'microSkillKey' then
    raise exception 'Base Word teaching-content projection disagrees with reviewed source row';
  end if;
  v_manifest_sha256 := public.adle_canonical_json_sha256_v1(p_manifest);
  v_semantic_fingerprint := public.adle_canonical_json_sha256_v1(v_projection);
  insert into public.adle_curriculum_dependency_authorities (
    authority_key, authority_type, schema_version, source_classification,
    manifest_file_sha256, authority_manifest, authority_manifest_sha256,
    semantic_projection, semantic_fingerprint, source_provenance, approval_refs, published_by
  ) values (
    p_manifest->>'authorityKey', 'teaching_content', 1, p_source_classification,
    p_manifest_file_sha256, p_manifest, v_manifest_sha256, v_projection,
    v_semantic_fingerprint,
    jsonb_build_object('contentVersionId', v_content.id, 'importBatchId', v_batch.id,
      'sourceRowHash', v_content.source_row_hash, 'releaseId', v_batch.release_id,
      'packageSha256', v_batch.package_sha256, 'legacyCutoff', v_legacy_cutoff),
    p_manifest->'approvalRefs', p_published_by
  ) on conflict (authority_type, authority_key) do nothing returning id into v_authority_id;
  if v_authority_id is null then
    select id into v_authority_id from public.adle_curriculum_dependency_authorities
    where authority_type = 'teaching_content'
      and authority_key = p_manifest->>'authorityKey'
      and authority_manifest = p_manifest
      and manifest_file_sha256 = p_manifest_file_sha256
      and semantic_fingerprint = v_semantic_fingerprint
      and source_classification = p_source_classification;
    if v_authority_id is null then
      raise exception 'Base Word teaching-content key already names different immutable semantics';
    end if;
  end if;
  return v_authority_id;
end;
$$;

revoke all on function public.publish_adle_base_word_teaching_content_authority_v1(jsonb,text,text,text)
  from public, anon, authenticated;
grant execute on function public.publish_adle_base_word_teaching_content_authority_v1(jsonb,text,text,text)
  to service_role;

alter table public.adle_canonical_intake_candidates
  add column route_activation_revision_id uuid null references public.adle_route_activation_revisions(id) on delete restrict,
  add column curriculum_release_manifest_id uuid null references public.adle_curriculum_release_manifests(id) on delete restrict,
  add column curriculum_release_manifest_sha256 text null,
  add column curriculum_dependency_fingerprint text null;

alter table public.adle_canonical_intake_candidates
  add constraint adle_canonical_intake_candidates_release_authority_check check (
    (route_activation_revision_id is null and curriculum_release_manifest_id is null
      and curriculum_release_manifest_sha256 is null and curriculum_dependency_fingerprint is null)
    or
    (route_id = 'base_word_lab' and route_version = 'v2'
      and route_activation_revision_id is not null and curriculum_release_manifest_id is not null
      and curriculum_release_manifest_sha256 ~ '^[a-f0-9]{64}$'
      and curriculum_dependency_fingerprint ~ '^[a-f0-9]{64}$')
  );

drop function public.adle_persist_canonical_intake(
  uuid, uuid, text, uuid, uuid, text, text, text, date, text, text, uuid
);

create function public.adle_persist_canonical_intake(
  p_child_id uuid,
  p_canonical_word_id uuid,
  p_micro_skill_key text,
  p_candidate_mapping_id uuid,
  p_canonical_mapping_id uuid,
  p_misspelling_normalized text,
  p_correct_spelling_normalized text,
  p_source_ref text,
  p_verified_on date,
  p_route_id text,
  p_route_version text,
  p_route_activation_id uuid default null,
  p_release_manifest_id uuid default null,
  p_release_manifest_sha256 text default null,
  p_dependency_fingerprint text default null
)
returns table (learning_item_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learning_item_id uuid;
  v_inserted boolean := false;
  v_candidate public.adle_canonical_intake_candidates%rowtype;
  v_existing_candidate public.adle_canonical_intake_candidates%rowtype;
  v_source public.parent_verified_spelling_candidate_mappings%rowtype;
  v_route_id text;
  v_route_version text;
  v_is_affix boolean := p_micro_skill_key in (
    'D4_MOR_SUFFIXES_AL','D4_MOR_SUFFIXES_ABLE_IBLE','D4_MOR_SUFFIXES_FUL_LESS',
    'D4_MOR_SUFFIXES_ITY','D4_MOR_SUFFIXES_LY','D4_MOR_SUFFIXES_MENT',
    'D4_MOR_SUFFIXES_NESS','D4_MOR_SUFFIXES_OUS','D4_MOR_SUFFIXES_SION','D4_MOR_SUFFIXES_TION'
  );
  v_is_base_word boolean := p_micro_skill_key in (
    'D4_MOR_BASE_WORDS_IDENTIFY_BASE','D4_MOR_BASE_WORDS_PRESERVE_BASE'
  );
begin
  perform pg_advisory_xact_lock(hashtextextended(
    p_child_id::text || ':' || p_canonical_word_id::text || ':' || p_micro_skill_key, 0
  ));
  select * into v_source from public.parent_verified_spelling_candidate_mappings c
  where c.id = p_candidate_mapping_id and c.child_id = p_child_id
    and c.misspelling_normalized = p_misspelling_normalized
    and c.correct_spelling_normalized = p_correct_spelling_normalized
    and c.micro_skill_key = p_micro_skill_key
    and c.candidate_status = any(array['parent_local_promoted','global_canonical_promoted'])
  for update;
  if not found or v_source.task_submission_id is null then
    raise exception 'canonical intake candidate identity is no longer approved';
  end if;

  if v_is_base_word then
    if p_route_id <> 'base_word_lab' or p_route_version <> 'v2' then
      raise exception 'Base Word candidate must request base_word_lab:v2';
    end if;
    if p_route_activation_id is null or p_release_manifest_id is null
       or p_release_manifest_sha256 !~ '^[a-f0-9]{64}$'
       or p_dependency_fingerprint !~ '^[a-f0-9]{64}$' then
      raise exception 'Base Word candidate requires exact release and activation-revision authority';
    end if;
    perform 1
    from public.adle_route_activation_heads head
    join public.adle_route_activation_revisions revision on revision.id = head.current_revision_id
    join public.adle_curriculum_release_manifests release on release.id = revision.release_manifest_id
    join public.micro_skill_catalog skill on skill.micro_skill_key = revision.micro_skill_key
    where revision.id = p_route_activation_id
      and release.id = p_release_manifest_id
      and revision.activation_status = 'enabled'
      and revision.route_id = 'base_word_lab' and revision.route_version = 'v2'
      and revision.activation_route_key = 'base_word_family_v1'
      and revision.micro_skill_key = p_micro_skill_key
      and revision.release_manifest_sha256 = p_release_manifest_sha256
      and revision.dependency_fingerprint = p_dependency_fingerprint
      and release.release_manifest_sha256 = p_release_manifest_sha256
      and release.dependency_fingerprint = p_dependency_fingerprint
      and release.payload_version = 1
      and skill.mastery_domain_key = 'D4' and skill.is_active and skill.is_assignable
    for share of head, revision, release, skill;
    if not found or not public.adle_route_activation_revision_is_current_v2(
      p_route_activation_id, p_release_manifest_id,
      p_release_manifest_sha256, p_dependency_fingerprint
    ) then raise exception 'Base Word release authority is no longer current for new intake'; end if;
    if not exists (
      select 1
      from public.adle_curriculum_release_dependencies family_dependency
      join public.adle_curriculum_dependency_authorities family_authority
        on family_authority.id = family_dependency.authority_id
      join public.adle_curriculum_release_dependencies closure_dependency
        on closure_dependency.release_manifest_id = family_dependency.release_manifest_id
       and closure_dependency.micro_skill_key = family_dependency.micro_skill_key
       and closure_dependency.authority_type = 'teaching_dictionary_closure'
      join public.adle_teaching_dictionary_closure_words closure_word
        on closure_word.authority_id = closure_dependency.authority_id
       and closure_word.canonical_word_id = p_canonical_word_id
      where family_dependency.release_manifest_id = p_release_manifest_id
        and family_dependency.micro_skill_key = p_micro_skill_key
        and family_dependency.authority_type = 'family_membership'
        and exists (
          select 1
          from jsonb_array_elements(family_authority.semantic_projection->'families') family,
               jsonb_array_elements(family->'members') member
          where (member->>'canonicalWordId')::uuid = p_canonical_word_id
            and member->>'memberRole' = 'authentic_target'
            and (member->>'assignmentEligible')::boolean
        )
        and exists (
          select 1 from public.adle_curriculum_release_dependencies teaching_dependency
          where teaching_dependency.release_manifest_id = p_release_manifest_id
            and teaching_dependency.micro_skill_key = p_micro_skill_key
            and teaching_dependency.authority_type = 'teaching_content'
        )
    ) then raise exception 'Base Word candidate is not an exact release-bound authentic target'; end if;
    select * into v_existing_candidate from public.adle_canonical_intake_candidates
    where source_candidate_mapping_id = p_candidate_mapping_id for update;
    if found and v_existing_candidate.curriculum_release_manifest_id is not null and (
      v_existing_candidate.route_activation_revision_id <> p_route_activation_id
      or v_existing_candidate.curriculum_release_manifest_id <> p_release_manifest_id
      or v_existing_candidate.curriculum_release_manifest_sha256 <> p_release_manifest_sha256
      or v_existing_candidate.curriculum_dependency_fingerprint <> p_dependency_fingerprint
    ) then raise exception 'canonical intake candidate already retains different immutable release provenance'; end if;
    v_route_id := 'base_word_lab'; v_route_version := 'v2';
  else
    if not exists (
      select 1 from public.canonical_teaching_dictionary_words w
      where w.id = p_canonical_word_id and w.normalised_word = p_correct_spelling_normalized
        and w.row_status = 'active' and w.review_status = 'approved_for_first_exposure'
    ) then raise exception 'canonical intake target identity is no longer assignment-approved'; end if;
    if v_is_affix then
      if p_route_id <> 'dynamic_affix_word_lab' or p_route_version <> 'v3' then
        raise exception 'Dynamic Affix candidate must request dynamic_affix_word_lab:v3';
      end if;
      if not exists (
        select 1 from public.canonical_teaching_dictionary_suffix_profiles profile
        join public.canonical_teaching_dictionary_suffix_members member on member.suffix_profile_id = profile.id
        join public.micro_skill_catalog skill on skill.micro_skill_key = profile.micro_skill_key
        where profile.micro_skill_key = p_micro_skill_key and profile.production_enabled
          and profile.row_status = 'active' and profile.review_status = 'approved_for_first_exposure'
          and skill.mastery_domain_key = 'D4' and skill.is_active and skill.is_assignable
          and member.canonical_word_id = p_canonical_word_id and member.assignment_eligible
          and member.row_status = 'active' and member.review_status = 'approved_for_first_exposure'
      ) then raise exception 'Dynamic Affix candidate is not an exact production-ready profile member'; end if;
      v_route_id := 'dynamic_affix_word_lab'; v_route_version := 'v3';
    elsif p_micro_skill_key like 'D4_MOR_PREFIXES_%' then
      if p_route_id <> 'dynamic_prefix_word_lab' or p_route_version <> 'v2' then
        raise exception 'Dynamic Prefix candidate requested an invalid route';
      end if;
      v_route_id := 'dynamic_prefix_word_lab'; v_route_version := 'v2';
    else
      if p_route_id <> 'adle_word_level' or p_route_version <> 'v1' then
        raise exception 'generic candidate requested an invalid route';
      end if;
      v_route_id := 'adle_word_level'; v_route_version := 'v1';
    end if;
  end if;

  select item.id into v_learning_item_id from public.adle_learning_items item
  where item.child_id = p_child_id and item.canonical_word_id = p_canonical_word_id
    and item.micro_skill_key = p_micro_skill_key and item.row_status = 'active'
  order by item.intake_on desc, item.id limit 1;
  if v_learning_item_id is null then
    insert into public.adle_learning_items (
      child_id, canonical_word_id, micro_skill_key, item_status, source_kind,
      source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status
    ) values (
      p_child_id, p_canonical_word_id, p_micro_skill_key, 'pending', 'verified_misspelling',
      p_source_ref, p_misspelling_normalized, false, null, p_verified_on, 'active'
    ) returning id into v_learning_item_id;
    v_inserted := true;
  end if;
  insert into public.adle_learning_item_sources (
    learning_item_id,parent_verified_candidate_mapping_id,canonical_mapping_id,
    misspelling_normalized,correct_spelling_normalized,micro_skill_key,source_ref,row_status
  ) values (
    v_learning_item_id,p_candidate_mapping_id,p_canonical_mapping_id,
    p_misspelling_normalized,p_correct_spelling_normalized,p_micro_skill_key,p_source_ref,'active'
  ) on conflict do nothing;

  insert into public.adle_canonical_intake_candidates (
    source_candidate_mapping_id,source_submission_id,child_id,normalized_target_token,
    canonical_word_id,target_identity_status,route_id,route_version,micro_skill_key,
    candidate_state,blockers,readiness_fingerprint,last_evaluated_at,learning_item_id,
    activated_at,resolved_at,route_activation_revision_id,curriculum_release_manifest_id,
    curriculum_release_manifest_sha256,curriculum_dependency_fingerprint
  ) values (
    p_candidate_mapping_id,v_source.task_submission_id,p_child_id,lower(btrim(p_correct_spelling_normalized)),
    p_canonical_word_id,'established',v_route_id,v_route_version,p_micro_skill_key,
    'activated','[]'::jsonb,
    encode(extensions.digest(concat_ws(E'\x1f',p_candidate_mapping_id::text,p_canonical_mapping_id::text,
      p_canonical_word_id::text,p_micro_skill_key,v_route_id,v_route_version,
      coalesce(p_route_activation_id::text,''),coalesce(p_release_manifest_sha256,''),
      coalesce(p_dependency_fingerprint,'')),'sha256'),'hex'),
    timezone('utc',now()),v_learning_item_id,timezone('utc',now()),timezone('utc',now()),
    case when v_is_base_word then p_route_activation_id else null end,
    case when v_is_base_word then p_release_manifest_id else null end,
    case when v_is_base_word then p_release_manifest_sha256 else null end,
    case when v_is_base_word then p_dependency_fingerprint else null end
  ) on conflict (source_candidate_mapping_id) do update set
    canonical_word_id=excluded.canonical_word_id,target_identity_status='established',
    route_id=excluded.route_id,route_version=excluded.route_version,micro_skill_key=excluded.micro_skill_key,
    candidate_state='activated',blockers='[]'::jsonb,readiness_fingerprint=excluded.readiness_fingerprint,
    last_evaluated_at=excluded.last_evaluated_at,next_retry_at=null,learning_item_id=excluded.learning_item_id,
    activated_at=coalesce(public.adle_canonical_intake_candidates.activated_at,excluded.activated_at),
    resolved_at=excluded.resolved_at,
    route_activation_revision_id=coalesce(public.adle_canonical_intake_candidates.route_activation_revision_id,excluded.route_activation_revision_id),
    curriculum_release_manifest_id=coalesce(public.adle_canonical_intake_candidates.curriculum_release_manifest_id,excluded.curriculum_release_manifest_id),
    curriculum_release_manifest_sha256=coalesce(public.adle_canonical_intake_candidates.curriculum_release_manifest_sha256,excluded.curriculum_release_manifest_sha256),
    curriculum_dependency_fingerprint=coalesce(public.adle_canonical_intake_candidates.curriculum_dependency_fingerprint,excluded.curriculum_dependency_fingerprint),
    lock_version=public.adle_canonical_intake_candidates.lock_version+1,updated_at=timezone('utc',now())
  returning * into v_candidate;

  update public.adle_canonical_intake_candidate_demands set link_status='resolved',
    resolved_at=timezone('utc',now()),updated_at=timezone('utc',now())
  where candidate_id=v_candidate.id and link_status='waiting';
  update public.adle_canonical_intake_demands demand set lifecycle_status='activated',
    notification_status='resolved',activated_at=coalesce(demand.activated_at,timezone('utc',now())),
    notification_resolved_at=coalesce(demand.notification_resolved_at,timezone('utc',now())),
    last_reconciled_at=timezone('utc',now()),last_reconciliation_outcome='all_waiting_candidates_activated',
    updated_at=timezone('utc',now())
  where exists (select 1 from public.adle_canonical_intake_candidate_demands link where link.demand_id=demand.id and link.candidate_id=v_candidate.id)
    and not exists (select 1 from public.adle_canonical_intake_candidate_demands waiting where waiting.demand_id=demand.id and waiting.link_status='waiting');
  update public.adle_canonical_intake_reconciliation_queue set job_status='completed',
    completed_at=timezone('utc',now()),lease_owner=null,lease_expires_at=null,updated_at=timezone('utc',now())
  where candidate_id=v_candidate.id and job_status in ('pending','leased','retry');
  insert into public.adle_canonical_intake_events (candidate_id,event_type,actor_type,readiness_fingerprint,event_payload)
  values (v_candidate.id,'candidate_activated','reconciler',v_candidate.readiness_fingerprint,
    jsonb_build_object('learningItemId',v_learning_item_id,'inserted',v_inserted,
      'activationRevisionId',case when v_is_base_word then p_route_activation_id else null end,
      'releaseManifestId',case when v_is_base_word then p_release_manifest_id else null end));
  return query select v_learning_item_id,v_inserted;
end;
$$;

revoke all on function public.adle_persist_canonical_intake(
  uuid,uuid,text,uuid,uuid,text,text,text,date,text,text,uuid,uuid,text,text
) from public,anon,authenticated;
grant execute on function public.adle_persist_canonical_intake(
  uuid,uuid,text,uuid,uuid,text,text,text,date,text,text,uuid,uuid,text,text
) to service_role;

drop function public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb);

create function public.persist_adle_base_word_family_pilot_v2(
  p_parent_user_id uuid,
  p_child_id uuid,
  p_plan_date date,
  p_payload jsonb,
  p_items jsonb,
  p_route_metadata jsonb,
  p_activation_revision_id uuid default null,
  p_release_manifest_id uuid default null,
  p_release_manifest_sha256 text default null,
  p_dependency_fingerprint text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment_id uuid;
  v_item jsonb;
  v_position integer := 0;
  v_run_number integer;
  v_micro_skill_key text := p_payload->>'microSkillKey';
begin
  if not exists (select 1 from public.children where id=p_child_id and parent_user_id=p_parent_user_id and coalesce(is_archived,false)=false) then
    raise exception 'ADLE base-word pilot child ownership validation failed';
  end if;
  if not public.adle_lesson_route_metadata_is_valid_v2(p_route_metadata)
     or p_route_metadata#>>'{route,routeId}' <> 'base_word_lab'
     or p_route_metadata#>>'{route,routeVersion}' <> 'v2'
     or p_route_metadata#>>'{payload,kind}' <> 'base_word_family_snapshot_v1'
     or (p_route_metadata#>>'{payload,version}')::integer <> 1
     or (p_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid is distinct from p_activation_revision_id
     or (p_route_metadata#>>'{curriculumRelease,releaseManifestId}')::uuid is distinct from p_release_manifest_id
     or p_route_metadata#>>'{curriculumRelease,releaseManifestSha256}' is distinct from p_release_manifest_sha256
     or p_route_metadata#>>'{curriculumRelease,dependencyFingerprint}' is distinct from p_dependency_fingerprint then
    raise exception 'ADLE base-word route metadata/release authority validation failed';
  end if;
  if jsonb_typeof(p_payload)<>'object' or p_payload->>'experience'<>'D4_MOR_BASE_WORD_FAMILY'
     or v_micro_skill_key not in ('D4_MOR_BASE_WORDS_IDENTIFY_BASE','D4_MOR_BASE_WORDS_PRESERVE_BASE')
     or jsonb_array_length(coalesce(p_payload->'familySections','[]'::jsonb))<>2
     or jsonb_array_length(coalesce(p_payload->'authenticTargets','[]'::jsonb))<>2
     or jsonb_array_length(coalesce(p_payload->'independentWords','[]'::jsonb))<>6
     or jsonb_array_length(coalesce(p_payload->'independentSlots','[]'::jsonb))<>6
     or (select count(distinct value->>'baseFamilyKey') from jsonb_array_elements(p_payload->'familySections'))<>2
     or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(p_payload->'independentSlots'))<>6
     or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(p_payload->'independentWords'))<>6
     or (select count(*) from jsonb_array_elements(p_payload->'independentSlots') slot where slot->>'provenance'='authentic_target')<>2
     or (select count(*) from jsonb_array_elements(p_payload->'independentSlots') slot where slot->>'provenance'='transfer')<>4 then
    raise exception 'ADLE base-word pilot payload validation failed';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<>18 then
    raise exception 'ADLE base-word pilot requires exactly 18 assignment items';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('adle-base-word-family:'||p_child_id::text,0));
  select id into v_assignment_id from public.daily_assignments
  where child_id=p_child_id and parent_user_id=p_parent_user_id and assignment_date=p_plan_date
    and title='ADLE Base-word Family Pilot' and assignment_generation_source='adle_base_word_family_pilot_v1';
  if v_assignment_id is not null then return v_assignment_id; end if;

  perform 1 from public.adle_route_activation_heads head
  join public.adle_route_activation_revisions revision on revision.id=head.current_revision_id
  join public.adle_curriculum_release_manifests release on release.id=revision.release_manifest_id
  where revision.id=p_activation_revision_id and revision.release_manifest_id=p_release_manifest_id
    and revision.release_manifest_sha256=p_release_manifest_sha256
    and revision.dependency_fingerprint=p_dependency_fingerprint
    and revision.route_id='base_word_lab' and revision.route_version='v2'
    and revision.micro_skill_key=v_micro_skill_key and revision.activation_status='enabled'
    and release.release_key=p_route_metadata#>>'{curriculumRelease,releaseKey}'
  for share of head,revision,release;
  if not found or not public.adle_route_activation_revision_is_current_v2(
    p_activation_revision_id,p_release_manifest_id,p_release_manifest_sha256,p_dependency_fingerprint
  ) then raise exception 'Base Word release authority changed before assignment persistence'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'independentSlots') slot
    where not exists (
      select 1 from public.adle_curriculum_release_dependencies dependency
      join public.adle_curriculum_dependency_authorities authority on authority.id=dependency.authority_id
      where dependency.release_manifest_id=p_release_manifest_id and dependency.micro_skill_key=v_micro_skill_key
        and dependency.authority_type='family_membership'
        and exists (
          select 1 from jsonb_array_elements(authority.semantic_projection->'families') family,
            jsonb_array_elements(family->'members') member
          where family->>'baseFamilyKey'=slot->>'baseFamilyKey'
            and member->>'canonicalWordId'=slot->>'canonicalWordId'
            and (member->>'assignmentEligible')::boolean
            and ((slot->>'provenance'='authentic_target' and member->>'memberRole'='authentic_target')
              or (slot->>'provenance'='transfer' and member->>'memberRole' in ('base','transfer')))
        )
    )
  ) then raise exception 'Base Word assignment selection is outside its exact family authority'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'independentSlots') slot
    where (slot->>'provenance'='authentic_target' and (
      nullif(slot->>'learningItemId','') is null or not exists (
        select 1 from public.adle_learning_items item
        where item.id=(slot->>'learningItemId')::uuid and item.child_id=p_child_id
          and item.canonical_word_id=(slot->>'canonicalWordId')::uuid
          and item.micro_skill_key=v_micro_skill_key and item.row_status='active'
          and item.source_kind='verified_misspelling'
      )
    )) or (slot->>'provenance'='transfer' and nullif(slot->>'learningItemId','') is not null)
  ) then raise exception 'Base Word assignment authentic evidence provenance is invalid'; end if;
  if not exists (
    select 1 from public.adle_curriculum_release_dependencies dependency
    join public.adle_curriculum_dependency_authorities authority on authority.id=dependency.authority_id
    where dependency.release_manifest_id=p_release_manifest_id
      and dependency.micro_skill_key=v_micro_skill_key
      and dependency.authority_type='teaching_content'
      and authority.semantic_projection->>'contentVersion'=p_payload->>'contentVersion'
  ) then raise exception 'Base Word snapshot disagrees with its exact teaching-content authority'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'independentWords') word
    where not exists (
      select 1 from public.adle_curriculum_release_dependencies dependency
      join public.adle_teaching_dictionary_closure_words closure_word on closure_word.authority_id=dependency.authority_id
      where dependency.release_manifest_id=p_release_manifest_id and dependency.micro_skill_key=v_micro_skill_key
        and dependency.authority_type='teaching_dictionary_closure'
        and closure_word.canonical_word_id=(word->>'canonicalWordId')::uuid
        and closure_word.display_word=word->>'displayWord'
        and closure_word.dictation_sentence=word->>'dictationSentence'
        and closure_word.dictation_target_token_index=(word->>'dictationTargetTokenIndex')::integer
        and closure_word.audio_text=word->>'audioText'
    )
  ) then raise exception 'Base Word snapshot disagrees with its exact Teaching Dictionary closure'; end if;

  select count(*)+1 into v_run_number from public.adle_base_word_family_pilot_runs
  where child_id=p_child_id and run_status<>'cancelled';
  insert into public.daily_assignments (
    child_id,parent_user_id,assignment_date,title,status,target_words,review_words,
    assignment_generation_source,lesson_route_metadata
  ) values (
    p_child_id,p_parent_user_id,p_plan_date,'ADLE Base-word Family Pilot','pending',
    array(select value->>'displayWord' from jsonb_array_elements(p_payload->'independentWords')),
    array[]::text[],'adle_base_word_family_pilot_v1',p_route_metadata
  ) returning id into v_assignment_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_position:=v_position+1;
    if v_item->>'childId'<>p_child_id::text or v_item->>'parentUserId'<>p_parent_user_id::text
       or (v_item->>'position')::integer<>v_position or v_item->>'domainModule'<>'spelling'
       or v_item->>'itemType'<>'lesson' or v_item->>'sourceType'<>'adle_base_word_family_pilot'
       or v_item#>>'{metadata,planDate}'<>p_plan_date::text
       or v_item#>>'{metadata,microSkillKey}'<>v_micro_skill_key then
      raise exception 'ADLE base-word pilot item validation failed at position %',v_position;
    end if;
    insert into public.assignment_items (
      daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,
      source_entity_id,learning_item_id,template_key,target_word,position,status,prompt_data,metadata
    ) values (
      v_assignment_id,p_child_id,p_parent_user_id,'spelling','lesson','adle_base_word_family_pilot',
      v_item->>'sourceEntityId',null,v_item->>'templateKey',nullif(v_item->>'targetWord',''),
      v_position,'ready',coalesce(v_item->'promptData','{}'::jsonb),coalesce(v_item->'metadata','{}'::jsonb)
    );
  end loop;
  insert into public.adle_base_word_family_pilot_runs (assignment_id,child_id,parent_user_id,pilot_lesson_number)
  values (v_assignment_id,p_child_id,p_parent_user_id,v_run_number);
  return v_assignment_id;
end;
$$;

revoke all on function public.persist_adle_base_word_family_pilot_v2(
  uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text
) from public,anon,authenticated;
grant execute on function public.persist_adle_base_word_family_pilot_v2(
  uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text
) to service_role;

commit;
