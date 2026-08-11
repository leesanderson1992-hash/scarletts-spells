-- CW-3B-1: generalise the shared immutable dependency/release authority for
-- Compound Word v2. This migration publishes no content and creates no
-- activation, assignment, evidence, schedule, or learner row.

begin;

alter table public.canonical_teaching_dictionary_dictation_sentences
  add column if not exists dictation_target_end_exclusive integer,
  add column if not exists exact_governed_answer text,
  add constraint canonical_dictation_target_span_check check (
    (dictation_target_end_exclusive is null and exact_governed_answer is null)
    or (dictation_target_end_exclusive > dictation_target_token_index and btrim(exact_governed_answer) <> '')
  );

alter table public.adle_curriculum_dependency_authorities
  drop constraint adle_curriculum_dependency_authorities_type_check,
  add constraint adle_curriculum_dependency_authorities_type_check
    check (authority_type in ('family_membership','compound_structure','teaching_content','teaching_dictionary_closure')),
  drop constraint adle_curriculum_dependency_authorities_source_check,
  add constraint adle_curriculum_dependency_authorities_source_check
    check (source_classification in ('release_ledger','legacy_pre_release_ledger_projection','mixed_governed_sources'));

alter table public.adle_curriculum_release_dependencies
  drop constraint adle_curriculum_release_dependencies_type_check,
  add constraint adle_curriculum_release_dependencies_type_check
    check (authority_type in ('family_membership','compound_structure','teaching_content','teaching_dictionary_closure'));

alter table public.adle_teaching_dictionary_closure_words
  alter column dictation_sentence_id drop not null,
  alter column dictation_import_batch_id drop not null,
  alter column dictation_source_row_hash drop not null,
  alter column dictation_sentence drop not null,
  alter column dictation_target_token_index drop not null,
  alter column audio_text drop not null,
  add column if not exists dictation_target_end_exclusive integer,
  add column if not exists exact_governed_answer text;

alter table public.adle_teaching_dictionary_closure_words
  drop constraint adle_teaching_dictionary_closure_words_values_check,
  add constraint adle_teaching_dictionary_closure_words_values_check check (
    btrim(word_key) <> '' and btrim(canonical_word_source_row_hash) <> ''
    and btrim(normalised_word) <> '' and normalised_word=lower(normalised_word)
    and btrim(display_word) <> '' and btrim(dialect_code) <> ''
    and (
      (dictation_sentence_id is null and dictation_import_batch_id is null
       and dictation_source_row_hash is null and dictation_sentence is null
       and dictation_target_token_index is null and dictation_target_end_exclusive is null
       and exact_governed_answer is null and audio_text is null)
      or
      (dictation_sentence_id is not null and dictation_import_batch_id is not null
       and btrim(dictation_source_row_hash) <> '' and btrim(dictation_sentence) <> ''
       and dictation_target_token_index >= 0
       and (dictation_target_end_exclusive is null or dictation_target_end_exclusive > dictation_target_token_index)
       and (exact_governed_answer is null or btrim(exact_governed_answer) <> '')
       and btrim(audio_text) <> '')
    )
  );

create trigger ctd_compound_structure_v2_immutable
before update or delete on public.canonical_teaching_dictionary_compound_structures_v2
for each row execute function public.prevent_adle_release_authority_mutation();
create trigger ctd_compound_component_v2_immutable
before update or delete on public.canonical_teaching_dictionary_compound_components_v2
for each row execute function public.prevent_adle_release_authority_mutation();
create trigger ctd_compound_join_v2_immutable
before update or delete on public.canonical_teaching_dictionary_compound_joins_v2
for each row execute function public.prevent_adle_release_authority_mutation();

create or replace function public.publish_adle_compound_word_structure_authority_v1(
  p_manifest jsonb, p_manifest_file_sha256 text, p_published_by text
) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare
  v_id uuid; v_projection jsonb; v_fingerprint text; v_manifest_sha text;
  v_structure jsonb; v_component jsonb; v_join jsonb; v_structure_id uuid;
  v_word public.canonical_teaching_dictionary_words%rowtype; v_ordinal integer;
begin
  if p_manifest_file_sha256 !~ '^[a-f0-9]{64}$' or nullif(btrim(p_published_by),'') is null
     or jsonb_typeof(p_manifest)<>'object' or (select count(*) from jsonb_object_keys(p_manifest))<>4
     or p_manifest->>'schemaVersion'<>'1' or nullif(btrim(p_manifest->>'authorityKey'),'') is null
     or jsonb_typeof(p_manifest->'approvalRefs')<>'array' or jsonb_array_length(p_manifest->'approvalRefs')=0
     or jsonb_typeof(p_manifest->'structures')<>'array' or jsonb_array_length(p_manifest->'structures')=0
  then raise exception 'invalid Compound Word structure authority manifest'; end if;
  if exists(select 1 from jsonb_array_elements(p_manifest->'structures') s
    where jsonb_typeof(s.value)<>'object' or jsonb_array_length(s.value->'components')<2
      or jsonb_array_length(s.value->'joins')<>jsonb_array_length(s.value->'components')-1
      or s.value->>'microSkillKey' not in ('D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED')
      or s.value->>'assignmentEligible'<>'true'
  ) then raise exception 'Compound Word structure authority fails closed'; end if;
  v_projection:=jsonb_build_object('schemaVersion',1,'structures',p_manifest->'structures');
  v_fingerprint:=public.adle_canonical_json_sha256_v1(v_projection);
  v_manifest_sha:=public.adle_canonical_json_sha256_v1(p_manifest);
  insert into public.adle_curriculum_dependency_authorities(authority_key,authority_type,schema_version,source_classification,manifest_file_sha256,authority_manifest,authority_manifest_sha256,semantic_projection,semantic_fingerprint,source_provenance,approval_refs,published_by)
  values(p_manifest->>'authorityKey','compound_structure',1,'mixed_governed_sources',p_manifest_file_sha256,p_manifest,v_manifest_sha,v_projection,v_fingerprint,jsonb_build_object('approvedWorkbookSha256','4d59997206c4faf5c05eac37f9c4dd23d5581d3600327a7a8d0ef758b4c1338f'),p_manifest->'approvalRefs',p_published_by)
  on conflict(authority_type,authority_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.adle_curriculum_dependency_authorities where authority_type='compound_structure' and authority_key=p_manifest->>'authorityKey' and authority_manifest=p_manifest and manifest_file_sha256=p_manifest_file_sha256 and semantic_fingerprint=v_fingerprint;
    if v_id is null then raise exception 'Compound Word structure authority key names different immutable semantics'; end if;
    return v_id;
  end if;
  v_ordinal:=0;
  for v_structure in select value from jsonb_array_elements(p_manifest->'structures') loop
    v_ordinal:=v_ordinal+1;
    select * into v_word from public.canonical_teaching_dictionary_words where id=(v_structure->>'wholeCanonicalWordId')::uuid and word_key=v_structure->>'wholeWordKey' and display_word=v_structure->>'displayForm' and row_status='active' and review_status='approved_for_first_exposure' for share;
    if not found then raise exception 'Compound whole identity unavailable: %',v_structure->>'wholeWordKey'; end if;
    insert into public.canonical_teaching_dictionary_compound_structures_v2(import_batch_id,canonical_word_id,micro_skill_key,child_friendly_meaning,component_to_whole_relationship,morphology_provenance,assignment_eligible,transfer_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
    values(v_word.import_batch_id,v_word.id,v_structure->>'microSkillKey',v_structure->>'childFriendlyMeaning',v_structure->>'componentToWholeRelationship',v_structure->'morphologyProvenance',(v_structure->>'assignmentEligible')::boolean,(v_structure->>'transferEligible')::boolean,'active','approved_for_first_exposure','compound-word-v2-publication-review-approval.json',v_ordinal+1,public.adle_canonical_json_sha256_v1(v_structure),jsonb_build_object('dependencyAuthorityId',v_id,'approvalRef',v_structure->>'approvalRef'),'internal_authored','Katie Sanderson approved Compound Word v2 workbook','local:4d59997206c4faf5c05eac37f9c4dd23d5581d3600327a7a8d0ef758b4c1338f','internal/project-authored','Hash-bound CW-3A approval.','high','Katie Sanderson','2026-08-11T20:09:55Z') returning id into v_structure_id;
    for v_component in select value from jsonb_array_elements(v_structure->'components') loop
      if not exists(select 1 from public.canonical_teaching_dictionary_words where id=(v_component->>'canonicalWordId')::uuid and display_word=v_component->>'displaySurface' and row_status='active' and review_status='approved_for_first_exposure') then raise exception 'Compound component identity unavailable'; end if;
      insert into public.canonical_teaching_dictionary_compound_components_v2(structure_id,component_ordinal,canonical_component_word_id,display_surface,component_meaning,component_sense)
      values(v_structure_id,(v_component->>'ordinal')::integer,(v_component->>'canonicalWordId')::uuid,v_component->>'displaySurface',v_component->>'meaning',v_component->>'sense');
    end loop;
    v_ordinal:=0;
    for v_join in select value from jsonb_array_elements(v_structure->'joins') loop
      v_ordinal:=v_ordinal+1;
      insert into public.canonical_teaching_dictionary_compound_joins_v2(structure_id,join_ordinal,join_kind) values(v_structure_id,v_ordinal,v_join#>>'{}');
    end loop;
    perform public.assert_canonical_compound_structure_v2(v_structure_id);
  end loop;
  return v_id;
end $$;

revoke all on function public.publish_adle_compound_word_structure_authority_v1(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.publish_adle_compound_word_structure_authority_v1(jsonb,text,text) to service_role;

create or replace function public.publish_adle_teaching_content_authority_v1(
 p_manifest jsonb,p_manifest_file_sha256 text,p_source_classification text,p_published_by text
) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare v_id uuid; v_content public.canonical_teaching_dictionary_content_versions%rowtype; v_projection jsonb; v_fp text; v_sha text;
begin
 if p_manifest_file_sha256 !~ '^[a-f0-9]{64}$' or p_source_classification not in ('release_ledger','legacy_pre_release_ledger_projection','mixed_governed_sources') or nullif(btrim(p_published_by),'') is null or jsonb_typeof(p_manifest)<>'object' or (select count(*) from jsonb_object_keys(p_manifest))<>5 or p_manifest->>'schemaVersion'<>'1' or p_manifest->>'microSkillKey' not in ('D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED') or jsonb_typeof(p_manifest->'content')<>'object' or nullif(p_manifest#>>'{content,contentVersionId}','') is null then raise exception 'invalid shared teaching-content authority manifest'; end if;
 select * into v_content from public.canonical_teaching_dictionary_content_versions where id=(p_manifest#>>'{content,contentVersionId}')::uuid and micro_skill_key=p_manifest->>'microSkillKey' and version_status='active' and is_active and final_readiness_review_status='signed_off' for share;
 if not found then raise exception 'teaching content is not active and signed off'; end if;
 v_projection:=jsonb_build_object('schemaVersion',1,'microSkillKey',v_content.micro_skill_key,'contentVersionId',v_content.id,'contentVersion',v_content.content_version,'teachingObjective',v_content.teaching_objective,'childFriendlyExplanation',v_content.child_friendly_explanation,'ruleExplanation',v_content.rule_explanation,'memoryTip',coalesce(v_content.memory_tip,''),'commonMisconceptions',coalesce(v_content.common_misconceptions,''),'firstExposureProgression',v_content.first_exposure_progression,'guidedPracticeProgression',v_content.guided_practice_progression,'reviewProofreadingProgression',v_content.review_proofreading_progression,'exampleSelectionGuidance',coalesce(v_content.example_selection_guidance,''),'contrastPolicyGuidance',coalesce(v_content.contrast_policy_guidance,''));
 if p_manifest->'content'<>v_projection-'schemaVersion'-'microSkillKey' then raise exception 'teaching content projection disagrees with signed source'; end if;
 v_fp:=public.adle_canonical_json_sha256_v1(v_projection); v_sha:=public.adle_canonical_json_sha256_v1(p_manifest);
 insert into public.adle_curriculum_dependency_authorities(authority_key,authority_type,schema_version,source_classification,manifest_file_sha256,authority_manifest,authority_manifest_sha256,semantic_projection,semantic_fingerprint,source_provenance,approval_refs,published_by)
 values(p_manifest->>'authorityKey','teaching_content',1,p_source_classification,p_manifest_file_sha256,p_manifest,v_sha,v_projection,v_fp,jsonb_build_object('contentVersionId',v_content.id,'importBatchId',v_content.import_batch_id,'sourceRowHash',v_content.source_row_hash),p_manifest->'approvalRefs',p_published_by) on conflict(authority_type,authority_key) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.adle_curriculum_dependency_authorities where authority_type='teaching_content' and authority_key=p_manifest->>'authorityKey' and authority_manifest=p_manifest and manifest_file_sha256=p_manifest_file_sha256 and semantic_fingerprint=v_fp; if v_id is null then raise exception 'teaching-content key names different immutable semantics'; end if; end if;
 return v_id;
end $$;

revoke all on function public.publish_adle_teaching_content_authority_v1(jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.publish_adle_teaching_content_authority_v1(jsonb,text,text,text) to service_role;

create or replace function public.publish_adle_teaching_dictionary_closure_v2(
 p_manifest jsonb,p_manifest_file_sha256 text,p_source_bindings jsonb,p_published_by text
) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare v_id uuid; v_projection jsonb; v_fp text; v_sha text; v_item jsonb; v_binding jsonb; v_word public.canonical_teaching_dictionary_words%rowtype; v_dict public.canonical_teaching_dictionary_dictation_sentences%rowtype; v_word_batch public.canonical_teaching_dictionary_import_batches%rowtype; v_dict_batch public.canonical_teaching_dictionary_import_batches%rowtype; v_word_projection jsonb;
begin
 if p_manifest_file_sha256 !~ '^[a-f0-9]{64}$' or nullif(btrim(p_published_by),'') is null or jsonb_typeof(p_manifest)<>'object' or p_manifest->>'schemaVersion'<>'2' or p_manifest->'capabilities'<>'["canonical_word_identity_display","canonical_dictation_target_span"]'::jsonb or jsonb_typeof(p_manifest->'words')<>'array' or jsonb_array_length(p_manifest->'words')=0 or jsonb_typeof(p_source_bindings)<>'array' or jsonb_array_length(p_source_bindings)<>jsonb_array_length(p_manifest->'words') then raise exception 'invalid Teaching Dictionary closure v2 manifest'; end if;
 v_projection:=jsonb_build_object('schemaVersion',2,'capabilities',p_manifest->'capabilities','words',p_manifest->'words'); v_fp:=public.adle_canonical_json_sha256_v1(v_projection); v_sha:=public.adle_canonical_json_sha256_v1(p_manifest);
 insert into public.adle_curriculum_dependency_authorities(authority_key,authority_type,schema_version,source_classification,manifest_file_sha256,authority_manifest,authority_manifest_sha256,semantic_projection,semantic_fingerprint,source_provenance,approval_refs,published_by)
 values(p_manifest->>'authorityKey','teaching_dictionary_closure',2,'mixed_governed_sources',p_manifest_file_sha256,p_manifest,v_sha,v_projection,v_fp,jsonb_build_object('sourceBindings',p_source_bindings),p_manifest->'approvalRefs',p_published_by) on conflict(authority_type,authority_key) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.adle_curriculum_dependency_authorities where authority_type='teaching_dictionary_closure' and authority_key=p_manifest->>'authorityKey' and schema_version=2 and authority_manifest=p_manifest and manifest_file_sha256=p_manifest_file_sha256 and semantic_fingerprint=v_fp and source_provenance->'sourceBindings'=p_source_bindings; if v_id is null then raise exception 'closure v2 key names different immutable semantics'; end if; return v_id; end if;
 for v_item in select value from jsonb_array_elements(p_manifest->'words') loop
  select value into v_binding from jsonb_array_elements(p_source_bindings) where value->>'wordKey'=v_item->>'wordKey';
  select * into v_word from public.canonical_teaching_dictionary_words where id=(v_binding->>'canonicalWordId')::uuid and word_key=v_item->>'wordKey' and normalised_word=v_item->>'normalisedWord' and display_word=v_item->>'displayWord' and dialect_code=v_item->>'dialectCode' and row_status='active' and review_status='approved_for_first_exposure' for share;
  if not found then raise exception 'closure v2 canonical identity unavailable: %',v_item->>'wordKey'; end if; select * into strict v_word_batch from public.canonical_teaching_dictionary_import_batches where id=v_word.import_batch_id for share; if v_word_batch.batch_status<>'applied' then raise exception 'closure word batch not applied'; end if;
  v_word_projection:=v_item;
  if v_item->'dictation'<>'null'::jsonb then
    if nullif(v_binding->>'dictationSentenceId','') is null then raise exception 'closure v2 dictation binding missing'; end if;
    select * into v_dict from public.canonical_teaching_dictionary_dictation_sentences where id=(v_binding->>'dictationSentenceId')::uuid and canonical_word_id=v_word.id and dictation_sentence=v_item#>>'{dictation,sentence}' and dictation_target_token_index=(v_item#>>'{dictation,targetStart}')::integer and audio_text=v_item#>>'{dictation,audioText}' and row_status='active' and review_status='approved_for_first_exposure' for share;
    if not found then raise exception 'closure v2 dictation unavailable: %',v_item->>'wordKey'; end if; select * into strict v_dict_batch from public.canonical_teaching_dictionary_import_batches where id=v_dict.import_batch_id for share; if v_dict_batch.batch_status<>'applied' then raise exception 'closure dictation batch not applied'; end if;
  end if;
  insert into public.adle_teaching_dictionary_closure_words(authority_id,word_key,canonical_word_id,canonical_word_import_batch_id,canonical_word_source_row_hash,canonical_word_release_id,canonical_word_package_sha256,dictation_sentence_id,dictation_import_batch_id,dictation_source_row_hash,dictation_release_id,dictation_package_sha256,normalised_word,display_word,dialect_code,dictation_sentence,dictation_target_token_index,dictation_target_end_exclusive,exact_governed_answer,audio_text,semantic_fingerprint)
  values(v_id,v_word.word_key,v_word.id,v_word.import_batch_id,v_word.source_row_hash,v_word_batch.release_id,v_word_batch.package_sha256,v_dict.id,v_dict.import_batch_id,v_dict.source_row_hash,v_dict_batch.release_id,v_dict_batch.package_sha256,v_word.normalised_word,v_word.display_word,v_word.dialect_code,v_dict.dictation_sentence,(v_item#>>'{dictation,targetStart}')::integer,(v_item#>>'{dictation,targetEndExclusive}')::integer,v_item#>>'{dictation,exactGovernedAnswer}',v_dict.audio_text,public.adle_canonical_json_sha256_v1(v_word_projection));
  v_dict:=null; v_dict_batch:=null;
 end loop;
 return v_id;
end $$;

revoke all on function public.publish_adle_teaching_dictionary_closure_v2(jsonb,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.publish_adle_teaching_dictionary_closure_v2(jsonb,text,jsonb,text) to service_role;

create or replace function public.publish_adle_curriculum_release_v2(p_manifest jsonb,p_manifest_file_sha256 text,p_published_by text) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare v_id uuid; v_sha text; v_fp text; v_skill jsonb; v_dep jsonb; v_authority uuid; v_expected text[];
begin
 if p_manifest_file_sha256 !~ '^[a-f0-9]{64}$' or nullif(btrim(p_published_by),'') is null or jsonb_typeof(p_manifest)<>'object' or p_manifest->>'schemaVersion'<>'2' or jsonb_typeof(p_manifest->'microSkills')<>'array' or jsonb_array_length(p_manifest->'microSkills')=0 then raise exception 'invalid ADLE curriculum release manifest'; end if;
 if p_manifest#>>'{route,routeId}'='base_word_lab' and p_manifest#>>'{route,routeVersion}'='v2' and p_manifest#>>'{route,activationRouteKey}'='base_word_family_v1' and p_manifest#>>'{route,payloadVersion}'='1' then v_expected:=array['family_membership','teaching_content','teaching_dictionary_closure'];
 elsif p_manifest#>>'{route,routeId}'='compound_word_lab' and p_manifest#>>'{route,routeVersion}'='v2' and p_manifest#>>'{route,activationRouteKey}'='compound_word_lab:v2' and p_manifest#>>'{route,payloadVersion}'='2' then v_expected:=array['compound_structure','teaching_content','teaching_dictionary_closure'];
 else raise exception 'route is not governed by ADLE release authority v2'; end if;
 for v_skill in select value from jsonb_array_elements(p_manifest->'microSkills') loop
  if (select array_agg(value->>'authorityType' order by ordinality) from jsonb_array_elements(v_skill->'dependencies') with ordinality)<>v_expected then raise exception 'release dependencies are not canonical'; end if;
  if p_manifest#>>'{route,routeId}'='base_word_lab' and not public.adle_micro_skill_owns_base_word_lab_v2(v_skill->>'microSkillKey') then raise exception 'skill is not owned by Base Word route'; end if;
  if p_manifest#>>'{route,routeId}'='compound_word_lab' and v_skill->>'microSkillKey' not in ('D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED') then raise exception 'skill is not owned by Compound Word route'; end if;
  if not exists(select 1 from public.micro_skill_catalog where micro_skill_key=v_skill->>'microSkillKey' and is_active and is_assignable) then raise exception 'release skill is not active and assignable'; end if;
  for v_dep in select value from jsonb_array_elements(v_skill->'dependencies') loop select id into v_authority from public.adle_curriculum_dependency_authorities where authority_type=v_dep->>'authorityType' and authority_key=v_dep->>'authorityKey' and schema_version=(v_dep->>'authoritySchemaVersion')::integer and semantic_fingerprint=v_dep->>'semanticFingerprint'; if v_authority is null then raise exception 'release dependency unavailable'; end if; end loop;
 end loop;
 v_sha:=public.adle_canonical_json_sha256_v1(p_manifest); v_fp:=public.adle_canonical_json_sha256_v1(p_manifest->'microSkills');
 insert into public.adle_curriculum_release_manifests(release_key,schema_version,manifest_file_sha256,manifest_payload,release_manifest_sha256,dependency_fingerprint,route_id,route_version,activation_route_key,payload_version,approval_refs,published_by)
 values(p_manifest->>'releaseKey',2,p_manifest_file_sha256,p_manifest,v_sha,v_fp,p_manifest#>>'{route,routeId}',p_manifest#>>'{route,routeVersion}',p_manifest#>>'{route,activationRouteKey}',(p_manifest#>>'{route,payloadVersion}')::integer,p_manifest->'approvalRefs',p_published_by) on conflict(release_key) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.adle_curriculum_release_manifests where release_key=p_manifest->>'releaseKey' and manifest_payload=p_manifest and manifest_file_sha256=p_manifest_file_sha256 and release_manifest_sha256=v_sha and dependency_fingerprint=v_fp; if v_id is null then raise exception 'release key names different immutable manifest'; end if; return v_id; end if;
 for v_skill in select value from jsonb_array_elements(p_manifest->'microSkills') loop for v_dep in select value from jsonb_array_elements(v_skill->'dependencies') loop select id into strict v_authority from public.adle_curriculum_dependency_authorities where authority_type=v_dep->>'authorityType' and authority_key=v_dep->>'authorityKey' and schema_version=(v_dep->>'authoritySchemaVersion')::integer and semantic_fingerprint=v_dep->>'semanticFingerprint'; insert into public.adle_curriculum_release_dependencies(release_manifest_id,micro_skill_key,authority_type,authority_key,authority_schema_version,semantic_fingerprint,authority_id) values(v_id,v_skill->>'microSkillKey',v_dep->>'authorityType',v_dep->>'authorityKey',(v_dep->>'authoritySchemaVersion')::integer,v_dep->>'semanticFingerprint',v_authority); end loop; end loop;
 return v_id;
end $$;

revoke all on function public.publish_adle_curriculum_release_v2(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.publish_adle_curriculum_release_v2(jsonb,text,text) to service_role;

comment on function public.publish_adle_curriculum_release_v2(jsonb,text,text) is 'Publishes immutable environment-neutral Base Word or Compound Word route manifests. It cannot activate a route.';

commit;
