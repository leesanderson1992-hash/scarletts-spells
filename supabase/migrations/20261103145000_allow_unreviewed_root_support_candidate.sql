begin;

-- A historical, unapproved support candidate is not a published dependency.
-- Approved support remains guarded by the root import transaction.
do $$
declare
  body text;
  old_guard text := $guard$or exists(select 1 from public.canonical_teaching_dictionary_word_support x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')$guard$;
  new_guard text := $guard$or exists(select 1 from public.canonical_teaching_dictionary_word_support x where x.canonical_word_id=d.canonical_word_id and x.row_status='active' and x.review_status='approved_for_first_exposure')$guard$;
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_reviewed_bound_root_draft(uuid,uuid,text)'::regprocedure)
    into body;
  if position(new_guard in body)>0 then return; end if;
  if (length(body)-length(replace(body,old_guard,'')))/length(old_guard)<>1 then
    raise exception 'TEACHING_ROOT_IMPORT_FUNCTION_CHANGED';
  end if;
  execute replace(body,old_guard,new_guard);
end $$;

notify pgrst,'reload schema';
commit;
