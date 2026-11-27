begin;
-- A reviewed subset keeps unselected/unsupported members out of new lessons,
-- while every included fact remains pinned to current reviewed dictionary data.
create function public.adle_latin_root_reviewed_subset_current_v1(p jsonb) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare source jsonb; dictionary jsonb:=p->'dictionary'; keys text[]; w jsonb; n integer;
begin
 if p->>'selectionMode' is distinct from 'reviewed_subset' or p->>'reviewEnvironment' not in('staging','production')
  or jsonb_typeof(dictionary->'families') is distinct from 'array' or jsonb_typeof(dictionary->'words') is distinct from 'array'
  or jsonb_typeof(p->'teachingSenseBindings') is distinct from 'object' then return false; end if;
 select array_agg(value->>'familyKey') into keys from jsonb_array_elements(dictionary->'families');
 source:=public.adle_latin_root_dictionary_v1(keys);n:=jsonb_array_length(dictionary->'words');
 if source->'families' is distinct from dictionary->'families' or n<5
  or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(dictionary->'words'))<>n
  or (select count(*) from jsonb_object_keys(p->'teachingSenseBindings'))<>n
  or exists(select 1 from jsonb_array_elements(dictionary->'families') f where
    (select count(*) from jsonb_array_elements(dictionary->'words') w where w.value->>'familyKey'=f.value->>'familyKey')<2)
  then return false; end if;
 for w in select value from jsonb_array_elements(dictionary->'words') loop
  if not exists(select 1 from jsonb_array_elements(source->'words') full_word where full_word.value=w)
    or p->'teachingSenseBindings'->>(w->>'canonicalWordId') is distinct from w->>'senseId'
    or exists(select 1 from public.teaching_dictionary_pair_latest_decisions d where d.environment_key=p->>'reviewEnvironment'
      and d.micro_skill_key='D4_MOR_ROOTS_COMMON_LATIN_ROOTS' and d.canonical_word_id=(w->>'canonicalWordId')::uuid and d.action='deassign')
    or exists(select 1 from public.teaching_dictionary_bulk_review_exclusions x where x.environment_key=p->>'reviewEnvironment'
      and x.micro_skill_key='D4_MOR_ROOTS_COMMON_LATIN_ROOTS' and x.canonical_word_id=(w->>'canonicalWordId')::uuid)
    or exists(select 1 from public.teaching_dictionary_effective_lesson_sense_bindings b where b.environment_key=p->>'reviewEnvironment'
      and b.micro_skill_key='D4_MOR_ROOTS_COMMON_LATIN_ROOTS' and b.canonical_word_id=(w->>'canonicalWordId')::uuid and b.sense_id<>w->>'senseId')
    then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;
-- Old complete-family release validation stays exact. New workbook releases
-- explicitly opt into the reviewed-subset contract above.
do $migration$ declare original text; patched text;
begin
 select pg_get_functiondef('public.publish_adle_latin_root_package_v1(jsonb,text,text)'::regprocedure) into original;
 patched:=replace(original,
  'a#>''{semanticProjection,dictionary}'' is distinct from public.adle_latin_root_dictionary_v1(keys)',
  '(case when a#>>''{semanticProjection,selectionMode}''=''reviewed_subset'' then not public.adle_latin_root_reviewed_subset_current_v1(a->''semanticProjection'') else a#>''{semanticProjection,dictionary}'' is distinct from public.adle_latin_root_dictionary_v1(keys) end)');
 if patched=original then raise exception 'LATIN_ROOT_SUBSET_PUBLISH_PATCH_NOT_FOUND';end if;execute patched;
end $migration$;
do $migration$ declare original text; patched text;
begin
 select pg_get_functiondef('public.assert_adle_latin_root_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid)'::regprocedure) into original;
 patched:=replace(original,'closure jsonb;','closure jsonb; closure_projection jsonb;');
 patched:=replace(patched,'select a.semantic_projection->''dictionary'' into strict closure','select a.semantic_projection into strict closure_projection');
 patched:=replace(patched,'select array_agg(value->>''familyKey'') into keys from jsonb_array_elements(closure->''families'');','closure:=closure_projection->''dictionary''; select array_agg(value->>''familyKey'') into keys from jsonb_array_elements(closure->''families'');');
 patched:=replace(patched,'closure is distinct from public.adle_latin_root_dictionary_v1(keys)',
  '(case when closure_projection->>''selectionMode''=''reviewed_subset'' then not public.adle_latin_root_reviewed_subset_current_v1(closure_projection) else closure is distinct from public.adle_latin_root_dictionary_v1(keys) end)');
 if patched=original then raise exception 'LATIN_ROOT_SUBSET_ASSIGNMENT_PATCH_NOT_FOUND';end if;execute patched;
end $migration$;
create function public.publish_adle_latin_root_bulk_review_v1(p_package jsonb,p_package_file_sha256 text,p_environment text,p_expected_head uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_revision public.adle_route_activation_revisions%rowtype; closure jsonb; release_id uuid; manifest_sha text; activation uuid;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) or p_environment not in('staging','production') then raise exception 'LATIN_ROOT_BULK_REVIEWER_REQUIRED';end if;
 select r.* into strict current_revision from public.adle_route_activation_heads h join public.adle_route_activation_revisions r on r.id=h.current_revision_id
  where h.environment_key=p_environment and h.route_id='latin_root_word_lab' and h.route_version='v1' and h.micro_skill_key='D4_MOR_ROOTS_COMMON_LATIN_ROOTS' for update of h;
 if current_revision.id is distinct from p_expected_head or current_revision.activation_status<>'enabled' then raise exception 'LATIN_ROOT_BULK_PREVIEW_STALE';end if;
 select value->'semanticProjection' into strict closure from jsonb_array_elements(p_package->'authorities') where value->>'authorityType'='teaching_dictionary_closure';
 if closure->>'reviewEnvironment' is distinct from p_environment or not public.adle_latin_root_reviewed_subset_current_v1(closure) then raise exception 'LATIN_ROOT_BULK_FACTS_CHANGED';end if;
 release_id:=public.publish_adle_latin_root_package_v1(p_package,p_package_file_sha256,p_actor::text);
 select release_manifest_sha256 into strict manifest_sha from public.adle_curriculum_release_manifests where id=release_id;
 activation:=public.set_adle_route_activation_revision_v2(manifest_sha,'D4_MOR_ROOTS_COMMON_LATIN_ROOTS',p_environment,'enabled','allow_existing',
  current_revision.readiness_report,current_revision.id,p_actor::text,'Teaching Dictionary reviewed Latin root workbook publication');
 return jsonb_build_object('releaseId',release_id,'activationRevisionId',activation,'wordCount',jsonb_array_length(closure#>'{dictionary,words}'));
end $$;
revoke all on function public.adle_latin_root_reviewed_subset_current_v1(jsonb),public.publish_adle_latin_root_bulk_review_v1(jsonb,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.adle_latin_root_reviewed_subset_current_v1(jsonb),public.publish_adle_latin_root_bulk_review_v1(jsonb,text,text,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
