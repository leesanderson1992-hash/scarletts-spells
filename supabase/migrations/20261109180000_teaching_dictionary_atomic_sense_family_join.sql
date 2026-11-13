begin;

-- A new family revision and its reviewed sense link must succeed together.
create function public.review_lexical_base_family_member_for_sense(
  p_request_id uuid,p_family_key text,p_expected_revision integer,
  p_word_id uuid,p_morphology_id uuid,p_word_part_of_speech text,
  p_relationship_kind text,p_sense_id text,p_component_part_id text,
  p_source_reference text,p_reviewer uuid,p_approval_reference text
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_set jsonb;
  v_sense jsonb;
  v_revision integer;
begin
  select sense_set into v_set from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=p_word_id;
  select value into v_sense from jsonb_array_elements(coalesce(v_set->'senses','[]'::jsonb))
    where value->>'id'=p_sense_id;
  if v_sense is null or v_sense->>'partOfSpeech' is distinct from p_word_part_of_speech
    or nullif(btrim(v_sense->>'definition'),'') is null then
    raise exception 'SENSE_FAMILY_MEANING_CONFLICT';
  end if;
  v_revision:=public.review_lexical_base_family_member_revision(
    p_family_key,p_expected_revision,p_word_id,p_morphology_id,
    p_word_part_of_speech,p_relationship_kind,v_sense->>'definition',
    p_source_reference,p_reviewer::text,p_approval_reference);
  perform public.review_teaching_dictionary_sense_family_link(
    p_request_id,p_word_id,p_sense_id,p_family_key,p_component_part_id,
    'approve',p_reviewer,p_source_reference);
  return v_revision;
end $$;
revoke all on function public.review_lexical_base_family_member_for_sense(
  uuid,text,integer,uuid,uuid,text,text,text,text,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.review_lexical_base_family_member_for_sense(
  uuid,text,integer,uuid,uuid,text,text,text,text,text,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
