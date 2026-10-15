begin;
-- During schema-first rollout, the earlier editor omits the new fields. Keep
-- their reviewed values when that editor changes an unrelated shared fact.
do $patch$
declare body text; needle text:=$old$  v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');$old$;
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_manager_draft(uuid,uuid)'::regprocedure) into body;
  if position(needle in body)=0 then raise exception 'TEACHING_MANAGER_COMPATIBILITY_PATCH_SOURCE_CHANGED'; end if;
  body:=replace(body,needle,$new$
  if not v_morphology ? 'transformations' then
    v_morphology:=v_morphology||jsonb_build_object('transformations',coalesce((select morphology_transformations from public.canonical_teaching_dictionary_word_morphology where canonical_word_id=w.id and row_status='active' order by created_at desc,id desc limit 1),'[]'::jsonb));
  end if;
  if not v_payload ? 'writtenSyllableBreakdown' then
    v_payload:=v_payload||jsonb_build_object('writtenSyllableBreakdown',(select written_syllable_breakdown from public.canonical_teaching_dictionary_word_metadata where canonical_word_id=w.id and row_status='active' order by created_at desc,id desc limit 1));
  end if;
$new$||needle);
  execute body;
end $patch$;
do $patch$
declare body text; needle text:=$old$  if d.payload ? 'dictationVariants' and not exists$old$;
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_dictation_set(uuid,uuid)'::regprocedure) into body;
  if position(needle in body)=0 then raise exception 'TEACHING_DICTATION_COMPATIBILITY_PATCH_SOURCE_CHANGED'; end if;
  body:=replace(body,needle,$new$
  if not d.payload ? 'dictationVariants' then
    select s.id into v_set from public.teaching_dictionary_dictation_heads h
      join public.teaching_dictionary_dictation_sets s on s.id=h.set_id
      where h.canonical_word_id=v_word and s.variants#>>'{0,sentence}'=d.payload->>'dictationSentence'
        and s.variants#>>'{0,targetTokenIndex}'=d.payload->>'dictationTargetTokenIndex';
    if v_set is not null then return v_set; end if;
  end if;
$new$||needle);
  execute body;
end $patch$;
notify pgrst, 'reload schema';
commit;
