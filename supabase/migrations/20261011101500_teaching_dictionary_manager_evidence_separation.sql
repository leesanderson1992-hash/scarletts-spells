-- Candidate evidence mappings do not own lesson content and must not block
-- publication of reviewed dictionary facts. Keep the protected release gate for
-- actual route members, compound structures and learner lesson items.
do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_manager_draft(uuid,uuid)'::regprocedure)
    into v_definition;
  v_updated := replace(v_definition,
    E'    or exists (select 1 from public.canonical_teaching_dictionary_word_support where canonical_word_id=w.id and row_status=\'active\')\n', '');
  v_updated := replace(v_updated,
    E'    or exists (select 1 from public.adle_reviewed_word_skill_pairs where canonical_word_id=w.id)\n', '');
  if v_updated = v_definition then
    raise exception 'TEACHING_DICTIONARY_EVIDENCE_GATE_SOURCE_NOT_FOUND';
  end if;
  execute v_updated;
end
$migration$;
revoke all on function public.publish_teaching_dictionary_manager_draft(uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_manager_draft(uuid,uuid) to service_role;
