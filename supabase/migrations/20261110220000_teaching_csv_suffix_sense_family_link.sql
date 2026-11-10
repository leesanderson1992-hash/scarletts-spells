begin;

-- A suffix-profile Overview reconciliation also revises its reviewed lexical
-- free-base family. Link that member to the imported meaning before the
-- candidate handoff, under the same atomic publication guard.
do $$
declare body text;
  old_check text := $old$if p_mode in ('free_base','bound_root') then$old$;
  new_check text := $new$if p_mode in ('free_base','bound_root','suffix_overview') then$new$;
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_reviewed_csv_facts_first(
    uuid,uuid,text,text)'::regprocedure) into body;
  if position(new_check in body)>0 then return; end if;
  if (length(body)-length(replace(body,old_check,'')))/length(old_check)<>1 then
    raise exception 'TEACHING_CSV_FACTS_FIRST_FUNCTION_CHANGED';
  end if;
  execute replace(body,old_check,new_check);
end $$;

notify pgrst,'reload schema';
commit;
