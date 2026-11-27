-- Scope bytewise canonical JSON to the new root authorities. Preserve every
-- existing authority's historical serializer and semantic fingerprint.
begin;
do $migration$ declare previous text; expression text; original text; patched text;
begin
 select pg_get_constraintdef(oid) into strict previous from pg_constraint
  where conrelid='public.adle_curriculum_dependency_authorities'::regclass
    and conname='adle_curriculum_dependency_authorities_semantic_hash_check';
 expression:=substring(previous from 8 for char_length(previous)-8);
 execute 'alter table public.adle_curriculum_dependency_authorities drop constraint adle_curriculum_dependency_authorities_semantic_hash_check';
 execute 'alter table public.adle_curriculum_dependency_authorities add constraint adle_curriculum_dependency_authorities_semantic_hash_check check (case when semantic_projection->>''routeId''=''latin_root_word_lab'' then semantic_fingerprint=public.adle_weak_vowel_json_sha256_v1(semantic_projection) else ('||expression||') end)';
 select pg_get_functiondef('public.publish_adle_latin_root_package_v1(jsonb,text,text)'::regprocedure) into original;
 patched:=replace(original,
  'or a#>>''{semanticProjection,microSkillKey}'' is distinct from ''D4_MOR_ROOTS_COMMON_LATIN_ROOTS''',
  'or a#>>''{semanticProjection,routeId}'' is distinct from ''latin_root_word_lab'' or a#>>''{semanticProjection,microSkillKey}'' is distinct from ''D4_MOR_ROOTS_COMMON_LATIN_ROOTS''');
 if patched=original then raise exception 'LATIN_ROOT_PUBLICATION_ROUTE_GUARD_PATCH_NOT_FOUND'; end if;
 execute patched;
end $migration$;
commit;
