begin;

-- Free-base creation takes its meanings from reviewed Overview senses and
-- publishes the member's sense link in the same transaction as the family.
create function public.create_reviewed_lexical_free_base_family_for_sense(
  p_request_id uuid,p_base_word_id uuid,p_word_id uuid,
  p_base_morphology_id uuid,p_word_morphology_id uuid,
  p_base_sense_id text,p_word_sense_id text,p_component_part_id text,
  p_relationship_kind text,p_source_reference text,p_reviewer uuid,
  p_approval_reference text
) returns text language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_base_set jsonb;
  v_word_set jsonb;
  v_base_sense jsonb;
  v_word_sense jsonb;
  v_base_part jsonb;
  v_word_part jsonb;
  v_base_lemma text;
  v_key text;
begin
  select sense_set into v_base_set from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=p_base_word_id;
  select sense_set into v_word_set from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=p_word_id;
  select value into v_base_sense from jsonb_array_elements(coalesce(v_base_set->'senses','[]'::jsonb))
    where value->>'id'=p_base_sense_id;
  select value into v_word_sense from jsonb_array_elements(coalesce(v_word_set->'senses','[]'::jsonb))
    where value->>'id'=p_word_sense_id;
  if v_base_sense is null or v_word_sense is null
    or nullif(btrim(v_base_sense->>'definition'),'') is null
    or nullif(btrim(v_word_sense->>'definition'),'') is null
    or nullif(btrim(v_base_sense->>'partOfSpeech'),'') is null
    or nullif(btrim(v_word_sense->>'partOfSpeech'),'') is null then
    raise exception 'SENSE_FAMILY_REVIEWED_SENSE_REQUIRED';
  end if;
  select normalised_word into v_base_lemma from public.canonical_teaching_dictionary_words
    where id=p_base_word_id;
  select parts.part into v_base_part from public.canonical_teaching_dictionary_word_morphology m,
    jsonb_array_elements(m.morphology_parts) parts(part)
    where m.id=p_base_morphology_id and m.canonical_word_id=p_base_word_id
      and parts.part->>'kind'='base' and lower(parts.part->>'sourceText')=v_base_lemma
      and parts.part->>'gloss'=v_base_sense->>'definition' limit 1;
  select parts.part into v_word_part from public.canonical_teaching_dictionary_word_morphology m,
    jsonb_array_elements(m.morphology_parts) parts(part)
    where m.id=p_word_morphology_id and m.canonical_word_id=p_word_id
      and parts.part->>'id'=p_component_part_id and parts.part->>'kind'='base'
      and lower(parts.part->>'sourceText')=v_base_lemma
      and parts.part->>'gloss'=v_base_sense->>'definition' limit 1;
  if v_base_part is null or v_word_part is null then
    raise exception 'SENSE_FAMILY_COMPONENT_INVALID';
  end if;
  v_key:=public.create_reviewed_lexical_free_base_family(
    p_base_word_id,p_word_id,p_base_morphology_id,p_word_morphology_id,
    v_base_sense->>'partOfSpeech',v_word_sense->>'partOfSpeech',
    p_relationship_kind,v_base_sense->>'definition',v_word_sense->>'definition',
    p_source_reference,p_reviewer::text,p_approval_reference);
  perform public.review_teaching_dictionary_sense_family_link(
    p_request_id,p_word_id,p_word_sense_id,v_key,p_component_part_id,
    'approve',p_reviewer,p_source_reference);
  return v_key;
end $$;
revoke all on function public.create_reviewed_lexical_free_base_family_for_sense(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.create_reviewed_lexical_free_base_family_for_sense(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
