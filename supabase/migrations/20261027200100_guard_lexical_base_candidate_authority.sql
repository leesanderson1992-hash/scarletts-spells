-- A dictionary-approved family must also have explicit Base Word candidate
-- authorisation before an immutable lesson authority can include it.
begin;
do $guard$
declare
  body text;
  old_clause text := $old$      if v_lexical.family_key is not null and
          v_family->>'familyId'=md5('lexical-family:'||v_lexical.family_key||':'||v_lexical.revision)::uuid::text then$old$;
  new_clause text := $new$      if v_lexical.family_key is not null and
          v_family->>'familyId'=md5('lexical-family:'||v_lexical.family_key||':'||v_lexical.revision)::uuid::text then
        if not exists (select 1 from public.adle_base_word_lexical_family_authorizations authz
          where authz.family_key=v_lexical.family_key
            and authz.revision=v_lexical.revision
            and authz.semantic_fingerprint=v_lexical.semantic_fingerprint
            and authz.withdrawn_at is null) then
          raise exception 'BASE_FAMILY_LEXICAL_SOURCE_NOT_AUTHORIZED';
        end if;$new$;
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_base_family_authority_v2(uuid,jsonb,text,text)'::regprocedure)
    into body;
  if body is null or position(old_clause in body)=0 then
    raise exception 'Base Word lexical authority publisher differs from the reviewed contract';
  end if;
  execute replace(body,old_clause,new_clause);
end;
$guard$;
commit;
