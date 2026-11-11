begin;

-- Historical families keep their keys. New free-base families can name the
-- exact reviewed base sense, so homographic verbs do not collide by POS.
alter table public.canonical_teaching_dictionary_lexical_base_families
  add column canonical_base_sense_id text;
alter table public.canonical_teaching_dictionary_lexical_base_families
  drop constraint canonical_teaching_dictionary_lexical_base_families_check;
alter table public.canonical_teaching_dictionary_lexical_base_families
  add constraint lexical_family_key_matches_reviewed_base_sense check (
    family_key = regexp_replace(lower(base_lemma),'[^a-z0-9]+','_','g') || '_'
      || regexp_replace(lower(base_part_of_speech),'[^a-z0-9]+','_','g')
      || case when canonical_base_sense_id is null then '' else '_'
        || regexp_replace(lower(canonical_base_sense_id),'[^a-z0-9]+','_','g') end
      || '_base_family'
  );
create unique index lexical_family_base_sense_unique
  on public.canonical_teaching_dictionary_lexical_base_families
    (canonical_base_word_id,canonical_base_sense_id,revision)
  where canonical_base_sense_id is not null;

create function public.create_reviewed_free_base_family_from_sense(
  p_request_id uuid,p_base_word_id uuid,p_base_sense_id text,
  p_word_id uuid,p_word_sense_id text,p_component_part_id text,
  p_relationship_kind text,p_reviewer uuid,p_source_reference text
) returns text language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_base public.canonical_teaching_dictionary_words%rowtype;
  v_word public.canonical_teaching_dictionary_words%rowtype;
  v_base_sense jsonb;
  v_word_sense jsonb;
  v_base_analysis public.teaching_dictionary_current_sense_morphology%rowtype;
  v_word_analysis public.teaching_dictionary_current_sense_morphology%rowtype;
  v_base_part jsonb;
  v_word_part jsonb;
  v_key text;
  v_fingerprint text;
begin
  if p_request_id is null or p_base_word_id is null or p_word_id is null
    or p_reviewer is null or nullif(btrim(p_base_sense_id),'') is null
    or nullif(btrim(p_word_sense_id),'') is null
    or nullif(btrim(p_component_part_id),'') is null
    or nullif(btrim(p_source_reference),'') is null
    or p_relationship_kind not in ('free_base','regular_inflection',
      'irregular_inflection','derived','contraction','historical_relative') then
    raise exception 'SENSE_FREE_BASE_CREATE_INCOMPLETE';
  end if;
  select * into v_base from public.canonical_teaching_dictionary_words
    where id=p_base_word_id and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure';
  select * into v_word from public.canonical_teaching_dictionary_words
    where id=p_word_id and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure';
  if v_base.id is null or v_word.id is null then
    raise exception 'SENSE_FREE_BASE_APPROVED_WORD_REQUIRED'; end if;
  select value into v_base_sense from public.teaching_dictionary_reviewed_sense_sets s,
    jsonb_array_elements(s.sense_set->'senses') value
    where s.canonical_word_id=p_base_word_id and value->>'id'=p_base_sense_id;
  select value into v_word_sense from public.teaching_dictionary_reviewed_sense_sets s,
    jsonb_array_elements(s.sense_set->'senses') value
    where s.canonical_word_id=p_word_id and value->>'id'=p_word_sense_id;
  if v_base_sense is null or v_word_sense is null
    or nullif(btrim(v_base_sense->>'definition'),'') is null
    or nullif(btrim(v_base_sense->>'partOfSpeech'),'') is null then
    raise exception 'SENSE_FREE_BASE_REVIEWED_SENSE_REQUIRED'; end if;
  select * into v_base_analysis from public.teaching_dictionary_current_sense_morphology
    where canonical_word_id=p_base_word_id and sense_id=p_base_sense_id;
  select * into v_word_analysis from public.teaching_dictionary_current_sense_morphology
    where canonical_word_id=p_word_id and sense_id=p_word_sense_id;
  select value into v_base_part from jsonb_array_elements(
    coalesce(v_base_analysis.morphology_parts,'[]'::jsonb))
    where value->>'kind'='base' and value->>'sourceText'=v_base.normalised_word
      and value->>'surfaceText'=v_base.display_word
      and value->>'gloss'=v_base_sense->>'definition';
  select value into v_word_part from jsonb_array_elements(
    coalesce(v_word_analysis.morphology_parts,'[]'::jsonb))
    where value->>'id'=p_component_part_id and value->>'kind'='base'
      and value->>'sourceText'=v_base.normalised_word
      and value->>'gloss'=v_base_sense->>'definition';
  if v_base_analysis.id is null or v_word_analysis.id is null
    or v_base_part is null or v_word_part is null
    or (p_base_word_id=p_word_id and
      (p_base_sense_id<>p_word_sense_id or p_relationship_kind<>'free_base'))
    or (p_base_word_id<>p_word_id and p_relationship_kind='free_base') then
    raise exception 'SENSE_FREE_BASE_COMPONENT_INVALID'; end if;
  v_key:=regexp_replace(lower(v_base.normalised_word),'[^a-z0-9]+','_','g') || '_'
    || regexp_replace(lower(v_base_sense->>'partOfSpeech'),'[^a-z0-9]+','_','g') || '_'
    || regexp_replace(lower(p_base_sense_id),'[^a-z0-9]+','_','g') || '_base_family';
  perform pg_advisory_xact_lock(hashtextextended('lexical-family:'||v_key,0));
  if exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=v_key) then raise exception 'SENSE_FREE_BASE_ALREADY_EXISTS'; end if;
  v_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
    'familyKey',v_key,'baseWordId',p_base_word_id,'baseSenseId',p_base_sense_id,
    'baseAnalysisId',v_base_analysis.id,'baseMeaning',v_base_sense->>'definition')::text,
    'UTF8'),'sha256'),'hex');
  insert into public.canonical_teaching_dictionary_lexical_base_families
    (family_key,revision,base_lemma,base_part_of_speech,base_kind,
      canonical_base_word_id,canonical_base_sense_id,base_meaning,
      source_reference,review_status,reviewed_by,reviewed_at,
      approval_reference,semantic_fingerprint)
  values(v_key,1,v_base.normalised_word,v_base_sense->>'partOfSpeech','free_base',
    p_base_word_id,p_base_sense_id,v_base_sense->>'definition',
    p_source_reference,'approved',p_reviewer::text,now(),
    p_source_reference,v_fingerprint);
  perform public.review_teaching_dictionary_sense_family_membership(
    p_request_id,p_base_word_id,p_base_sense_id,v_base_analysis.id,v_key,
    v_base_part->>'id','free_base','approve',p_reviewer,p_source_reference);
  if p_word_id<>p_base_word_id then
    perform public.review_teaching_dictionary_sense_family_membership(
      gen_random_uuid(),p_word_id,p_word_sense_id,v_word_analysis.id,v_key,
      p_component_part_id,p_relationship_kind,'approve',p_reviewer,p_source_reference);
  end if;
  return v_key;
end $$;
revoke all on function public.create_reviewed_free_base_family_from_sense(
  uuid,uuid,text,uuid,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.create_reviewed_free_base_family_from_sense(
  uuid,uuid,text,uuid,text,text,text,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
