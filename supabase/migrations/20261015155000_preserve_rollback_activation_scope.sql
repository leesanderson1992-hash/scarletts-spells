-- Restore the exact prior activation scope when rolling back native content.
-- Content rollback must not widen an earlier restricted activation.
begin;
create or replace function public.rollback_teaching_dictionary_launch_v2(p_launch uuid,p_actor uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.teaching_dictionary_lesson_launches%rowtype; v_content uuid; v_before jsonb; v_word public.canonical_teaching_dictionary_words%rowtype; v_previous public.adle_curriculum_release_manifests%rowtype; v_current uuid;
begin
  select * into l from public.teaching_dictionary_lesson_launches where id=p_launch for update;
  if l.id is null or p_actor is null or length(btrim(p_reason))<8 then raise exception 'TEACHING_LESSON_ROLLBACK_INVALID'; end if;
  if exists(select 1 from public.teaching_dictionary_lesson_launch_rollbacks where launch_id=l.id) then raise exception 'TEACHING_LESSON_ALREADY_ROLLED_BACK'; end if;
  if l.published_activation_revision_id is not null then
    select current_revision_id into v_current from public.adle_route_activation_heads where route_id=l.route_id
      and micro_skill_key=l.micro_skill_key and environment_key=l.environment_key for update;
    if v_current is distinct from l.published_activation_revision_id then raise exception 'TEACHING_LESSON_ROLLBACK_NOT_CURRENT'; end if;
    select * into strict v_previous from public.adle_curriculum_release_manifests where id=l.previous_profile_id;
    perform public.set_adle_route_activation_revision_v2(v_previous.release_manifest_sha256,l.micro_skill_key,l.environment_key,'enabled','allow_existing',
      coalesce((select readiness_report from public.adle_route_activation_revisions where id=l.previous_activation_revision_id),
        jsonb_build_object('schemaVersion',1,'scope',jsonb_build_object('kind','all_eligible'),'emergencyDisableAvailable',true)),
      v_current,p_actor::text,p_reason);
    insert into public.teaching_dictionary_route_content_rollbacks(content_version_id,route_profile_id,previous_profile_id,reason,rolled_back_by)
      select unnest(l.content_version_ids),l.published_profile_id,l.previous_profile_id,p_reason,p_actor;
  else
  foreach v_content in array (select array_agg(id order by ord desc) from unnest(l.content_version_ids) with ordinality v(id,ord)) loop
    if l.route_id='dynamic_prefix_word_lab' then perform public.rollback_teaching_dictionary_prefix_content(v_content,p_actor,p_reason);
    else perform public.rollback_teaching_dictionary_suffix_content(v_content,p_actor,p_reason); end if;
  end loop;
  end if;
  for v_before in select value from jsonb_array_elements(l.dictionary_before) loop
    v_word:=jsonb_populate_record(null::public.canonical_teaching_dictionary_words,v_before->'word');
    -- Refuse to undo a later dictionary release made after this lesson.
    if exists(select 1 from public.teaching_dictionary_manager_publications p join public.teaching_dictionary_manager_drafts d on d.id=p.draft_id
      where p.canonical_word_id=v_word.id and p.published_at>l.published_at) then raise exception 'TEACHING_DICTIONARY_ROLLBACK_NOT_CURRENT'; end if;
    update public.canonical_teaching_dictionary_words set display_word=v_word.display_word,frequency_band=v_word.frequency_band,age_band=v_word.age_band,
      complexity_band=v_word.complexity_band,source_row_hash=v_word.source_row_hash,source_category=v_word.source_category,source_name=v_word.source_name,
      source_url=v_word.source_url,source_licence=v_word.source_licence,source_use_note=v_word.source_use_note,confidence=v_word.confidence,updated_at=v_word.updated_at where id=v_word.id;
    update public.canonical_teaching_dictionary_word_metadata set row_status='superseded' where canonical_word_id=v_word.id and row_status='active';
    update public.canonical_teaching_dictionary_word_metadata set row_status='active' where id=(v_before->>'metadataId')::uuid;
    update public.canonical_teaching_dictionary_word_morphology set row_status='retired' where canonical_word_id=v_word.id and row_status='active';
    update public.canonical_teaching_dictionary_word_morphology set row_status='active' where id=(v_before->>'morphologyId')::uuid;
    update public.canonical_teaching_dictionary_dictation_sentences set row_status='superseded' where canonical_word_id=v_word.id and row_status='active';
    update public.canonical_teaching_dictionary_dictation_sentences set row_status='active' where id=(v_before->>'dictationId')::uuid;
    insert into public.teaching_dictionary_definition_versions(canonical_word_id,definition,is_withdrawn,draft_id)
      values(v_word.id,coalesce(v_before->>'definition',''),nullif(v_before->>'definition','') is null,(select draft_id from public.teaching_dictionary_route_content_versions where id=l.content_version_ids[1]));
    delete from public.teaching_dictionary_dictation_heads where canonical_word_id=v_word.id;
    if v_before->>'dictationSetId' is not null then insert into public.teaching_dictionary_dictation_heads values(v_word.id,(v_before->>'dictationSetId')::uuid); end if;
  end loop;
  insert into public.teaching_dictionary_lesson_launch_rollbacks(launch_id,reason,rolled_back_by) values(l.id,p_reason,p_actor);
end $$;

notify pgrst, 'reload schema';
commit;
