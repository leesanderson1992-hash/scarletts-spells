begin;
-- Dedicated root support review; never creates a free-base family or word–lesson approval.
create or replace function public.create_reviewed_root_family_from_entry(
  p_word uuid,p_sense text,p_origin text,p_pronunciation_applicability text,p_ipa text,p_actor uuid
) returns text language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare w record; s jsonb; m record; k text; existing record; fingerprint text;
begin
  if p_actor is null or nullif(btrim(p_origin),'') is null or length(p_origin)>120
    or p_pronunciation_applicability not in ('reviewed','not_applicable')
    or (p_pronunciation_applicability='reviewed' and nullif(btrim(p_ipa),'') is null)
    or (p_pronunciation_applicability='not_applicable' and nullif(btrim(p_ipa),'') is not null)
    then raise exception 'ROOT_REVIEW_INCOMPLETE'; end if;
  select * into w from canonical_teaching_dictionary_words where id=p_word and row_status='active'
    and dialect_code='en-GB' and review_status='approved_for_first_exposure';
  select value into s from teaching_dictionary_reviewed_sense_sets r,jsonb_array_elements(r.sense_set->'senses') value
    where r.canonical_word_id=p_word and value->>'id'=p_sense and value->>'partOfSpeech'='root';
  select * into m from teaching_dictionary_current_sense_morphology where canonical_word_id=p_word and sense_id=p_sense;
  if w.id is null or s is null or m.id is null or jsonb_array_length(m.morphology_parts)<>1
    or m.morphology_parts#>>'{0,kind}'<>'root' or m.morphology_parts#>>'{0,sourceText}'<>w.normalised_word
    or m.morphology_parts#>>'{0,surfaceText}'<>w.display_word
    then raise exception 'ROOT_REVIEW_APPROVED_ENTRY_REQUIRED'; end if;
  k:=regexp_replace(w.normalised_word,'[^a-z0-9]+','_','g')||'_root_'||regexp_replace(lower(p_sense),'[^a-z0-9]+','_','g')||'_base_family';
  perform pg_advisory_xact_lock(hashtextextended('lexical-family:'||k,0));
  select * into existing from canonical_teaching_dictionary_lexical_base_families where family_key=k order by revision desc limit 1;
  if existing.family_key is not null then
    if existing.canonical_base_word_id is distinct from p_word or existing.canonical_base_sense_id is distinct from p_sense then
      raise exception 'ROOT_REVIEW_IDENTITY_CONFLICT'; end if;
    if existing.review_status='approved' then return k; end if;
    raise exception 'ROOT_REVIEW_EXISTING_REVISION_REQUIRED';
  end if;
  fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('root',w.normalised_word,'meaning',s->>'definition','origin',p_origin)::text,'UTF8'),'sha256'),'hex');
  insert into canonical_teaching_dictionary_lexical_base_families(family_key,revision,base_lemma,base_part_of_speech,base_kind,
    canonical_base_word_id,canonical_base_sense_id,base_meaning,source_reference,review_status,reviewed_by,reviewed_at,approval_reference,semantic_fingerprint)
    values(k,1,w.normalised_word,'root','bound_root',p_word,p_sense,s->>'definition',
      'Teaching Dictionary dedicated root review','draft',p_actor::text,now(),'Teaching Dictionary dedicated root review',fingerprint);
  insert into canonical_teaching_dictionary_lexical_root_metadata(family_key,revision,root_text,root_meaning,root_definition,
    origin_language,pronunciation_applicability,pronunciation_ipa,source_reference,approval_reference,reviewed_by,reviewed_at)
    values(k,1,w.normalised_word,s->>'definition',s->>'definition',p_origin,p_pronunciation_applicability,
      case when p_pronunciation_applicability='not_applicable' then null else p_ipa end,
      'Teaching Dictionary dedicated root review','Teaching Dictionary dedicated root review',p_actor::text,now());
  update canonical_teaching_dictionary_lexical_base_families set review_status='approved' where family_key=k and revision=1;
  return k;
end $$;
revoke all on function public.create_reviewed_root_family_from_entry(uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.create_reviewed_root_family_from_entry(uuid,text,text,text,text,uuid) to service_role;
create function public.create_recommended_root_support_entry(p_form text,p_definition text,p_origin text,p_actor uuid)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare word_id uuid;
begin
  if p_actor is null or p_form<>lower(btrim(p_form)) or length(p_form) not between 1 and 100
    or not exists(select 1 from teaching_dictionary_family_dependencies where base_form=p_form and base_kind='bound_root'
      and expected_meaning=p_definition and status<>'ready') then raise exception 'ROOT_RECOMMENDATION_REQUIRED'; end if;
  word_id:=public.import_reviewed_teaching_dictionary_word(gen_random_uuid(),null,p_form,'',
    jsonb_build_object('pronunciations','[]'::jsonb,'senses',jsonb_build_array(jsonb_build_object('id','root',
      'definition',p_definition,'partOfSpeech','root','pronunciationId',null))),
    jsonb_build_array(jsonb_build_object('senseId','root','parts',jsonb_build_array(jsonb_build_object(
      'id','root','kind','root','sourceText',p_form,'surfaceText',p_form,'gloss',p_definition,
      'displayRange',jsonb_build_object('start',0,'end',length(p_form)))),
      'joins','[]'::jsonb,'transformations','[]'::jsonb,'wordSum',p_form||' → '||p_form,
      'familyKey','','componentPartId','','relationshipKind','','requestedSkillKeys','[]'::jsonb)),
    p_actor,'Admin reviewed recommended bound-root support entry');
  perform public.create_reviewed_root_family_from_entry(word_id,'root',p_origin,'not_applicable',null,p_actor);
  return word_id;
end $$;
revoke all on function public.create_recommended_root_support_entry(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.create_recommended_root_support_entry(text,text,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
