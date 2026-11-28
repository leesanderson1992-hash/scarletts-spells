begin;
-- Preserve the existing views' exact membership/removal semantics, while
-- avoiding repeated LLVM compilation on short word-editor reads.
create function public.teaching_dictionary_registry_members_read_v1(p_word uuid default null,p_families uuid[] default null)
returns table(canonical_family_id uuid,canonical_word_id uuid)
language sql stable security invoker set search_path=public,pg_temp set jit=off as $$
 select m.canonical_family_id,m.canonical_word_id from public.teaching_dictionary_spelling_registry_members m
 where (p_word is not null and m.canonical_word_id=p_word)
 or (p_word is null and cardinality(p_families)<=500 and m.canonical_family_id=any(p_families));
$$;
create function public.teaching_dictionary_lexical_members_read_v1(p_word uuid default null,p_families text[] default null)
returns table(family_key text,revision integer,canonical_word_id uuid,canonical_morphology_id uuid)
language sql stable security invoker set search_path=public,pg_temp set jit=off as $$
 select m.family_key,m.revision,m.canonical_word_id,m.canonical_morphology_id from public.teaching_dictionary_spelling_lexical_members m
 where (p_word is not null and m.canonical_word_id=p_word)
 or (p_word is null and cardinality(p_families)<=500 and m.family_key=any(p_families));
$$;
revoke all on function public.teaching_dictionary_registry_members_read_v1(uuid,uuid[]),public.teaching_dictionary_lexical_members_read_v1(uuid,text[]) from public,anon,authenticated;
grant execute on function public.teaching_dictionary_registry_members_read_v1(uuid,uuid[]),public.teaching_dictionary_lexical_members_read_v1(uuid,text[]) to service_role;
notify pgrst,'reload schema';
commit;
