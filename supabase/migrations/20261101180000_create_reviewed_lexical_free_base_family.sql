begin;

-- Create the first immutable lexical revision from approved dictionary facts.
-- This does not create an ADLE lesson or word-skill assignment.
create function public.create_reviewed_lexical_free_base_family(
  p_base_word_id uuid, p_word_id uuid, p_base_morphology_id uuid,
  p_word_morphology_id uuid, p_base_part_of_speech text,
  p_word_part_of_speech text, p_relationship_kind text,
  p_base_meaning text, p_word_meaning text, p_source_reference text,
  p_reviewer text, p_approval_reference text
) returns text language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_base public.canonical_teaching_dictionary_words%rowtype;
  v_word public.canonical_teaching_dictionary_words%rowtype;
  v_base_morph public.canonical_teaching_dictionary_word_morphology%rowtype;
  v_word_morph public.canonical_teaching_dictionary_word_morphology%rowtype;
  v_key text;
begin
  if nullif(btrim(p_base_part_of_speech),'') is null
    or nullif(btrim(p_word_part_of_speech),'') is null
    or nullif(btrim(p_base_meaning),'') is null
    or nullif(btrim(p_word_meaning),'') is null
    or nullif(btrim(p_source_reference),'') is null
    or nullif(btrim(p_reviewer),'') is null
    or nullif(btrim(p_approval_reference),'') is null
    or p_relationship_kind not in
      ('free_base','regular_inflection','irregular_inflection','derived','contraction','historical_relative')
    then raise exception 'LEXICAL_FAMILY_CREATE_INCOMPLETE'; end if;
  if (p_base_word_id=p_word_id and p_relationship_kind<>'free_base')
    or (p_base_word_id<>p_word_id and p_relationship_kind='free_base')
    then raise exception 'LEXICAL_FAMILY_RELATIONSHIP_INVALID'; end if;
  select * into v_base from public.canonical_teaching_dictionary_words
    where id=p_base_word_id and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure';
  select * into v_word from public.canonical_teaching_dictionary_words
    where id=p_word_id and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure';
  select * into v_base_morph from public.canonical_teaching_dictionary_word_morphology
    where id=p_base_morphology_id and canonical_word_id=p_base_word_id
      and row_status='active' and analysis_status='approved'
      and review_status='approved_for_first_exposure';
  select * into v_word_morph from public.canonical_teaching_dictionary_word_morphology
    where id=p_word_morphology_id and canonical_word_id=p_word_id
      and row_status='active' and analysis_status='approved'
      and review_status='approved_for_first_exposure';
  if v_base.id is null or v_word.id is null or v_base_morph.id is null
    or v_word_morph.id is null then raise exception 'LEXICAL_FAMILY_APPROVED_FACTS_REQUIRED'; end if;
  if nullif(btrim(v_base_morph.word_sum),'') is null
    or nullif(btrim(v_word_morph.word_sum),'') is null
    or not exists (select 1 from jsonb_array_elements(v_base_morph.morphology_parts) part
      where part->>'kind'='base' and lower(part->>'sourceText')=v_base.normalised_word)
    or not exists (select 1 from jsonb_array_elements(v_word_morph.morphology_parts) part
      where part->>'kind'='base' and lower(part->>'sourceText')=v_base.normalised_word)
    or (select string_agg(part.value->>'surfaceText','' order by part.ordinality)
      from jsonb_array_elements(v_base_morph.morphology_parts) with ordinality part(value,ordinality))
      is distinct from v_base.display_word
    or (select string_agg(part.value->>'surfaceText','' order by part.ordinality)
      from jsonb_array_elements(v_word_morph.morphology_parts) with ordinality part(value,ordinality))
      is distinct from v_word.display_word
    then raise exception 'LEXICAL_FAMILY_APPROVED_MORPHOLOGY_REQUIRED'; end if;
  v_key:=regexp_replace(lower(v_base.normalised_word),'[^a-z0-9]+','_','g')||'_'||
    regexp_replace(lower(p_base_part_of_speech),'[^a-z0-9]+','_','g')||'_base_family';
  perform pg_advisory_xact_lock(hashtextextended('lexical-family:'||v_key,0));
  if exists (select 1 from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=v_key) then raise exception 'LEXICAL_FAMILY_ALREADY_EXISTS'; end if;
  insert into public.canonical_teaching_dictionary_lexical_base_families
    (family_key,revision,base_lemma,base_part_of_speech,base_kind,
      canonical_base_word_id,base_meaning,source_reference,review_status)
  values (v_key,1,v_base.normalised_word,p_base_part_of_speech,'free_base',
    v_base.id,p_base_meaning,p_source_reference,'draft');
  insert into public.canonical_teaching_dictionary_lexical_base_family_members
    (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
      canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
      morphology_transformations,intended_meaning,source_reference)
  values (v_key,1,v_base.id,p_base_part_of_speech,'free_base',
    v_base_morph.id,v_base_morph.word_sum,v_base_morph.morphology_parts,
    v_base_morph.morphology_joins,v_base_morph.morphology_transformations,
    p_base_meaning,p_source_reference);
  if v_word.id<>v_base.id then
    insert into public.canonical_teaching_dictionary_lexical_base_family_members
      (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
        canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
        morphology_transformations,intended_meaning,source_reference)
    values (v_key,1,v_word.id,p_word_part_of_speech,p_relationship_kind,
      v_word_morph.id,v_word_morph.word_sum,v_word_morph.morphology_parts,
      v_word_morph.morphology_joins,v_word_morph.morphology_transformations,
      p_word_meaning,p_source_reference);
  end if;
  perform public.approve_canonical_lexical_base_family(
    v_key,1,p_reviewer,p_approval_reference);
  return v_key;
end $$;

revoke all on function public.create_reviewed_lexical_free_base_family(
  uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.create_reviewed_lexical_free_base_family(
  uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text) to service_role;

notify pgrst,'reload schema';
commit;
