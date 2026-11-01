begin;

-- Preserve immutable revisions while allowing reviewed bound-root membership.
create or replace function public.approve_canonical_lexical_base_family(
  p_family_key text,p_revision integer,p_reviewer text,p_approval_reference text)
returns text language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare f public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  n integer; invalid_count integer; projection jsonb; variants jsonb; fingerprint text;
begin
  if nullif(btrim(p_reviewer),'') is null or nullif(btrim(p_approval_reference),'') is null then
    raise exception 'Lexical family approval requires reviewer and reference'; end if;
  select * into f from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=p_family_key and revision=p_revision for update;
  if not found or f.review_status<>'draft' then raise exception 'Only a draft lexical family can be approved'; end if;
  if f.base_kind='free_base' and not exists (select 1 from public.canonical_teaching_dictionary_words w
      where w.id=f.canonical_base_word_id and w.normalised_word=f.base_lemma
        and w.dialect_code='en-GB' and w.row_status='active'
        and w.review_status='approved_for_first_exposure') then
    raise exception 'Free base requires its approved en-GB canonical word'; end if;

  if exists (select 1 from public.canonical_teaching_dictionary_lexical_base_variants v
      where v.family_key=p_family_key and v.revision=p_revision
        and not exists (select 1 from public.canonical_teaching_dictionary_lexical_base_family_members member
          where member.family_key=v.family_key and member.revision=v.revision
            and member.canonical_word_id=v.canonical_word_id
            and exists (select 1 from jsonb_array_elements(member.morphology_parts) part
              where (part->>'kind'='base' or (f.base_kind='bound_root' and part->>'kind'='root'))
                and lower(part->>'sourceText')=lower(v.source_base_text)))) then
    raise exception 'Lexical family variant requires exact member base evidence'; end if;

  select count(*),count(*) filter (where w.id is null or m.id is null
      or m.canonical_word_id<>member.canonical_word_id or m.row_status<>'active'
      or m.review_status<>'approved_for_first_exposure' or m.analysis_status<>'approved'
      or m.word_sum<>member.word_sum or m.morphology_parts<>member.morphology_parts
      or m.morphology_joins<>member.morphology_joins
      or m.morphology_transformations<>member.morphology_transformations
      or not exists (select 1 from jsonb_array_elements(member.morphology_parts) part
        where (part->>'kind'='base' or (f.base_kind='bound_root' and part->>'kind'='root'))
          and (lower(part->>'sourceText')=lower(f.base_lemma)
          or exists (select 1 from public.canonical_teaching_dictionary_lexical_base_variants v
            where v.family_key=member.family_key and v.revision=member.revision
              and v.canonical_word_id=member.canonical_word_id
              and lower(v.source_base_text)=lower(part->>'sourceText'))))
      or regexp_replace(lower(coalesce((select string_agg(part.value->>'surfaceText','' order by part.ordinality)
          from jsonb_array_elements(member.morphology_parts) with ordinality part(value,ordinality)),'')),
          '[[:space:]-]','','g')
          is distinct from regexp_replace(lower(w.display_word),'[[:space:]-]','','g')),
    jsonb_agg(jsonb_build_object('wordId',member.canonical_word_id,'pos',member.word_part_of_speech,
      'kind',member.relationship_kind,'morphologyId',member.canonical_morphology_id,
      'wordSum',member.word_sum,'parts',member.morphology_parts,'joins',member.morphology_joins,
      'transformations',member.morphology_transformations,'meaning',member.intended_meaning)
      order by member.canonical_word_id,member.word_part_of_speech)
    into n,invalid_count,projection
  from public.canonical_teaching_dictionary_lexical_base_family_members member
  left join public.canonical_teaching_dictionary_words w on w.id=member.canonical_word_id
    and w.dialect_code='en-GB' and w.row_status='active' and w.review_status='approved_for_first_exposure'
  left join public.canonical_teaching_dictionary_word_morphology m on m.id=member.canonical_morphology_id
  where member.family_key=p_family_key and member.revision=p_revision;
  if n=0 or invalid_count>0 then raise exception 'Lexical family members require exact approved canonical morphology'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('wordId',v.canonical_word_id,'sourceBase',v.source_base_text,
      'relation',v.relation_kind,'source',v.source_reference,'approval',v.approval_reference)
      order by v.canonical_word_id,v.source_base_text),'[]'::jsonb) into variants
  from public.canonical_teaching_dictionary_lexical_base_variants v
  where v.family_key=p_family_key and v.revision=p_revision;
  fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
    'familyKey',f.family_key,'revision',f.revision,'base',f.base_lemma,'pos',f.base_part_of_speech,
    'kind',f.base_kind,'baseWordId',f.canonical_base_word_id,'baseMeaning',f.base_meaning,
    'members',projection,'variants',variants)::text,'UTF8'),'sha256'),'hex');
  update public.canonical_teaching_dictionary_lexical_base_families
    set review_status='approved',reviewed_by=p_reviewer,reviewed_at=now(),
      approval_reference=p_approval_reference,semantic_fingerprint=fingerprint
    where family_key=p_family_key and revision=p_revision;
  return fingerprint;
end $$;

create or replace function public.review_lexical_base_family_member_revision(
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
  if v_family.base_kind not in ('free_base','bound_root') then
    raise exception 'LEXICAL_FAMILY_KIND_INVALID';
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
      where part->>'kind'=case when v_family.base_kind='bound_root' then 'root' else 'base' end
        and lower(part->>'sourceText')=v_family.base_lemma)
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
  if v_family.base_kind='bound_root' then
    insert into public.canonical_teaching_dictionary_lexical_root_metadata
      (family_key,revision,root_text,root_meaning,root_definition,origin_language,
       pronunciation_ipa,syllables_applicability,written_syllable_applicability,
       frequency_applicability,difficulty_applicability,source_reference,
       approval_reference,reviewed_by,reviewed_at)
    select family_key,v_revision,root_text,root_meaning,root_definition,origin_language,
      pronunciation_ipa,syllables_applicability,written_syllable_applicability,
      frequency_applicability,difficulty_applicability,source_reference,
      p_approval_reference,p_reviewer,now()
    from public.canonical_teaching_dictionary_lexical_root_metadata
    where family_key=p_family_key and revision=v_family.revision;
  end if;
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

notify pgrst,'reload schema';
commit;
