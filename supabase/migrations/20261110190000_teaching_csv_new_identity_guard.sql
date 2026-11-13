begin;

-- A draft originally classified as new must not overwrite an active word
-- created after the CSV upload but before publication.
do $$
declare body text;
  old_block text := $old$
  if p_mode='new_word' then
    if d.canonical_word_id is not null or cardinality(v_expected)<>0$old$;
  new_block text := $new$
  if p_mode='new_word' then
    if exists(select 1 from public.canonical_teaching_dictionary_words w
      where w.normalised_word=d.normalised_word and w.dialect_code=d.dialect_code
        and w.row_status='active') then
      raise exception 'TEACHING_CSV_FACTS_FIRST_NEW_WORD_EXISTS';
    end if;
    if d.canonical_word_id is not null or cardinality(v_expected)<>0$new$;
begin
  select pg_get_functiondef('public.publish_teaching_dictionary_reviewed_csv_facts_first(
    uuid,uuid,text,text)'::regprocedure) into body;
  if position(new_block in body)>0 then return; end if;
  if (length(body)-length(replace(body,old_block,'')))/length(old_block)<>1 then
    raise exception 'TEACHING_CSV_FACTS_FIRST_FUNCTION_CHANGED';
  end if;
  execute replace(body,old_block,new_block);
end $$;

notify pgrst,'reload schema';
commit;
