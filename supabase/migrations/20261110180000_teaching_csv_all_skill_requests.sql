begin;

-- Keep every imported skill proposal visible after the dictionary row leaves
-- the pending list. Only skills with a defined candidate rule are attempted
-- automatically; other requests remain for deliberate bulk review.
do $$
declare body text;
  old_block text := $old$
    if v_skill in ('D4_INF_ING_ENDINGS_REGULAR','D4_INF_ING_ENDINGS_DROP_E',
      'D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT','D4_INF_ING_ENDINGS_IE_TO_Y',
      'D4_MOR_SUFFIXES_ABLE_IBLE') then
      insert into public.teaching_dictionary_import_candidate_handoffs
        (draft_id,environment_key,canonical_word_id,micro_skill_key,sense_id)
      values(d.id,p_environment,v_word,v_skill,v_sense);
    end if;$old$;
  new_block text := $new$
    insert into public.teaching_dictionary_import_candidate_handoffs
      (draft_id,environment_key,canonical_word_id,micro_skill_key,sense_id)
    values(d.id,p_environment,v_word,v_skill,v_sense);$new$;
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
