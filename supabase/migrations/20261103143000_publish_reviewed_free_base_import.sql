begin;

-- Publish an unrouted reviewed CSV word with its approved free-base family.
-- Existing exact families gain one immutable revision; new families require
-- an explicitly reviewed base part of speech in the CSV.
create or replace function public.publish_teaching_dictionary_reviewed_free_base_draft(
  p_draft uuid,p_actor uuid,p_environment text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.teaching_dictionary_manager_drafts%rowtype;
  family_review jsonb;
  v_base_text text;
  v_base_meaning text;
  v_family public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  v_base_word public.canonical_teaching_dictionary_words%rowtype;
  v_base_morphology uuid;
  v_morphology uuid;
  v_word uuid;
begin
  if p_actor is null or p_environment not in ('staging','production') then
    raise exception 'TEACHING_FREE_BASE_IMPORT_REVIEW_REQUIRED';
  end if;
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  family_review:=coalesce(d.payload->'freeBaseFamilyReview','{}'::jsonb);
  if d.id is null or d.canonical_word_id is null
    or d.source_reference !~ '^CSV batch [a-f0-9-]{36},'
    or d.payload ? 'rootFamilyReview'
    or jsonb_array_length(coalesce(d.payload->'routeContents','[]'::jsonb))<>0
    or exists(select 1 from public.teaching_dictionary_manager_publications p where p.draft_id=d.id)
    or (select count(*) from jsonb_array_elements(d.payload#>'{canonicalMorphology,parts}') part
      where part->>'kind'='base')<>1 then
    raise exception 'TEACHING_FREE_BASE_IMPORT_DRAFT_INVALID';
  end if;
  select part->>'sourceText',part->>'gloss' into v_base_text,v_base_meaning
    from jsonb_array_elements(d.payload#>'{canonicalMorphology,parts}') part
    where part->>'kind'='base';
  if nullif(btrim(v_base_text),'') is null or nullif(btrim(v_base_meaning),'') is null
    or nullif(btrim(d.payload#>>'{canonicalMorphology,rawPartOfSpeech}'),'') is null then
    raise exception 'TEACHING_FREE_BASE_IMPORT_PART_INVALID';
  end if;
  select f.* into v_family from public.canonical_teaching_dictionary_lexical_base_families f
    where f.base_kind='free_base' and f.base_lemma=lower(v_base_text)
      and f.base_meaning=v_base_meaning and f.review_status='approved'
      and (coalesce(family_review->>'familyKey','')='' or f.family_key=family_review->>'familyKey')
      and not exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families newer
        where newer.family_key=f.family_key and newer.revision>f.revision)
    order by f.family_key limit 1 for update;
  if v_family.family_key is not null then
    if nullif(btrim(family_review->>'basePartOfSpeech'),'') is not null
      and family_review->>'basePartOfSpeech' is distinct from v_family.base_part_of_speech then
      raise exception 'TEACHING_FREE_BASE_IMPORT_FAMILY_POS_CONFLICT';
    end if;
    if (select count(*) from public.canonical_teaching_dictionary_lexical_base_families f
      where f.base_kind='free_base' and f.base_lemma=lower(v_base_text)
        and f.base_meaning=v_base_meaning and f.review_status='approved'
        and (coalesce(family_review->>'familyKey','')='' or f.family_key=family_review->>'familyKey')
        and not exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families newer
          where newer.family_key=f.family_key and newer.revision>f.revision))<>1 then
      raise exception 'TEACHING_FREE_BASE_IMPORT_FAMILY_AMBIGUOUS';
    end if;
  else
    if coalesce(family_review->>'familyKey','')<>''
      or nullif(btrim(family_review->>'basePartOfSpeech'),'') is null
      or family_review->>'basePartOfSpeech' not in
        ('noun','verb','adjective','adverb','pronoun','determiner','preposition',
         'conjunction','interjection','number','contraction','verb past tense','verb past participle')
      or exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families f
        where f.base_lemma=lower(v_base_text)) then
      raise exception 'TEACHING_FREE_BASE_IMPORT_FAMILY_REVIEW_REQUIRED';
    end if;
    select * into v_base_word from public.canonical_teaching_dictionary_words
      where normalised_word=lower(v_base_text) and dialect_code='en-GB'
        and row_status='active' and review_status='approved_for_first_exposure' for update;
    select id into v_base_morphology from public.canonical_teaching_dictionary_word_morphology
      where canonical_word_id=v_base_word.id and row_status='active'
        and review_status='approved_for_first_exposure' and analysis_status='approved'
      order by created_at desc,id desc limit 1;
    if v_base_word.id is null or v_base_morphology is null then
      raise exception 'TEACHING_FREE_BASE_IMPORT_ANCHOR_NOT_READY';
    end if;
  end if;
  -- The pair-only reconciler checks the independent Overview and skill
  -- receipts and publishes both authorities in this same transaction.
  v_word:=public.publish_teaching_dictionary_reviewed_reconciled_draft(
    d.id,p_actor,p_environment);
  select id into v_morphology from public.canonical_teaching_dictionary_word_morphology
    where canonical_word_id=v_word and row_status='active'
      and analysis_status='approved' and review_status='approved_for_first_exposure'
    order by created_at desc,id desc limit 1;
  if v_morphology is null or not exists(select 1 from public.canonical_teaching_dictionary_word_morphology m
    where m.id=v_morphology and m.morphology_parts=d.payload#>'{canonicalMorphology,parts}'
      and m.morphology_joins=d.payload#>'{canonicalMorphology,joins}'
      and m.word_sum=d.payload#>>'{canonicalMorphology,wordSum}') then
    raise exception 'TEACHING_FREE_BASE_IMPORT_MORPHOLOGY_MISMATCH';
  end if;
  if v_family.family_key is not null then
    perform public.review_lexical_base_family_member_revision(
      v_family.family_key,v_family.revision,v_word,v_morphology,
      d.payload#>>'{canonicalMorphology,rawPartOfSpeech}','derived',
      d.payload->>'definition',d.source_reference,p_actor::text,
      'Reviewed Teaching Dictionary CSV: '||d.source_reference);
  else
    perform public.create_reviewed_lexical_free_base_family(
      v_base_word.id,v_word,v_base_morphology,v_morphology,
      family_review->>'basePartOfSpeech',d.payload#>>'{canonicalMorphology,rawPartOfSpeech}',
      'derived',v_base_meaning,d.payload->>'definition',d.source_reference,
      p_actor::text,'Reviewed Teaching Dictionary CSV: '||d.source_reference);
  end if;
  return v_word;
end $$;

revoke all on function public.publish_teaching_dictionary_reviewed_free_base_draft(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_reviewed_free_base_draft(uuid,uuid,text)
  to service_role;
notify pgrst,'reload schema';
commit;
