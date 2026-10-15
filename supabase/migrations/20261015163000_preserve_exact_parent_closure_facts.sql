-- Carry unchanged frozen facts forward from the exact parent authority.
-- Changed facts still require current explicit review and applied source batches.
begin;
create or replace function public.publish_teaching_dictionary_reviewed_closure_v1(
  p_parent uuid,p_manifest jsonb,p_bindings jsonb,p_package_hash text,p_actor uuid
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare parent public.adle_curriculum_dependency_authorities%rowtype;
  w public.canonical_teaching_dictionary_words%rowtype; d public.canonical_teaching_dictionary_dictation_sentences%rowtype;
  wb public.canonical_teaching_dictionary_import_batches%rowtype; db public.canonical_teaching_dictionary_import_batches%rowtype;
  item jsonb; binding jsonb; prior jsonb; projection jsonb; v_id uuid; v_pool public.teaching_dictionary_dictation_sets%rowtype;
  v_schema int; v_sentence text; v_target int; v_audio text; v_end int; v_answer text;
begin
  select * into parent from public.adle_curriculum_dependency_authorities where id=p_parent and authority_type='teaching_dictionary_closure' for share;
  v_schema:=(p_manifest->>'schemaVersion')::int;
  if parent.id is null or v_schema<>parent.schema_version or v_schema not in (1,2) or p_actor is null
    or p_package_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_manifest->'words')<>'array' or jsonb_array_length(p_manifest->'words')<1
    or jsonb_array_length(p_manifest->'words')<>jsonb_array_length(p_bindings)
    or p_manifest->'capabilities' is distinct from parent.semantic_projection->'capabilities'
    or (select count(distinct value->>'wordKey') from jsonb_array_elements(p_manifest->'words'))<>jsonb_array_length(p_manifest->'words')
    then raise exception 'TEACHING_CLOSURE_MANIFEST_INVALID'; end if;
  projection:=jsonb_build_object('schemaVersion',v_schema,'capabilities',p_manifest->'capabilities','words',p_manifest->'words');
  insert into public.adle_curriculum_dependency_authorities(authority_key,authority_type,schema_version,source_classification,
    manifest_file_sha256,authority_manifest,authority_manifest_sha256,semantic_projection,semantic_fingerprint,source_provenance,approval_refs,published_by)
    values(p_manifest->>'authorityKey','teaching_dictionary_closure',v_schema,'mixed_governed_sources',p_package_hash,p_manifest,
      public.adle_canonical_json_sha256_v1(p_manifest),projection,public.adle_canonical_json_sha256_v1(projection),
      jsonb_build_object('parentAuthorityId',p_parent,'sourceBindings',p_bindings,'reviewedPublisher',p_actor),p_manifest->'approvalRefs',p_actor::text)
    returning id into v_id;
  for item in select value from jsonb_array_elements(p_manifest->'words') loop
    select value into binding from jsonb_array_elements(p_bindings) where value->>'wordKey'=item->>'wordKey';
    select value into prior from jsonb_array_elements(parent.semantic_projection->'words') where value->>'wordKey'=item->>'wordKey';
    if prior is not distinct from item then
      insert into public.adle_teaching_dictionary_closure_words(authority_id,word_key,canonical_word_id,canonical_word_import_batch_id,
        canonical_word_source_row_hash,canonical_word_release_id,canonical_word_package_sha256,dictation_sentence_id,dictation_import_batch_id,
        dictation_source_row_hash,dictation_release_id,dictation_package_sha256,normalised_word,display_word,dialect_code,dictation_sentence,
        dictation_target_token_index,dictation_target_end_exclusive,exact_governed_answer,audio_text,semantic_fingerprint,dictation_variants,dictation_variants_fingerprint)
      select v_id,frozen.word_key,frozen.canonical_word_id,frozen.canonical_word_import_batch_id,
        frozen.canonical_word_source_row_hash,frozen.canonical_word_release_id,frozen.canonical_word_package_sha256,frozen.dictation_sentence_id,frozen.dictation_import_batch_id,
        frozen.dictation_source_row_hash,frozen.dictation_release_id,frozen.dictation_package_sha256,frozen.normalised_word,frozen.display_word,frozen.dialect_code,frozen.dictation_sentence,
        frozen.dictation_target_token_index,frozen.dictation_target_end_exclusive,frozen.exact_governed_answer,frozen.audio_text,frozen.semantic_fingerprint,frozen.dictation_variants,frozen.dictation_variants_fingerprint
      from public.adle_teaching_dictionary_closure_words frozen
      where frozen.authority_id=parent.id and frozen.word_key=item->>'wordKey'
        and frozen.canonical_word_id=(binding->>'canonicalWordId')::uuid
        and frozen.semantic_fingerprint=public.adle_canonical_json_sha256_v1(item);
      if not found then raise exception 'TEACHING_CLOSURE_PARENT_BINDING_INVALID'; end if;
      continue;
    end if;
    select * into w from public.canonical_teaching_dictionary_words where id=(binding->>'canonicalWordId')::uuid
      and word_key=item->>'wordKey' and normalised_word=item->>'normalisedWord' and display_word=item->>'displayWord'
      and dialect_code=item->>'dialectCode' and row_status='active' and review_status='approved_for_first_exposure' for share;
    if w.id is null then raise exception 'TEACHING_CLOSURE_WORD_IDENTITY_INVALID'; end if;
    v_sentence:=case when v_schema=1 then item->>'dictationSentence' else item#>>'{dictation,sentence}' end;
    v_target:=(case when v_schema=1 then item->>'dictationTargetTokenIndex' else item#>>'{dictation,targetStart}' end)::int;
    v_audio:=case when v_schema=1 then item->>'audioText' else item#>>'{dictation,audioText}' end;
    v_end:=case when v_schema=2 then (item#>>'{dictation,targetEndExclusive}')::int else null end;
    v_answer:=case when v_schema=2 then item#>>'{dictation,exactGovernedAnswer}' else null end;
    d:=null;db:=null;
    if v_sentence is not null then
      select * into d from public.canonical_teaching_dictionary_dictation_sentences where canonical_word_id=w.id
        and row_status='active' and review_status='approved_for_first_exposure' and dictation_sentence=v_sentence
        and dictation_target_token_index=v_target and audio_text=v_audio for share;
      if d.id is null or v_audio is distinct from v_sentence then raise exception 'TEACHING_CLOSURE_DICTATION_INVALID'; end if;
    end if;
    select value into prior from jsonb_array_elements(parent.semantic_projection->'words') where value->>'wordKey'=w.word_key;
    if prior is distinct from item and not exists(
      select 1 from public.teaching_dictionary_manager_publications p
      join public.teaching_dictionary_overview_reviews r on r.draft_id=p.draft_id
      join public.teaching_dictionary_manager_drafts draft on draft.id=p.draft_id
      where p.canonical_word_id=w.id and r.content_fingerprint=public.teaching_dictionary_overview_fingerprint(draft.payload)
        and draft.payload->>'displayWord'=w.display_word and draft.payload->>'dictationSentence'=v_sentence
        and (draft.payload->>'dictationTargetTokenIndex')::int=v_target
        and (not item ? 'dictationVariants' or draft.payload->'dictationVariants'=item->'dictationVariants')
    ) then raise exception 'TEACHING_CLOSURE_REVIEW_REQUIRED'; end if;
    v_pool:=null;
    if item ? 'dictationVariants' then
      select * into v_pool from public.teaching_dictionary_dictation_sets where canonical_word_id=w.id
        and variants=item->'dictationVariants' and content_fingerprint=item->>'dictationSetFingerprint' for share;
      if v_pool.id is null then raise exception 'TEACHING_CLOSURE_VARIANTS_UNREVIEWED'; end if;
    end if;
    select * into strict wb from public.canonical_teaching_dictionary_import_batches where id=w.import_batch_id;
    if d.id is not null then select * into strict db from public.canonical_teaching_dictionary_import_batches where id=d.import_batch_id; end if;
    if wb.batch_status<>'applied' or (db.id is not null and db.batch_status<>'applied') then raise exception 'TEACHING_CLOSURE_SOURCE_UNAPPLIED'; end if;
    insert into public.adle_teaching_dictionary_closure_words(authority_id,word_key,canonical_word_id,canonical_word_import_batch_id,
      canonical_word_source_row_hash,canonical_word_release_id,canonical_word_package_sha256,dictation_sentence_id,dictation_import_batch_id,
      dictation_source_row_hash,dictation_release_id,dictation_package_sha256,normalised_word,display_word,dialect_code,dictation_sentence,
      dictation_target_token_index,dictation_target_end_exclusive,exact_governed_answer,audio_text,semantic_fingerprint,dictation_variants,dictation_variants_fingerprint)
      values(v_id,w.word_key,w.id,w.import_batch_id,w.source_row_hash,wb.release_id,wb.package_sha256,d.id,d.import_batch_id,d.source_row_hash,
        db.release_id,db.package_sha256,w.normalised_word,w.display_word,w.dialect_code,v_sentence,v_target,v_end,v_answer,v_audio,
        public.adle_canonical_json_sha256_v1(item),v_pool.variants,v_pool.content_fingerprint);
  end loop;
  return v_id;
end $$;
notify pgrst, 'reload schema';
commit;
