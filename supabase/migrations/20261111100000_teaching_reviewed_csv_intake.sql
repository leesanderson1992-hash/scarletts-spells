begin;

-- Keep identity creation and review in one transaction for each spelling.
create function public.import_reviewed_teaching_dictionary_word(
  p_request_id uuid, p_word_id uuid, p_display_word text, p_expected_reviewed_at text,
  p_sense_set jsonb, p_analyses jsonb, p_actor uuid, p_source_reference text
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_spelling text := lower(translate(btrim(p_display_word), '’ʼ', chr(39)||chr(39)));
  v_word uuid;
  v_batch uuid;
  v_hash text;
begin
  if p_request_id is null or p_actor is null or nullif(btrim(p_source_reference),'') is null
    or coalesce(length(v_spelling),0) not between 1 and 120 then
    raise exception 'REVIEWED_CSV_WORD_INVALID';
  end if;
  if p_word_id is not null then
    if not exists(select 1 from public.canonical_teaching_dictionary_words
      where id=p_word_id and normalised_word=v_spelling and dialect_code='en-GB') then
      raise exception 'REVIEWED_CSV_IDENTITY_MISMATCH';
    end if;
    v_word := p_word_id;
  else
    perform pg_advisory_xact_lock(hashtextextended('reviewed-csv-spelling:'||v_spelling,0));
    if nullif(p_expected_reviewed_at,'') is not null then
      raise exception 'REVIEWED_CSV_IDENTITY_MISMATCH';
    end if;
    if exists(select 1 from public.canonical_teaching_dictionary_words
      where normalised_word=v_spelling and dialect_code='en-GB' and row_status in ('active','draft')) then
      raise exception 'REVIEWED_CSV_WORD_EXISTS';
    end if;
    v_hash := public.adle_generic_snapshot_json_sha256_v1(jsonb_build_object(
      'spelling',v_spelling,'senses',p_sense_set,'analyses',p_analyses));
    insert into public.canonical_teaching_dictionary_import_batches
      (source_folder_path,source_folder_sha256,validator_version,row_counts,import_mode,batch_status,imported_by,imported_at)
    values ('teaching-dictionary-reviewed-csv/'||p_request_id,v_hash,'reviewed_meanings_csv_v1',
      '{"words":1}', 'admin_import','applied',p_actor::text,now()) returning id into v_batch;
    insert into public.canonical_teaching_dictionary_words
      (import_batch_id,row_status,source_sheet,source_row_number,source_row_hash,word_key,
       normalised_word,display_word,dialect_code,source_category,source_name,source_use_note,confidence,review_status)
    values (v_batch,'active','reviewed meanings',2,v_hash,'reviewed_csv_'||p_request_id,
      v_spelling,btrim(p_display_word),'en-GB','internal_authored','Admin reviewed Teaching Dictionary CSV',p_source_reference,'high',
      'approved_for_first_exposure') returning id into v_word;
  end if;
  return public.review_teaching_dictionary_multi_sense_csv(
    p_request_id,v_word,p_expected_reviewed_at,p_sense_set,p_analyses,p_actor,p_source_reference);
end $$;

revoke all on function public.import_reviewed_teaching_dictionary_word(
  uuid,uuid,text,text,jsonb,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.import_reviewed_teaching_dictionary_word(
  uuid,uuid,text,text,jsonb,jsonb,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
