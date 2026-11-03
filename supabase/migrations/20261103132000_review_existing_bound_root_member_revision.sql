begin;

-- Replace one existing member and its root entry in a new immutable revision.
-- The word's reviewed Overview must already have published the new morphology.
create or replace function public.review_existing_bound_root_member_revision(
  p_family_key text,p_expected_revision integer,p_word_id uuid,p_morphology_id uuid,
  p_root_meaning text,p_root_definition text,p_origin_language text,
  p_pronunciation_applicability text,p_pronunciation_ipa text,
  p_source_reference text,p_reviewer text,p_approval_reference text
) returns integer language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  f public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  w public.canonical_teaching_dictionary_words%rowtype;
  m public.canonical_teaching_dictionary_word_morphology%rowtype;
  old_member public.canonical_teaching_dictionary_lexical_base_family_members%rowtype;
  v_revision integer;
  v_definition text;
begin
  if p_word_id is null or p_morphology_id is null
    or nullif(btrim(p_root_meaning),'') is null
    or nullif(btrim(p_root_definition),'') is null
    or nullif(btrim(p_origin_language),'') is null
    or nullif(btrim(p_source_reference),'') is null
    or nullif(btrim(p_reviewer),'') is null
    or nullif(btrim(p_approval_reference),'') is null
    or (p_pronunciation_applicability='not_applicable' and p_pronunciation_ipa is not null)
    or (p_pronunciation_applicability='reviewed' and nullif(btrim(p_pronunciation_ipa),'') is null)
    or p_pronunciation_applicability not in ('reviewed','not_applicable') then
    raise exception 'LEXICAL_ROOT_REPLACEMENT_INCOMPLETE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lexical-family:'||p_family_key,0));
  select * into f from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=p_family_key order by revision desc limit 1 for update;
  if f.family_key is null or f.revision is distinct from p_expected_revision
    or f.review_status<>'approved' or f.base_kind<>'bound_root' then
    raise exception 'LEXICAL_ROOT_REVISION_CHANGED';
  end if;
  select * into old_member from public.canonical_teaching_dictionary_lexical_base_family_members
    where family_key=p_family_key and revision=f.revision and canonical_word_id=p_word_id;
  if old_member.canonical_word_id is null or
    (select count(*) from public.canonical_teaching_dictionary_lexical_base_family_members
      where family_key=p_family_key and revision=f.revision and canonical_word_id=p_word_id)<>1 then
    raise exception 'LEXICAL_ROOT_MEMBER_NOT_UNIQUE';
  end if;
  if exists(select 1 from public.canonical_teaching_dictionary_lexical_base_family_members other
    where other.family_key=p_family_key and other.revision=f.revision
      and other.canonical_word_id<>p_word_id
      and not exists(select 1 from jsonb_array_elements(other.morphology_parts) part
        where part->>'kind'='root' and lower(part->>'sourceText')=lower(f.base_lemma)
          and part->>'gloss'=p_root_meaning)) then
    raise exception 'LEXICAL_ROOT_OTHER_MEMBERS_NEED_REVIEW';
  end if;
  select * into w from public.canonical_teaching_dictionary_words
    where id=p_word_id and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure';
  select * into m from public.canonical_teaching_dictionary_word_morphology
    where id=p_morphology_id and canonical_word_id=p_word_id and row_status='active'
      and analysis_status='approved' and review_status='approved_for_first_exposure';
  if w.id is null or m.id is null or nullif(btrim(m.word_sum),'') is null
    or not exists(select 1 from jsonb_array_elements(m.morphology_parts) part
      where part->>'kind'='root' and lower(part->>'sourceText')=lower(f.base_lemma)
        and part->>'gloss'=p_root_meaning)
    or (select string_agg(part.value->>'surfaceText','' order by part.ordinality)
      from jsonb_array_elements(m.morphology_parts) with ordinality part(value,ordinality))
      is distinct from w.display_word then
    raise exception 'LEXICAL_ROOT_APPROVED_MORPHOLOGY_REQUIRED';
  end if;
  select definition into v_definition from public.teaching_dictionary_definition_versions
    where canonical_word_id=p_word_id and route_id is null
    order by published_at desc,id desc limit 1;
  if nullif(btrim(v_definition),'') is null then
    raise exception 'LEXICAL_ROOT_WORD_DEFINITION_REQUIRED';
  end if;
  v_revision:=f.revision+1;
  insert into public.canonical_teaching_dictionary_lexical_base_families
    (family_key,revision,base_lemma,base_part_of_speech,base_kind,
     canonical_base_word_id,base_meaning,source_reference,review_status)
  values(f.family_key,v_revision,f.base_lemma,f.base_part_of_speech,f.base_kind,
    f.canonical_base_word_id,p_root_meaning,p_source_reference,'draft');
  insert into public.canonical_teaching_dictionary_lexical_base_family_members
    (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
     canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
     morphology_transformations,intended_meaning,source_reference)
  select family_key,v_revision,canonical_word_id,word_part_of_speech,relationship_kind,
    canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
    morphology_transformations,intended_meaning,source_reference
  from public.canonical_teaching_dictionary_lexical_base_family_members
  where family_key=p_family_key and revision=f.revision and canonical_word_id<>p_word_id;
  insert into public.canonical_teaching_dictionary_lexical_base_variants
    (family_key,revision,canonical_word_id,source_base_text,relation_kind,
     source_reference,approval_reference,reviewed_by,reviewed_at)
  select family_key,v_revision,canonical_word_id,source_base_text,relation_kind,
    source_reference,approval_reference,reviewed_by,reviewed_at
  from public.canonical_teaching_dictionary_lexical_base_variants
  where family_key=p_family_key and revision=f.revision;
  insert into public.canonical_teaching_dictionary_lexical_base_family_members
    (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
     canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
     morphology_transformations,intended_meaning,source_reference)
  values(p_family_key,v_revision,p_word_id,old_member.word_part_of_speech,
    old_member.relationship_kind,p_morphology_id,m.word_sum,m.morphology_parts,
    m.morphology_joins,m.morphology_transformations,v_definition,p_source_reference);
  insert into public.canonical_teaching_dictionary_lexical_root_metadata
    (family_key,revision,root_text,root_meaning,root_definition,origin_language,
     pronunciation_ipa,pronunciation_applicability,source_reference,
     approval_reference,reviewed_by,reviewed_at)
  values(p_family_key,v_revision,f.base_lemma,p_root_meaning,p_root_definition,
    p_origin_language,p_pronunciation_ipa,p_pronunciation_applicability,
    p_source_reference,p_approval_reference,p_reviewer,now());
  perform public.approve_canonical_lexical_base_family(
    p_family_key,v_revision,p_reviewer,p_approval_reference);
  return v_revision;
end $$;

revoke all on function public.review_existing_bound_root_member_revision(
  text,integer,uuid,uuid,text,text,text,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.review_existing_bound_root_member_revision(
  text,integer,uuid,uuid,text,text,text,text,text,text,text,text)
  to service_role;
notify pgrst,'reload schema';
commit;
