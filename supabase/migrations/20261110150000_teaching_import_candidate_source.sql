begin;

-- A CSV publication still has to pass the same candidate review as the word
-- page and bulk assigner. Keep the actual entry point on its immutable event.
alter table public.teaching_dictionary_candidate_decision_events
  drop constraint teaching_dictionary_candidate_decision_events_source_kind_check;
alter table public.teaching_dictionary_candidate_decision_events
  add constraint teaching_dictionary_candidate_decision_events_source_kind_check
  check (source_kind in ('teaching_dictionary_bulk','teaching_dictionary_word',
    'teaching_dictionary_import'));

do $$
declare
  body text;
  old_guard text := $guard$p_source_kind not in ('teaching_dictionary_bulk','teaching_dictionary_word')$guard$;
  new_guard text := $guard$p_source_kind not in ('teaching_dictionary_bulk','teaching_dictionary_word','teaching_dictionary_import')$guard$;
begin
  select pg_get_functiondef('public.reconcile_teaching_dictionary_bulk_review_v6(
    text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text,text,jsonb,text)'::regprocedure)
    into body;
  if position(new_guard in body)>0 then return; end if;
  if (length(body)-length(replace(body,old_guard,'')))/length(old_guard)<>1 then
    raise exception 'TEACHING_IMPORT_CANDIDATE_FUNCTION_CHANGED';
  end if;
  execute replace(body,old_guard,new_guard);
end $$;

notify pgrst,'reload schema';
commit;
