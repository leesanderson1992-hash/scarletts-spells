-- Preserve and validate release-scoped regularity decisions in the immutable
-- family semantic projection consumed by new Base Word lessons.
begin;
do $regularity$
declare
  body text;
  old_clause text := $old$  v_projection:=jsonb_build_object('schemaVersion',2,'skillClusterKey','D4_MOR_BASE_WORDS',
    'sourceAuthorities',p_manifest->'sourceAuthorities','families',p_manifest->'families');$old$;
  new_clause text := $new$  if p_manifest ? 'selectionPolicyVersion' then
    if p_manifest->>'selectionPolicyVersion' <> 'base_word_regularity_v1'
      or exists (
        select 1 from jsonb_array_elements(p_manifest->'families') family
        cross join lateral jsonb_array_elements(family->'members') member
        where jsonb_typeof(member->'lessonRegularity') <> 'object'
          or member#>>'{lessonRegularity,status}' not in ('regular','irregular','needs_review')
          or nullif(btrim(member#>>'{lessonRegularity,source}'),'') is null
          or nullif(btrim(member#>>'{lessonRegularity,reason}'),'') is null
      ) then raise exception 'BASE_FAMILY_REGULARITY_DECISION_INVALID'; end if;
  end if;
  v_projection:=jsonb_build_object('schemaVersion',2,'skillClusterKey','D4_MOR_BASE_WORDS',
    'sourceAuthorities',p_manifest->'sourceAuthorities','families',p_manifest->'families')
    || case when p_manifest ? 'selectionPolicyVersion'
      then jsonb_build_object('selectionPolicyVersion',p_manifest->'selectionPolicyVersion')
      else '{}'::jsonb end;$new$;
  old_member_clause text := $old$          or v_member - 'applicableMicroSkillKeys' <> v_parent_member - 'applicableMicroSkillKeys'
          then raise exception 'BASE_FAMILY_AUTHORITY_UNREVIEWED_MEMBER'; end if;$old$;
  new_member_clause text := $new$          or (case when p_manifest ? 'selectionPolicyVersion'
            then v_member - 'applicableMicroSkillKeys' - 'lessonRegularity'
            else v_member - 'applicableMicroSkillKeys' end)
            <> (case when p_manifest ? 'selectionPolicyVersion'
              then v_parent_member - 'applicableMicroSkillKeys' - 'lessonRegularity'
              else v_parent_member - 'applicableMicroSkillKeys' end)
          then raise exception 'BASE_FAMILY_AUTHORITY_UNREVIEWED_MEMBER'; end if;$new$;
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_base_family_authority_v2(uuid,jsonb,text,text)'::regprocedure)
    into body;
  if body is null then raise exception 'Base Word family publisher is missing'; end if;
  if position(new_clause in body)=0 then
    if position(old_clause in body)=0 then
      raise exception 'Base Word family publisher differs from the reviewed regularity contract';
    end if;
    body:=replace(body,old_clause,new_clause);
  end if;
  if position(new_member_clause in body)=0 then
    if position(old_member_clause in body)=0 then
      raise exception 'Base Word member publisher differs from the reviewed regularity contract';
    end if;
    body:=replace(body,old_member_clause,new_member_clause);
  end if;
  execute body;
end;
$regularity$;
commit;
