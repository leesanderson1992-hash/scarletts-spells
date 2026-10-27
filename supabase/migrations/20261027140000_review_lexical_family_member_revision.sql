begin;

-- An approved lexical family is immutable. A human-reviewed addition creates
-- and approves a complete new revision, preserving the previous evidence.
create function public.review_lexical_base_family_member_revision(
  p_family_key text,
  p_expected_revision integer,
  p_word_id uuid,
  p_morphology_id uuid,
  p_word_part_of_speech text,
  p_relationship_kind text,
  p_intended_meaning text,
  p_source_reference text,
  p_reviewer text,
  p_approval_reference text
) returns integer
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_family public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  v_word public.canonical_teaching_dictionary_words%rowtype;
  v_morph public.canonical_teaching_dictionary_word_morphology%rowtype;
  v_revision integer;
begin
  if nullif(btrim(p_word_part_of_speech),'') is null
    or p_relationship_kind not in ('regular_inflection','irregular_inflection','derived','contraction','historical_relative')
    or nullif(btrim(p_intended_meaning),'') is null
    or nullif(btrim(p_source_reference),'') is null
    or nullif(btrim(p_reviewer),'') is null
    or nullif(btrim(p_approval_reference),'') is null then
    raise exception 'LEXICAL_FAMILY_REVIEW_INCOMPLETE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lexical-family:'||p_family_key,0));
  select * into v_family from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=p_family_key order by revision desc limit 1;
  if v_family.family_key is null or v_family.revision is distinct from p_expected_revision
    or v_family.review_status<>'approved' then
    raise exception 'LEXICAL_FAMILY_REVISION_CHANGED';
  end if;
  if v_family.base_kind<>'free_base' then
    raise exception 'LEXICAL_FAMILY_FREE_BASE_REQUIRED';
  end if;
  if exists (select 1 from public.canonical_teaching_dictionary_lexical_base_family_members
      where family_key=p_family_key and revision=v_family.revision and canonical_word_id=p_word_id) then
    raise exception 'LEXICAL_FAMILY_MEMBER_ALREADY_PRESENT';
  end if;
  select * into v_word from public.canonical_teaching_dictionary_words where id=p_word_id
    and dialect_code='en-GB' and row_status='active'
    and review_status='approved_for_first_exposure';
  select * into v_morph from public.canonical_teaching_dictionary_word_morphology
    where id=p_morphology_id and canonical_word_id=p_word_id and row_status='active'
    and analysis_status='approved' and review_status='approved_for_first_exposure';
  if v_word.id is null or v_morph.id is null
    or nullif(btrim(v_morph.word_sum),'') is null
    or not exists (select 1 from jsonb_array_elements(v_morph.morphology_parts) part
      where part->>'kind'='base' and lower(part->>'sourceText')=v_family.base_lemma)
    or (select string_agg(part.value->>'surfaceText','' order by part.ordinality)
      from jsonb_array_elements(v_morph.morphology_parts) with ordinality part(value,ordinality))
      is distinct from v_word.display_word then
    raise exception 'LEXICAL_FAMILY_APPROVED_MORPHOLOGY_REQUIRED';
  end if;
  v_revision:=v_family.revision+1;
  insert into public.canonical_teaching_dictionary_lexical_base_families
    (family_key,revision,base_lemma,base_part_of_speech,base_kind,canonical_base_word_id,
     base_meaning,source_reference,review_status)
  values (v_family.family_key,v_revision,v_family.base_lemma,v_family.base_part_of_speech,
    v_family.base_kind,v_family.canonical_base_word_id,v_family.base_meaning,p_source_reference,'draft');
  insert into public.canonical_teaching_dictionary_lexical_base_family_members
    (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
     canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
     morphology_transformations,intended_meaning,source_reference)
  select family_key,v_revision,canonical_word_id,word_part_of_speech,relationship_kind,
    canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
    morphology_transformations,intended_meaning,source_reference
  from public.canonical_teaching_dictionary_lexical_base_family_members
  where family_key=p_family_key and revision=v_family.revision;
  insert into public.canonical_teaching_dictionary_lexical_base_variants
    (family_key,revision,canonical_word_id,source_base_text,relation_kind,
     source_reference,approval_reference,reviewed_by,reviewed_at)
  select family_key,v_revision,canonical_word_id,source_base_text,relation_kind,
    source_reference,approval_reference,reviewed_by,reviewed_at
  from public.canonical_teaching_dictionary_lexical_base_variants
  where family_key=p_family_key and revision=v_family.revision;
  insert into public.canonical_teaching_dictionary_lexical_base_family_members
    (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
     canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
     morphology_transformations,intended_meaning,source_reference)
  values (p_family_key,v_revision,p_word_id,p_word_part_of_speech,p_relationship_kind,
    p_morphology_id,v_morph.word_sum,v_morph.morphology_parts,v_morph.morphology_joins,
    v_morph.morphology_transformations,p_intended_meaning,p_source_reference);
  perform public.approve_canonical_lexical_base_family(
    p_family_key,v_revision,p_reviewer,p_approval_reference);
  return v_revision;
end $$;

revoke all on function public.review_lexical_base_family_member_revision(
  text,integer,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.review_lexical_base_family_member_revision(
  text,integer,uuid,uuid,text,text,text,text,text,text) to service_role;

notify pgrst,'reload schema';
commit;
