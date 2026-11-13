begin;

-- Existing reviewed CSV publication has four guarded routes. Keep their
-- established validations and bind its single reviewed meaning in the same
-- transaction as the Overview and word-skill release.
create function public.publish_teaching_dictionary_reviewed_csv_senses(
  p_draft uuid,p_actor uuid,p_environment text,p_mode text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.teaching_dictionary_manager_drafts%rowtype;
  v_word uuid; v_sense text; v_skill text;
begin
  if p_actor is null or p_environment not in ('staging','production')
    or p_mode not in ('reconciled','free_base','suffix_overview','bound_root') then
    raise exception 'TEACHING_CSV_SENSE_PUBLICATION_INVALID';
  end if;
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  if d.id is null or d.source_reference !~ '^CSV batch [a-f0-9-]{36},'
    or not exists (select 1 from public.teaching_dictionary_import_skill_reviews r
      where r.draft_id=d.id and r.reviewed_by=p_actor
        and r.source_reference=d.source_reference
        and r.skill_fingerprint=public.adle_generic_snapshot_json_sha256_v1(d.payload->'skillKeys')) then
    raise exception 'TEACHING_CSV_SKILL_REVIEW_REQUIRED';
  end if;
  if d.payload ? 'senseSet' then
    if jsonb_typeof(d.payload->'senseSet'->'senses') is distinct from 'array'
      or jsonb_array_length(d.payload->'senseSet'->'senses') <> 1 then
      raise exception 'TEACHING_CSV_SINGLE_SENSE_REQUIRED';
    end if;
    v_sense:=nullif(btrim(d.payload->'senseSet'->'senses'->0->>'id'),'');
    if v_sense is null then raise exception 'TEACHING_CSV_SINGLE_SENSE_REQUIRED'; end if;
  end if;
  case p_mode
    when 'reconciled' then
      v_word:=public.publish_teaching_dictionary_reviewed_reconciled_draft(p_draft,p_actor,p_environment);
    when 'free_base' then
      v_word:=public.publish_teaching_dictionary_reviewed_free_base_draft(p_draft,p_actor,p_environment);
    when 'suffix_overview' then
      v_word:=public.publish_teaching_dictionary_reviewed_suffix_overview_draft(p_draft,p_actor,p_environment);
    when 'bound_root' then
      v_word:=public.publish_teaching_dictionary_reviewed_bound_root_draft(p_draft,p_actor,p_environment);
  end case;
  if v_sense is not null then
    for v_skill in select value from jsonb_array_elements_text(d.payload->'skillKeys') value loop
      perform public.review_teaching_dictionary_lesson_sense(
        p_environment,v_word,v_skill,v_sense,p_actor);
    end loop;
  end if;
  return v_word;
end $$;
revoke all on function public.publish_teaching_dictionary_reviewed_csv_senses(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_reviewed_csv_senses(uuid,uuid,text,text)
  to service_role;

notify pgrst,'reload schema';
commit;
