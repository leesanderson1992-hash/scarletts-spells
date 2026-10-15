-- Parent sources remain mandatory. Parenthesise JSON operands so PostgreSQL
-- evaluates containment before applying NOT.
begin;
do $patch$
declare body text; previous text := 'if not p_manifest->''sourceAuthorities'' @> v_parent.semantic_projection->''sourceAuthorities''';
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_base_family_authority_v2(uuid,jsonb,text,text)'::regprocedure) into body;
  if position(previous in body)=0 then raise exception 'BASE_FAMILY_PUBLISHER_SHAPE_CHANGED'; end if;
  body:=replace(body,previous,'if not ((p_manifest->''sourceAuthorities'') @> (v_parent.semantic_projection->''sourceAuthorities''))');
  execute body;
end $patch$;
notify pgrst, 'reload schema';
commit;
