begin;

create table public.teaching_dictionary_part_of_speech_reviews (
  request_id uuid primary key,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  previous_morphology_id uuid not null references public.canonical_teaching_dictionary_word_morphology(id),
  approved_morphology_id uuid not null unique references public.canonical_teaching_dictionary_word_morphology(id),
  previous_part_of_speech text,
  approved_part_of_speech text not null,
  reviewed_by uuid not null,
  review_note text not null,
  reviewed_at timestamptz not null default now()
);
create index teaching_dictionary_pos_reviews_word on public.teaching_dictionary_part_of_speech_reviews
  (canonical_word_id,reviewed_at desc);
revoke all on public.teaching_dictionary_part_of_speech_reviews from public,anon,authenticated;
grant select on public.teaching_dictionary_part_of_speech_reviews to service_role;

-- A part-of-speech correction versions only the canonical morphology. Existing
-- lesson releases and child history stay intact; their dictionary fingerprints
-- cease to match and require a fresh editorial review before new publication.
create function public.approve_teaching_dictionary_part_of_speech(
  p_request_id uuid,
  p_word_id uuid,
  p_expected_morphology_id uuid,
  p_part_of_speech text,
  p_actor uuid,
  p_review_note text
) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_word public.canonical_teaching_dictionary_words%rowtype;
  v_old public.canonical_teaching_dictionary_word_morphology%rowtype;
  v_new_id uuid := gen_random_uuid();
  v_batch_id uuid := gen_random_uuid();
  v_pos text := lower(btrim(p_part_of_speech));
  v_hash text;
  v_family public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  v_member public.canonical_teaching_dictionary_lexical_base_family_members%rowtype;
  v_existing uuid;
begin
  if p_request_id is null or p_word_id is null or p_expected_morphology_id is null or p_actor is null
    or nullif(btrim(p_review_note),'') is null or length(p_review_note)>1000
    or v_pos is null or v_pos not in
      ('noun','verb','adjective','adverb','pronoun','determiner','preposition',
       'conjunction','interjection','number','contraction','verb past tense','verb past participle') then
    raise exception 'TEACHING_POS_REVIEW_INVALID';
  end if;
  select approved_morphology_id into v_existing
  from public.teaching_dictionary_part_of_speech_reviews where request_id=p_request_id;
  if found then return v_existing; end if;
  perform pg_advisory_xact_lock(hashtextextended('teaching-pos:'||p_word_id::text,0));
  select * into v_word from public.canonical_teaching_dictionary_words
    where id=p_word_id and row_status='active' and dialect_code='en-GB'
      and review_status='approved_for_first_exposure' for update;
  select * into v_old from public.canonical_teaching_dictionary_word_morphology
    where canonical_word_id=p_word_id and row_status='active' for update;
  if v_word.id is null or v_old.id is null or v_old.id<>p_expected_morphology_id
    or v_old.analysis_status<>'approved' or v_old.review_status<>'approved_for_first_exposure' then
    raise exception 'TEACHING_POS_SOURCE_CHANGED';
  end if;
  if lower(coalesce(v_old.raw_morpholex_pos,''))=v_pos then
    raise exception 'TEACHING_POS_ALREADY_APPROVED';
  end if;
  -- An older family member must not silently inherit a different approved
  -- analysis. Only the corrected word's unchanged parts may be rebound.
  for v_family in
    select f.* from public.canonical_teaching_dictionary_lexical_base_families f
    where f.revision=(select max(revision) from public.canonical_teaching_dictionary_lexical_base_families
      where family_key=f.family_key)
      and exists (select 1 from public.canonical_teaching_dictionary_lexical_base_family_members m
        where m.family_key=f.family_key and m.revision=f.revision and m.canonical_word_id=p_word_id)
    order by f.family_key
  loop
    perform pg_advisory_xact_lock(hashtextextended('lexical-family:'||v_family.family_key,0));
    if v_family.review_status<>'approved' then raise exception 'TEACHING_POS_FAMILY_REVIEW_REQUIRED'; end if;
    select * into v_member from public.canonical_teaching_dictionary_lexical_base_family_members
      where family_key=v_family.family_key and revision=v_family.revision and canonical_word_id=p_word_id limit 1;
    if v_member.word_part_of_speech not in ('unresolved',v_pos)
      or (v_member.relationship_kind='free_base' and v_family.base_part_of_speech<>v_pos)
      or v_member.canonical_morphology_id<>v_old.id
      or v_member.morphology_parts<>v_old.morphology_parts
      or v_member.morphology_joins<>v_old.morphology_joins
      or v_member.morphology_transformations<>v_old.morphology_transformations
      or v_member.word_sum<>v_old.word_sum
      or exists (select 1 from public.canonical_teaching_dictionary_lexical_base_family_members m
        join public.canonical_teaching_dictionary_word_morphology source on source.id=m.canonical_morphology_id
        where m.family_key=v_family.family_key and m.revision=v_family.revision
          and m.canonical_word_id<>p_word_id and source.row_status<>'active') then
      raise exception 'TEACHING_POS_FAMILY_REVIEW_REQUIRED';
    end if;
  end loop;

  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'wordId',p_word_id,'previousMorphologyId',v_old.id,'partOfSpeech',v_pos,
    'requestId',p_request_id)::text,'UTF8'),'sha256'),'hex');
  insert into public.canonical_teaching_dictionary_import_batches
    (id,source_folder_path,source_folder_sha256,validator_version,validation_summary,
     row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at)
  values (v_batch_id,'teaching-dictionary/part-of-speech-review/'||p_request_id::text,v_hash,
    'teaching_dictionary_pos_review_v1',jsonb_build_object('errors',0),
    jsonb_build_object('morphology',1),jsonb_build_object('priorMorphologyId',v_old.id),
    'admin_import','applied',jsonb_build_object('reviewNote',p_review_note,'actor',p_actor),p_actor::text,now());
  update public.canonical_teaching_dictionary_word_morphology set row_status='retired'
    where id=v_old.id and row_status='active';
  insert into public.canonical_teaching_dictionary_word_morphology
    (id,import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,
     source_metadata,raw_morpholex_segmentation,raw_morpholex_pos,morphology_parts,feature_keys,
     morphology_joins,morphology_transformations,transformation_notes,word_sum,analysis_status,
     source_category,source_name,source_url,source_licence,source_use_note,confidence,
     review_status,reviewed_by,reviewed_at,review_notes)
  values (v_new_id,v_batch_id,p_word_id,'active','teaching_dictionary_pos_review',1,v_hash,
    v_old.source_metadata||jsonb_build_object('supersedesMorphologyId',v_old.id,'posReviewRequestId',p_request_id),
    v_old.raw_morpholex_segmentation,v_pos,v_old.morphology_parts,v_old.feature_keys,
    v_old.morphology_joins,v_old.morphology_transformations,v_old.transformation_notes,v_old.word_sum,
    v_old.analysis_status,v_old.source_category,v_old.source_name,v_old.source_url,v_old.source_licence,
    v_old.source_use_note,v_old.confidence,v_old.review_status,p_actor::text,now(),p_review_note);

  for v_family in
    select f.* from public.canonical_teaching_dictionary_lexical_base_families f
    where f.revision=(select max(revision) from public.canonical_teaching_dictionary_lexical_base_families
      where family_key=f.family_key)
      and exists (select 1 from public.canonical_teaching_dictionary_lexical_base_family_members m
        where m.family_key=f.family_key and m.revision=f.revision and m.canonical_word_id=p_word_id)
    order by f.family_key
  loop
    insert into public.canonical_teaching_dictionary_lexical_base_families
      (family_key,revision,base_lemma,base_part_of_speech,base_kind,canonical_base_word_id,
       base_meaning,source_reference,review_status)
    values (v_family.family_key,v_family.revision+1,v_family.base_lemma,v_family.base_part_of_speech,
      v_family.base_kind,v_family.canonical_base_word_id,v_family.base_meaning,
      'Teaching Dictionary part-of-speech review '||p_request_id::text,'draft');
    insert into public.canonical_teaching_dictionary_lexical_base_family_members
      (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
       canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
       morphology_transformations,intended_meaning,source_reference)
    select family_key,v_family.revision+1,canonical_word_id,
      case when canonical_word_id=p_word_id then v_pos else word_part_of_speech end,
      relationship_kind,case when canonical_word_id=p_word_id then v_new_id else canonical_morphology_id end,
      word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning,source_reference
    from public.canonical_teaching_dictionary_lexical_base_family_members
    where family_key=v_family.family_key and revision=v_family.revision;
    insert into public.canonical_teaching_dictionary_lexical_base_variants
      (family_key,revision,canonical_word_id,source_base_text,relation_kind,
       source_reference,approval_reference,reviewed_by,reviewed_at)
    select family_key,v_family.revision+1,canonical_word_id,source_base_text,relation_kind,
      source_reference,approval_reference,reviewed_by,reviewed_at
    from public.canonical_teaching_dictionary_lexical_base_variants
    where family_key=v_family.family_key and revision=v_family.revision;
    perform public.approve_canonical_lexical_base_family(
      v_family.family_key,v_family.revision+1,p_actor::text,p_review_note);
  end loop;
  insert into public.teaching_dictionary_part_of_speech_reviews
    (request_id,canonical_word_id,previous_morphology_id,approved_morphology_id,
     previous_part_of_speech,approved_part_of_speech,reviewed_by,review_note)
  values (p_request_id,p_word_id,v_old.id,v_new_id,v_old.raw_morpholex_pos,v_pos,p_actor,p_review_note);
  return v_new_id;
end $$;

revoke all on function public.approve_teaching_dictionary_part_of_speech(
  uuid,uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.approve_teaching_dictionary_part_of_speech(
  uuid,uuid,uuid,text,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
