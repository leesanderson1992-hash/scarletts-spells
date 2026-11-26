begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- A successor release carries exact parent facts without requiring editors to
-- reapprove unrelated historical route JSON. New or changed lexical members
-- still pass the full source, morphology, pair and route-review checks. The
-- runtime canonical projection continues to enforce current published facts
-- and explicit deassignments for every selectable word.
do $preserve$
declare
  body text;
  original text := $old$      if v_member#>>'{morphologySource,sourceKind}'='approved_lexical_family_member' then$old$;
  replacement text := $new$      if v_member#>>'{morphologySource,sourceKind}'='approved_lexical_family_member'
        and exists (
          select 1 from jsonb_array_elements(coalesce(v_parent_family->'members','[]'::jsonb)) inherited
          where inherited->>'canonicalWordId'=v_member->>'canonicalWordId'
            and inherited->'applicableMicroSkillKeys' ? v_skill
            and inherited - 'applicableMicroSkillKeys' = v_member - 'applicableMicroSkillKeys'
        ) then
        null; -- Exact frozen member; this grants no new word or lesson approval.
      elsif v_member#>>'{morphologySource,sourceKind}'='approved_lexical_family_member' then$new$;
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_base_family_authority_v2(uuid,jsonb,text,text)'::regprocedure)
    into body;
  if position(replacement in body)=0 then
    if position(original in body)=0 then
      raise exception 'BASE_FAMILY_FROZEN_MEMBER_GUARD_CHANGED';
    end if;
    execute replace(body,original,replacement);
  end if;
end;
$preserve$;
notify pgrst,'reload schema';
commit;
