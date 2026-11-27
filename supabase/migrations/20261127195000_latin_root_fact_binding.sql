begin;
-- Bind every displayed family and ordered word part to the published dictionary,
-- in addition to the immutable snapshot/hash checks.
do $migration$ declare original text; patched text;
begin
 select pg_get_functiondef('public.assert_adle_latin_root_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid)'::regprocedure) into original;
 patched:=replace(original,'keys text[];', 'keys text[]; source_family jsonb; expected_parts jsonb;');
 patched:=replace(patched,
   'select * into strict r from public.adle_route_activation_revisions',
   'if p_metadata#>''{route}'' is distinct from p_snapshot#>''{route}''
      or p_metadata#>''{recipe}'' is distinct from p_snapshot#>''{recipe}''
      or p_metadata#>>''{payload,kind}'' is distinct from p_snapshot#>>''{payload,kind}''
      or p_metadata#>>''{payload,version}'' is distinct from p_snapshot#>>''{payload,version}''
      then raise exception ''LATIN_ROOT_METADATA_BINDING_INVALID''; end if;
    select * into strict r from public.adle_route_activation_revisions');
 patched:=replace(patched,
   'for word in select value from jsonb_array_elements(p_snapshot#>''{payload,resolvedLesson,words}'') loop',
   'for family in select value from jsonb_array_elements(p_snapshot#>''{payload,resolvedLesson,content,families}'') loop
      select value into strict source_family from jsonb_array_elements(closure->''families'') where value->>''familyKey''=family->>''id'';
      if family->>''root'' is distinct from source_family->>''root''
        or family->>''meaning'' is distinct from source_family->>''meaning''
        or family->>''origin'' is distinct from source_family->>''origin''
        then raise exception ''LATIN_ROOT_FAMILY_FACTS_CHANGED''; end if;
    end loop;
    for word in select value from jsonb_array_elements(p_snapshot#>''{payload,resolvedLesson,words}'') loop');
 patched:=replace(patched,
   'if public.adle_weak_vowel_json_sha256_v1(fact) is distinct from word->>''sourceFingerprint''',
   'select value into strict source_family from jsonb_array_elements(closure->''families'') where value->>''familyKey''=fact->>''familyKey'';
    select jsonb_agg(jsonb_build_object(''text'',part.value->>''surfaceText'',''role'',part.value->>''kind'',
      ''meaning'',case when part.value->>''kind''=''root'' then source_family->>''meaning'' else part.value->>''gloss'' end) order by part.ordinality)
      into expected_parts from jsonb_array_elements(fact->''parts'') with ordinality part;
    if content_word->''parts'' is distinct from expected_parts
      or not exists(select 1 from jsonb_array_elements(p_snapshot#>''{payload,resolvedLesson,content,families}'') f,
        jsonb_array_elements(f.value->''words'') w where f.value->>''id''=fact->>''familyKey'' and w.value=content_word)
      or public.adle_weak_vowel_json_sha256_v1(fact) is distinct from word->>''sourceFingerprint''');
 if patched=original or position('LATIN_ROOT_FAMILY_FACTS_CHANGED' in patched)=0
   or position('expected_parts' in patched)=0 then raise exception 'LATIN_ROOT_FACT_BINDING_PATCH_NOT_FOUND'; end if;
 execute patched;
end $migration$;
notify pgrst,'reload schema';
commit;
