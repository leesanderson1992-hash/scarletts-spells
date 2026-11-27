begin;
set local lock_timeout='5s';
create or replace function public.attach_reviewed_root_family_entry(
 p_family text,p_expected_revision integer,p_word uuid,p_sense text,p_origin text,p_actor uuid,p_source text
) returns integer language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare f public.canonical_teaching_dictionary_lexical_base_families%rowtype;
 w public.canonical_teaching_dictionary_words%rowtype; meaning jsonb; analysis record; next_revision integer; fp text;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor)
   or nullif(btrim(p_origin),'') is null or nullif(btrim(p_source),'') is null then raise exception 'ROOT_ANCHOR_REVIEW_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('lexical-family:'||p_family,0));
 select * into f from public.canonical_teaching_dictionary_lexical_base_families where family_key=p_family order by revision desc limit 1;
 if f.family_key is null or f.base_kind<>'bound_root' or f.review_status<>'approved' then raise exception 'ROOT_ANCHOR_FAMILY_INVALID'; end if;
 if f.canonical_base_word_id=p_word and (f.canonical_base_sense_id=p_sense or exists(select 1 from teaching_dictionary_legacy_family_sense_anchors where family_key=p_family and canonical_word_id=p_word and sense_id=p_sense)) then return f.revision; end if;
 if f.revision<>p_expected_revision or f.canonical_base_word_id is not null then raise exception 'ROOT_ANCHOR_FAMILY_CHANGED'; end if;
 select * into w from public.canonical_teaching_dictionary_words where id=p_word and row_status='active'
  and review_status='approved_for_first_exposure' and dialect_code='en-GB' and normalised_word=lower(f.base_lemma);
 select value into meaning from public.teaching_dictionary_reviewed_sense_sets s,jsonb_array_elements(s.sense_set->'senses') value
  where s.canonical_word_id=p_word and value->>'id'=p_sense and value->>'partOfSpeech'='root';
 select * into analysis from public.teaching_dictionary_current_sense_morphology where canonical_word_id=p_word and sense_id=p_sense;
 if w.id is null or meaning is null or meaning->>'definition' is distinct from f.base_meaning or analysis.id is null
   or jsonb_array_length(analysis.morphology_parts)<>1 or analysis.morphology_parts#>>'{0,kind}'<>'root'
   or analysis.morphology_parts#>>'{0,sourceText}' is distinct from f.base_lemma
   or analysis.morphology_parts#>>'{0,surfaceText}' is distinct from w.display_word
 then raise exception 'ROOT_ANCHOR_APPROVED_ENTRY_REQUIRED'; end if;
 next_revision:=f.revision+1;
 insert into public.canonical_teaching_dictionary_lexical_base_families
 select (jsonb_populate_record(null::public.canonical_teaching_dictionary_lexical_base_families,
  to_jsonb(f)||jsonb_build_object('revision',next_revision,'canonical_base_word_id',p_word,'canonical_base_sense_id',null,
   'review_status','draft','reviewed_by',null,'reviewed_at',null,'approval_reference',null,'semantic_fingerprint',null,
   'source_reference',p_source,'created_at',now()))).*;
 insert into public.canonical_teaching_dictionary_lexical_base_family_members
 select (jsonb_populate_record(null::public.canonical_teaching_dictionary_lexical_base_family_members,
   to_jsonb(m)||jsonb_build_object('revision',next_revision))).*
 from public.canonical_teaching_dictionary_lexical_base_family_members m where family_key=p_family and revision=f.revision;
 insert into public.canonical_teaching_dictionary_lexical_base_variants
 select (jsonb_populate_record(null::public.canonical_teaching_dictionary_lexical_base_variants,
   to_jsonb(v)||jsonb_build_object('revision',next_revision))).*
 from public.canonical_teaching_dictionary_lexical_base_variants v where family_key=p_family and revision=f.revision;
 insert into public.canonical_teaching_dictionary_lexical_root_metadata
  (family_key,revision,root_text,root_meaning,root_definition,origin_language,pronunciation_applicability,
   pronunciation_ipa,source_reference,approval_reference,reviewed_by,reviewed_at)
 values(p_family,next_revision,f.base_lemma,f.base_meaning,meaning->>'definition',p_origin,'not_applicable',null,p_source,p_source,p_actor::text,now());
 insert into public.teaching_dictionary_legacy_family_sense_anchors(family_key,canonical_word_id,sense_id,reviewed_by,source_reference)
 values(p_family,p_word,p_sense,p_actor,p_source);
 fp:=encode(extensions.digest(convert_to(jsonb_build_object('previousFamilyFingerprint',f.semantic_fingerprint,
  'family',p_family,'revision',next_revision,'rootEntry',p_word,'rootSense',p_sense,'meaning',meaning,'origin',p_origin)::text,'UTF8'),'sha256'),'hex');
 update public.canonical_teaching_dictionary_lexical_base_families set review_status='approved',reviewed_by=p_actor::text,
  reviewed_at=now(),approval_reference=p_source,semantic_fingerprint=fp where family_key=p_family and revision=next_revision;
 return next_revision;
end;
$$;
revoke all on function public.attach_reviewed_root_family_entry(text,integer,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.attach_reviewed_root_family_entry(text,integer,uuid,text,text,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
