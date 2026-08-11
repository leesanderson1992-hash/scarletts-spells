-- Base+Prefix and Base+Suffix are owned by the existing Base Word route
-- cluster.  Teaching-content publication must follow that canonical ownership
-- rather than retain the original two-skill pilot allowlist.
--
-- This changes no content, release, activation, learner item, or gate.

begin;

do $migration$
declare
  v_signature constant text := 'public.publish_adle_base_word_teaching_content_authority_v1(jsonb,text,text,text)';
  v_definition text;
  v_old_skill_check text := $old$or p_manifest->>'microSkillKey' not in (
       'D4_MOR_BASE_WORDS_IDENTIFY_BASE',
       'D4_MOR_BASE_WORDS_PRESERVE_BASE'
     )$old$;
  v_new_skill_check text := $new$or not public.adle_micro_skill_owns_base_word_lab_v2(p_manifest->>'microSkillKey')$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null or position(v_old_skill_check in v_definition) = 0 then
    raise exception 'Base Word teaching-content publisher predecessor differs from the reviewed two-skill contract';
  end if;
  v_definition := replace(v_definition, v_old_skill_check, v_new_skill_check);
  if position(v_old_skill_check in v_definition) > 0
     or position(v_new_skill_check in v_definition) = 0 then
    raise exception 'Base Word teaching-content publisher cluster replacement was not exact';
  end if;
  execute v_definition;
end;
$migration$;

comment on function public.publish_adle_base_word_teaching_content_authority_v1(jsonb,text,text,text) is
  'Publishes immutable signed-off teaching-content authority for exactly a canonical Base Word route-cluster micro-skill.';

commit;
