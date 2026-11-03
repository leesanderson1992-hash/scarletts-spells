begin;

-- A reviewed Overview may add or replace a derived word in an existing
-- free-base family. The family meaning can follow the reviewed CSV even when
-- historical members retain earlier morphology evidence for later review.
create or replace function public.review_existing_free_base_member_revision(
  p_family_key text,p_expected_revision integer,p_word_id uuid,p_morphology_id uuid,
  p_base_meaning text,p_word_part_of_speech text,p_relationship_kind text,
  p_source_reference text,p_reviewer text,p_approval_reference text)
returns integer language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  f public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  w public.canonical_teaching_dictionary_words%rowtype;
  m public.canonical_teaching_dictionary_word_morphology%rowtype;
  old_member public.canonical_teaching_dictionary_lexical_base_family_members%rowtype;
  v_definition text;
  v_revision integer;
begin
  if p_word_id is null or p_morphology_id is null
    or nullif(btrim(p_base_meaning),'') is null
    or nullif(btrim(p_word_part_of_speech),'') is null
    or p_relationship_kind not in
      ('regular_inflection','irregular_inflection','derived','contraction','historical_relative')
    or nullif(btrim(p_source_reference),'') is null
    or nullif(btrim(p_reviewer),'') is null
    or nullif(btrim(p_approval_reference),'') is null then
    raise exception 'LEXICAL_FREE_BASE_REVIEW_INCOMPLETE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lexical-family:'||p_family_key,0));
  select * into f from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=p_family_key order by revision desc limit 1 for update;
  if f.family_key is null or f.revision is distinct from p_expected_revision
    or f.review_status<>'approved' or f.base_kind<>'free_base'
    or f.canonical_base_word_id=p_word_id then
    raise exception 'LEXICAL_FREE_BASE_REVISION_CHANGED';
  end if;
  select * into w from public.canonical_teaching_dictionary_words
    where id=p_word_id and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure';
  select * into m from public.canonical_teaching_dictionary_word_morphology
    where id=p_morphology_id and canonical_word_id=p_word_id and row_status='active'
      and analysis_status='approved' and review_status='approved_for_first_exposure';
  if w.id is null or m.id is null or nullif(btrim(m.word_sum),'') is null
    or not exists(select 1 from jsonb_array_elements(m.morphology_parts) part
      where part->>'kind'='base' and lower(part->>'sourceText')=f.base_lemma
        and part->>'gloss'=p_base_meaning)
    or (select string_agg(part.value->>'surfaceText','' order by part.ordinality)
      from jsonb_array_elements(m.morphology_parts) with ordinality part(value,ordinality))
      is distinct from w.display_word then
    raise exception 'LEXICAL_FREE_BASE_MORPHOLOGY_REQUIRED';
  end if;
  select * into old_member from public.canonical_teaching_dictionary_lexical_base_family_members
    where family_key=f.family_key and revision=f.revision and canonical_word_id=p_word_id;
  if old_member.canonical_word_id is not null and
    (old_member.word_part_of_speech is distinct from p_word_part_of_speech
      or old_member.relationship_kind is distinct from p_relationship_kind) then
    raise exception 'LEXICAL_FREE_BASE_MEMBER_IDENTITY_CHANGED';
  end if;
  select definition into v_definition from public.teaching_dictionary_definition_versions
    where canonical_word_id=p_word_id and route_id is null
    order by published_at desc,id desc limit 1;
  if nullif(btrim(v_definition),'') is null then
    raise exception 'LEXICAL_FREE_BASE_DEFINITION_REQUIRED';
  end if;
  v_revision:=f.revision+1;
  insert into public.canonical_teaching_dictionary_lexical_base_families
    (family_key,revision,base_lemma,base_part_of_speech,base_kind,
     canonical_base_word_id,base_meaning,source_reference,review_status)
  values(f.family_key,v_revision,f.base_lemma,f.base_part_of_speech,f.base_kind,
    f.canonical_base_word_id,p_base_meaning,p_source_reference,'draft');
  insert into public.canonical_teaching_dictionary_lexical_base_family_members
    (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
     canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
     morphology_transformations,intended_meaning,source_reference)
  select family_key,v_revision,canonical_word_id,word_part_of_speech,relationship_kind,
    canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
    morphology_transformations,
    case when canonical_word_id=f.canonical_base_word_id then p_base_meaning else intended_meaning end,
    source_reference
  from public.canonical_teaching_dictionary_lexical_base_family_members
  where family_key=f.family_key and revision=f.revision and canonical_word_id<>p_word_id;
  insert into public.canonical_teaching_dictionary_lexical_base_variants
    (family_key,revision,canonical_word_id,source_base_text,relation_kind,
     source_reference,approval_reference,reviewed_by,reviewed_at)
  select family_key,v_revision,canonical_word_id,source_base_text,relation_kind,
    source_reference,approval_reference,reviewed_by,reviewed_at
  from public.canonical_teaching_dictionary_lexical_base_variants
  where family_key=f.family_key and revision=f.revision;
  insert into public.canonical_teaching_dictionary_lexical_base_family_members
    (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
     canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
     morphology_transformations,intended_meaning,source_reference)
  values(f.family_key,v_revision,p_word_id,p_word_part_of_speech,p_relationship_kind,
    p_morphology_id,m.word_sum,m.morphology_parts,m.morphology_joins,
    m.morphology_transformations,v_definition,p_source_reference);
  perform public.approve_canonical_lexical_base_family(
    f.family_key,v_revision,p_reviewer,p_approval_reference);
  return v_revision;
end $$;

revoke all on function public.review_existing_free_base_member_revision(
  text,integer,uuid,uuid,text,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.review_existing_free_base_member_revision(
  text,integer,uuid,uuid,text,text,text,text,text,text)
  to service_role;
notify pgrst,'reload schema';
commit;
