begin;

-- Approve the reviewed meanings of an existing spelling independently of its
-- morphology, word-level metadata, and any lesson release.
create function public.review_teaching_dictionary_meanings(
  p_draft uuid, p_actor uuid, p_expected_reviewed_at timestamptz
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.teaching_dictionary_manager_drafts%rowtype;
  v_set jsonb;
  v_sense jsonb;
  v_reviewed_at timestamptz;
begin
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft;
  if d.canonical_word_id is null or d.source_kind <> 'manual'
    or d.created_by is distinct from p_actor or p_actor is null then
    raise exception 'TEACHING_MEANING_DRAFT_REQUIRED';
  end if;
  perform 1 from public.canonical_teaching_dictionary_words
    where id=d.canonical_word_id and row_status='active' for update;
  if not found then raise exception 'TEACHING_MEANING_DRAFT_REQUIRED'; end if;

  v_set:=d.payload->'senseSet';
  if jsonb_typeof(v_set->'senses') is distinct from 'array'
    or jsonb_typeof(v_set->'pronunciations') is distinct from 'array'
    or jsonb_array_length(v_set->'senses')=0 then
    raise exception 'TEACHING_SENSE_SET_INVALID';
  end if;

  -- Retries of the same facts are harmless. A stale form cannot overwrite a
  -- newer approved set, including one approved by an import.
  insert into public.teaching_dictionary_reviewed_sense_sets
    (canonical_word_id,sense_set,reviewed_by)
  select d.canonical_word_id,v_set,p_actor
  where p_expected_reviewed_at is null or exists (
    select 1 from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=d.canonical_word_id
  )
  on conflict (canonical_word_id) do update
    set sense_set=excluded.sense_set, reviewed_by=excluded.reviewed_by,
        reviewed_at=excluded.reviewed_at
    where teaching_dictionary_reviewed_sense_sets.reviewed_at
      is not distinct from p_expected_reviewed_at
      and teaching_dictionary_reviewed_sense_sets.sense_set is distinct from excluded.sense_set
  returning reviewed_at into v_reviewed_at;
  if v_reviewed_at is null then
    if exists (select 1 from public.teaching_dictionary_reviewed_sense_sets
      where canonical_word_id=d.canonical_word_id and sense_set=v_set) then return; end if;
    raise exception 'TEACHING_MEANING_REVIEW_STALE';
  end if;

  for v_sense in select value from jsonb_array_elements(v_set->'senses') loop
    if nullif(btrim(v_sense->>'dictationSentence'),'') is not null
      and jsonb_typeof(v_sense->'dictationTargetTokenIndex')='number' then
      insert into public.teaching_dictionary_reviewed_sense_sentences
        (canonical_word_id,sense_id,sentence,target_token_index,source_row_hash,reviewed_by,reviewed_at)
      values (d.canonical_word_id,v_sense->>'id',v_sense->>'dictationSentence',
        (v_sense->>'dictationTargetTokenIndex')::integer,
        public.adle_generic_snapshot_json_sha256_v1(jsonb_build_object(
          'senseId',v_sense->>'id','sentence',v_sense->>'dictationSentence',
          'targetTokenIndex',(v_sense->>'dictationTargetTokenIndex')::integer)),
        p_actor,v_reviewed_at)
      on conflict (canonical_word_id,sense_id,source_row_hash) do nothing;
    end if;
  end loop;
end $$;
revoke all on function public.review_teaching_dictionary_meanings(uuid,uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.review_teaching_dictionary_meanings(uuid,uuid,timestamptz)
  to service_role;
notify pgrst,'reload schema';
commit;
