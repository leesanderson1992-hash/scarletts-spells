begin;
alter table public.teaching_dictionary_definition_versions add column is_withdrawn boolean not null default false;
alter table public.teaching_dictionary_definition_versions drop constraint if exists teaching_dictionary_definition_versions_definition_check;
alter table public.teaching_dictionary_definition_versions add constraint teaching_dictionary_definition_versions_definition_check
  check ((is_withdrawn and definition='') or (not is_withdrawn and btrim(definition)<>''));


alter table public.canonical_teaching_dictionary_word_morphology
  add column morphology_transformations jsonb not null default '[]'::jsonb
  check (jsonb_typeof(morphology_transformations)='array');

create table public.teaching_dictionary_overview_reviews (
  draft_id uuid primary key references public.teaching_dictionary_manager_drafts(id),
  canonical_word_id uuid references public.canonical_teaching_dictionary_words(id),
  content_fingerprint text not null,
  base_dictionary_fingerprint text,
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now()
);
create trigger teaching_dictionary_overview_reviews_immutable before update or delete
  on public.teaching_dictionary_overview_reviews for each row execute function public.reject_writing_fact_update();
alter table public.teaching_dictionary_overview_reviews enable row level security;
revoke all on public.teaching_dictionary_overview_reviews from public,anon,authenticated;
grant select,insert on public.teaching_dictionary_overview_reviews to service_role;

create table public.teaching_dictionary_dictation_sets (
  id uuid primary key default gen_random_uuid(),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  draft_id uuid not null unique references public.teaching_dictionary_manager_drafts(id),
  variants jsonb not null check (jsonb_typeof(variants)='array' and jsonb_array_length(variants)>0),
  content_fingerprint text not null,
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now()
);
create trigger teaching_dictionary_dictation_sets_immutable before update or delete
  on public.teaching_dictionary_dictation_sets for each row execute function public.reject_writing_fact_update();
create table public.teaching_dictionary_dictation_heads (
  canonical_word_id uuid primary key references public.canonical_teaching_dictionary_words(id),
  set_id uuid not null references public.teaching_dictionary_dictation_sets(id)
);
alter table public.teaching_dictionary_dictation_sets enable row level security;
alter table public.teaching_dictionary_dictation_heads enable row level security;
revoke all on public.teaching_dictionary_dictation_sets,public.teaching_dictionary_dictation_heads from public,anon,authenticated;
grant select on public.teaching_dictionary_dictation_sets,public.teaching_dictionary_dictation_heads to service_role;

create function public.teaching_dictionary_overview_fingerprint(p_payload jsonb)
returns text language sql immutable set search_path=public,extensions,pg_temp as $$
  select public.adle_generic_snapshot_json_sha256_v1(p_payload-'skillKeys'-'routeContents')
$$;
revoke all on function public.teaching_dictionary_overview_fingerprint(jsonb) from public,anon,authenticated;
grant execute on function public.teaching_dictionary_overview_fingerprint(jsonb) to service_role;

create or replace function public.teaching_dictionary_route_dictionary_fingerprint(p_word uuid)
returns text language sql stable security definer set search_path=public,extensions,pg_temp as $$
  select public.adle_generic_snapshot_json_sha256_v1(jsonb_build_object('word',to_jsonb(w)-'updated_at',
    'metadata',to_jsonb(m)-'updated_at','morphology',to_jsonb(x)-'updated_at','dictation',to_jsonb(d)-'updated_at','dictationSet',h.set_id,
    'definition',(select nullif(definition,'') from public.teaching_dictionary_definition_versions where canonical_word_id=w.id and route_id is null order by published_at desc limit 1)))
  from public.canonical_teaching_dictionary_words w
  left join lateral (select * from public.canonical_teaching_dictionary_word_metadata where canonical_word_id=w.id and row_status='active' order by created_at desc,id desc limit 1) m on true
  left join lateral (select * from public.canonical_teaching_dictionary_word_morphology where canonical_word_id=w.id and row_status='active' order by created_at desc,id desc limit 1) x on true
  left join lateral (select * from public.canonical_teaching_dictionary_dictation_sentences where canonical_word_id=w.id and row_status='active' order by created_at desc,id desc limit 1) d on true
  left join public.teaching_dictionary_dictation_heads h on h.canonical_word_id=w.id
  where w.id=p_word and w.row_status='active'
$$;

create function public.review_teaching_dictionary_overview(p_draft uuid,p_actor uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.teaching_dictionary_manager_drafts%rowtype;
begin
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft;
  if d.id is null or p_actor is null then raise exception 'TEACHING_OVERVIEW_DRAFT_REQUIRED'; end if;
  insert into public.teaching_dictionary_overview_reviews(draft_id,canonical_word_id,content_fingerprint,base_dictionary_fingerprint,reviewed_by)
    values(d.id,d.canonical_word_id,public.teaching_dictionary_overview_fingerprint(d.payload),
      public.teaching_dictionary_route_dictionary_fingerprint(d.canonical_word_id),p_actor)
    on conflict(draft_id) do nothing;
end $$;
revoke all on function public.review_teaching_dictionary_overview(uuid,uuid) from public,anon,authenticated;
grant execute on function public.review_teaching_dictionary_overview(uuid,uuid) to service_role;

create or replace function public.publish_teaching_dictionary_manager_draft(p_draft uuid, p_actor uuid)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  d public.teaching_dictionary_manager_drafts%rowtype;
  w public.canonical_teaching_dictionary_words%rowtype;
  v_word uuid;
  v_batch uuid;
  v_hash text;
  v_payload jsonb;
  v_metadata jsonb;
  v_morphology jsonb;
  v_morph_changed boolean;
  v_has_morphology boolean;
  v_changed boolean;
  v_route jsonb;
  v_sentence text;
  v_definition text;
  v_provenance jsonb;
  v_source_category text;
  v_source_use_note text;
  v_confidence text;
begin
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  if d.id is null then raise exception 'TEACHING_DRAFT_NOT_FOUND'; end if;
  select canonical_word_id into v_word from public.teaching_dictionary_manager_publications where draft_id=p_draft;
  if v_word is not null then return v_word; end if;
  v_payload:=d.payload;
  v_metadata:=coalesce(v_payload->'metadata','{}'::jsonb);
  v_morphology:=coalesce(v_payload->'canonicalMorphology','{}'::jsonb);
  v_provenance:=coalesce(v_payload->'provenance','{}'::jsonb);
  v_source_category:=coalesce(v_provenance->>'sourceCategory','internal_authored');
  v_source_use_note:=coalesce(nullif(v_provenance->>'sourceUseNote',''),d.source_reference);
  v_confidence:=coalesce(v_provenance->>'confidence','medium');
  v_definition:=btrim(coalesce(v_payload->>'definition',''));
  v_sentence:=btrim(coalesce(v_payload->>'dictationSentence',''));
  if v_definition='' or v_sentence='' or btrim(coalesce(v_payload->>'displayWord',''))=''
    or btrim(coalesce(v_payload->>'ageBand',''))='' or btrim(coalesce(v_payload->>'frequencyBand',''))=''
    or coalesce((v_payload->>'dictationTargetTokenIndex')::integer,-1)<0
    or v_source_category not in ('internal_authored','internal_reviewed_seed','public_domain','open_licensed','licensed_vendor','reference_only','ai_assisted_draft')
    or v_source_category='reference_only'
    or (v_source_category in ('open_licensed','licensed_vendor') and btrim(coalesce(v_provenance->>'sourceLicence',''))='')
    or v_confidence not in ('low','medium','high')
    then raise exception 'TEACHING_DRAFT_REQUIRED_FACTS_MISSING'; end if;
  if d.canonical_word_id is not null then
    select * into w from public.canonical_teaching_dictionary_words where id=d.canonical_word_id for update;
    if w.id is null or w.row_status<>'active' or w.normalised_word<>d.normalised_word or w.dialect_code<>d.dialect_code
      then raise exception 'TEACHING_DRAFT_WORD_IDENTITY_CHANGED'; end if;
    v_word:=w.id;
  else
    if exists (select 1 from public.canonical_teaching_dictionary_words
      where normalised_word=d.normalised_word and dialect_code=d.dialect_code and row_status='active')
      then raise exception 'TEACHING_DRAFT_WORD_ALREADY_EXISTS'; end if;
  end if;
  v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  v_has_morphology:=btrim(coalesce(v_morphology->>'rawSegmentation',''))<>''
    or btrim(coalesce(v_morphology->>'rawPartOfSpeech',''))<>''
    or btrim(coalesce(v_morphology->>'wordSum',''))<>''
    or btrim(coalesce(v_morphology->>'transformationNotes',''))<>''
    or btrim(coalesce(v_morphology->>'reviewNotes',''))<>''
    or coalesce(v_morphology->'parts','[]'::jsonb)<>'[]'::jsonb
    or coalesce(v_morphology->'featureKeys','[]'::jsonb)<>'[]'::jsonb
    or coalesce(v_morphology->'joins','[]'::jsonb)<>'[]'::jsonb;
  if v_morphology->>'analysisStatus'='approved' and
    (btrim(coalesce(v_morphology->>'wordSum',''))='' or jsonb_array_length(coalesce(v_morphology->'parts','[]'::jsonb))=0)
    then raise exception 'TEACHING_MORPHOLOGY_APPROVAL_INCOMPLETE'; end if;
  v_morph_changed:=(v_has_morphology or exists(select 1 from public.canonical_teaching_dictionary_word_morphology
    where canonical_word_id=w.id and row_status='active')) and not exists (
    select 1 from public.canonical_teaching_dictionary_word_morphology m
    where m.canonical_word_id=w.id and m.row_status='active'
      and coalesce(m.raw_morpholex_segmentation,'')=coalesce(v_morphology->>'rawSegmentation','')
      and coalesce(m.raw_morpholex_pos,'')=coalesce(v_morphology->>'rawPartOfSpeech','')
      and m.morphology_parts=coalesce(v_morphology->'parts','[]'::jsonb)
      and m.feature_keys=coalesce(v_morphology->'featureKeys','[]'::jsonb)
      and m.morphology_transformations=coalesce(v_morphology->'transformations',m.morphology_transformations,'[]'::jsonb)
      and m.morphology_joins=coalesce(v_morphology->'joins','[]'::jsonb)
      and coalesce(m.transformation_notes,'')=coalesce(v_morphology->>'transformationNotes','')
      and coalesce(m.word_sum,'')=coalesce(v_morphology->>'wordSum','')
      and m.analysis_status=coalesce(v_morphology->>'analysisStatus','in_review')
      and coalesce(m.review_notes,'')=coalesce(v_morphology->>'reviewNotes',''));
  v_changed:=w.id is null or (v_payload ? 'dictationVariants' and not exists(select 1 from public.teaching_dictionary_dictation_heads h join public.teaching_dictionary_dictation_sets s on s.id=h.set_id where h.canonical_word_id=w.id and s.variants=v_payload->'dictationVariants') and not (
      not exists(select 1 from public.teaching_dictionary_dictation_heads where canonical_word_id=w.id)
      and jsonb_array_length(v_payload->'dictationVariants')=1
      and v_payload#>>'{dictationVariants,0,sentence}'=v_sentence
      and v_payload#>>'{dictationVariants,0,audioText}'=v_sentence
      and v_payload#>>'{dictationVariants,0,targetTokenIndex}'=v_payload->>'dictationTargetTokenIndex')) or w.display_word is distinct from v_payload->>'displayWord'
    or w.age_band is distinct from v_payload->>'ageBand'
    or w.frequency_band is distinct from v_payload->>'frequencyBand'
    or w.complexity_band is distinct from nullif(v_payload->>'complexityBand','')
    or w.source_category is distinct from v_source_category
    or w.source_name is distinct from nullif(v_provenance->>'sourceName','')
    or w.source_url is distinct from nullif(v_provenance->>'sourceUrl','')
    or w.source_licence is distinct from nullif(v_provenance->>'sourceLicence','')
    or w.source_use_note is distinct from v_source_use_note
    or w.confidence is distinct from v_confidence
    or not exists (select 1 from public.canonical_teaching_dictionary_word_metadata m
      where m.canonical_word_id=w.id and m.row_status='active' and m.review_status='approved_for_first_exposure')
    or not exists (select 1 from public.canonical_teaching_dictionary_dictation_sentences s
      where s.canonical_word_id=w.id and s.row_status='active' and s.review_status='approved_for_first_exposure')
    or exists (select 1 from public.canonical_teaching_dictionary_word_metadata m
      where m.canonical_word_id=w.id and m.row_status='active' and m.review_status='approved_for_first_exposure'
        and (coalesce(m.syllables,'')<>coalesce(v_metadata->>'syllables','')
          or coalesce(m.phoneme_hint,'')<>coalesce(v_metadata->>'phoneme_hint','')
          or coalesce(m.grapheme_notes,'')<>coalesce(v_metadata->>'grapheme_notes','')
          or coalesce(m.stress_pattern,'')<>coalesce(v_metadata->>'stress_pattern','')
          or m.has_schwa is distinct from (v_metadata->>'has_schwa')::boolean
          or coalesce(m.morphemes,'')<>coalesce(v_metadata->>'morphemes','')
          or coalesce(m.morphology_notes,'')<>coalesce(v_metadata->>'morphology_notes','')
          or coalesce(m.irregularity_notes,'')<>coalesce(v_metadata->>'irregularity_notes','')
          or coalesce(m.written_syllable_breakdown,'')<>coalesce(v_payload->>'writtenSyllableBreakdown',m.written_syllable_breakdown,'')))
    or exists (select 1 from public.canonical_teaching_dictionary_dictation_sentences s
      where s.canonical_word_id=w.id and s.row_status='active' and s.review_status='approved_for_first_exposure'
        and (s.dictation_sentence<>v_sentence or s.audio_text<>v_sentence
          or s.dictation_target_token_index<>(v_payload->>'dictationTargetTokenIndex')::integer));
  if w.id is not null and (v_changed or v_morph_changed) and (
    exists (select 1 from public.canonical_teaching_dictionary_prefix_members where canonical_word_id=w.id and row_status='active')
    or exists (select 1 from public.canonical_teaching_dictionary_suffix_members where canonical_word_id=w.id and row_status='active')
    or exists (select 1 from public.canonical_teaching_dictionary_base_word_family_members where canonical_word_id=w.id and row_status='active')
    or exists (select 1 from public.canonical_teaching_dictionary_compound_structures_v2 where canonical_word_id=w.id)
    or exists (select 1 from public.canonical_teaching_dictionary_compound_facts where canonical_word_id=w.id)
    or exists (select 1 from public.canonical_teaching_dictionary_word_support where canonical_word_id=w.id and row_status='active')
    or exists (select 1 from public.adle_reviewed_word_skill_pairs where canonical_word_id=w.id)
    or exists (select 1 from public.adle_learning_items where canonical_word_id=w.id and row_status='active')
  ) and current_setting('app.teaching_dictionary_release_draft',true) is distinct from d.id::text then raise exception 'TEACHING_DRAFT_ROUTE_RELEASE_REQUIRED'; end if;

  insert into public.canonical_teaching_dictionary_import_batches
    (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at)
  values ('teaching-dictionary-manager/'||d.id::text,v_hash,'teaching_dictionary_manager_v1',
    jsonb_build_object('errors',0),jsonb_build_object('words',case when w.id is null then 1 else 0 end),
    jsonb_build_object('sourceDraft',d.id),'admin_import','applied',jsonb_build_object('sourceReference',d.source_reference),p_actor::text,now())
  returning id into v_batch;
  if w.id is null then
    insert into public.canonical_teaching_dictionary_words
      (import_batch_id,row_status,source_sheet,source_row_number,source_row_hash,word_key,normalised_word,display_word,dialect_code,
       frequency_band,age_band,complexity_band,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status)
    values (v_batch,'active','manager',2,v_hash,regexp_replace(d.normalised_word,'[^a-z0-9]+','_','g')||'_en_gb',d.normalised_word,
      v_payload->>'displayWord',d.dialect_code,v_payload->>'frequencyBand',v_payload->>'ageBand',
      nullif(v_payload->>'complexityBand',''),v_source_category,nullif(v_provenance->>'sourceName',''),
      nullif(v_provenance->>'sourceUrl',''),nullif(v_provenance->>'sourceLicence',''),v_source_use_note,v_confidence,'approved_for_first_exposure')
    returning id into v_word;
  elsif v_changed then
    update public.canonical_teaching_dictionary_words set display_word=v_payload->>'displayWord',
      frequency_band=v_payload->>'frequencyBand',age_band=v_payload->>'ageBand',
      complexity_band=nullif(v_payload->>'complexityBand',''),source_row_hash=v_hash,
      source_category=v_source_category,source_name=nullif(v_provenance->>'sourceName',''),
      source_url=nullif(v_provenance->>'sourceUrl',''),source_licence=nullif(v_provenance->>'sourceLicence',''),
      source_use_note=v_source_use_note,confidence=v_confidence,updated_at=now()
    where id=v_word;
  end if;
  if v_changed or not exists (select 1 from public.canonical_teaching_dictionary_word_metadata
      where canonical_word_id=v_word and row_status='active' and review_status='approved_for_first_exposure') then
    update public.canonical_teaching_dictionary_word_metadata set row_status='superseded',updated_at=now()
      where canonical_word_id=v_word and row_status='active';
    insert into public.canonical_teaching_dictionary_word_metadata
      (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,
       syllables,phoneme_hint,grapheme_notes,stress_pattern,has_schwa,morphemes,morphology_notes,irregularity_notes,written_syllable_breakdown,
       source_category,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
    values (v_batch,v_word,'active','manager',2,v_hash,
      nullif(v_metadata->>'syllables',''),nullif(v_metadata->>'phoneme_hint',''),nullif(v_metadata->>'grapheme_notes',''),
      nullif(v_metadata->>'stress_pattern',''),(v_metadata->>'has_schwa')::boolean,nullif(v_metadata->>'morphemes',''),
      nullif(v_metadata->>'morphology_notes',''),nullif(v_metadata->>'irregularity_notes',''),nullif(v_payload->>'writtenSyllableBreakdown',''),
      v_source_category,v_source_use_note,v_confidence,'approved_for_first_exposure',p_actor::text,now());
  end if;
  if v_changed or not exists (select 1 from public.canonical_teaching_dictionary_dictation_sentences
      where canonical_word_id=v_word and row_status='active' and review_status='approved_for_first_exposure') then
    update public.canonical_teaching_dictionary_dictation_sentences set row_status='superseded',updated_at=now()
      where canonical_word_id=v_word and row_status='active';
    insert into public.canonical_teaching_dictionary_dictation_sentences
      (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,
       dictation_sentence,dictation_target_token_index,audio_text,source_category,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
    values (v_batch,v_word,'active','manager',2,v_hash,v_sentence,(v_payload->>'dictationTargetTokenIndex')::integer,
      v_sentence,v_source_category,v_source_use_note,v_confidence,'approved_for_first_exposure',p_actor::text,now());
  end if;
  if v_morph_changed then
    update public.canonical_teaching_dictionary_word_morphology set row_status='retired'
      where canonical_word_id=v_word and row_status='active';
    insert into public.canonical_teaching_dictionary_word_morphology
      (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,
       raw_morpholex_segmentation,raw_morpholex_pos,morphology_parts,feature_keys,morphology_joins,morphology_transformations,
       transformation_notes,word_sum,analysis_status,source_category,source_name,source_url,source_licence,
       source_use_note,confidence,review_status,reviewed_by,reviewed_at,review_notes)
    values (v_batch,v_word,'active','manager',2,v_hash,
      nullif(v_morphology->>'rawSegmentation',''),nullif(v_morphology->>'rawPartOfSpeech',''),
      coalesce(v_morphology->'parts','[]'::jsonb),coalesce(v_morphology->'featureKeys','[]'::jsonb),
      coalesce(v_morphology->'joins','[]'::jsonb),coalesce(v_morphology->'transformations','[]'::jsonb),nullif(v_morphology->>'transformationNotes',''),
      nullif(v_morphology->>'wordSum',''),coalesce(v_morphology->>'analysisStatus','in_review'),
      v_source_category,coalesce(nullif(v_provenance->>'sourceName',''),'Teaching Dictionary Manager'),
      nullif(v_provenance->>'sourceUrl',''),nullif(v_provenance->>'sourceLicence',''),v_source_use_note,
      v_confidence,'approved_for_first_exposure',p_actor::text,now(),nullif(v_morphology->>'reviewNotes',''));
  end if;
  insert into public.teaching_dictionary_definition_versions(canonical_word_id,definition,draft_id)
    values(v_word,v_definition,p_draft);
  for v_route in select value from jsonb_array_elements(coalesce(v_payload->'routeContents','[]'::jsonb)) loop
    if btrim(coalesce(v_route->>'routeId',''))='' or btrim(coalesce(v_route->>'routeVersion',''))=''
      or btrim(coalesce(v_route->>'microSkillKey',''))='' then raise exception 'TEACHING_DRAFT_ROUTE_IDENTITY_MISSING'; end if;
    insert into public.teaching_dictionary_route_content_versions
      (canonical_word_id,route_id,route_version,micro_skill_key,content,draft_id)
    select v_word,v_route->>'routeId',v_route->>'routeVersion',v_route->>'microSkillKey',v_route,p_draft
    where not exists(select 1 from public.teaching_dictionary_route_content_versions where draft_id=p_draft and route_id=v_route->>'routeId' and micro_skill_key=v_route->>'microSkillKey');
    if btrim(coalesce(v_route->>'wordMeaning',''))<>'' then
      insert into public.teaching_dictionary_definition_versions
        (canonical_word_id,route_id,micro_skill_key,definition,draft_id)
      values(v_word,v_route->>'routeId',v_route->>'microSkillKey',v_route->>'wordMeaning',p_draft);
    end if;
  end loop;
  insert into public.teaching_dictionary_manager_publications(draft_id,canonical_word_id,published_by)
    values(p_draft,v_word,p_actor);
  perform public.publish_teaching_dictionary_dictation_set(p_draft,p_actor);
  return v_word;
end $$;

create function public.publish_teaching_dictionary_dictation_set(p_draft uuid,p_actor uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.teaching_dictionary_manager_drafts%rowtype; v_word uuid; v_set uuid; v_variants jsonb; v_variant jsonb; v_tokens text[]; v_target integer; v_ids text[]:=array[]::text[];
begin
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft;
  select canonical_word_id into v_word from public.teaching_dictionary_manager_publications where draft_id=p_draft;
  if v_word is null or p_actor is null then raise exception 'TEACHING_DICTATION_OVERVIEW_NOT_PUBLISHED'; end if;
  if d.payload ? 'dictationVariants' and not exists(select 1 from public.teaching_dictionary_overview_reviews r where r.draft_id=d.id and r.content_fingerprint=public.teaching_dictionary_overview_fingerprint(d.payload)) then raise exception 'TEACHING_DICTATION_REVIEW_REQUIRED'; end if;
  v_variants:=coalesce(d.payload->'dictationVariants',jsonb_build_array(jsonb_build_object('id','primary','sentence',d.payload->>'dictationSentence','targetTokenIndex',(d.payload->>'dictationTargetTokenIndex')::integer,'audioText',d.payload->>'dictationSentence')));
  if jsonb_typeof(v_variants)<>'array' or jsonb_array_length(v_variants)<1 or jsonb_array_length(v_variants)>30 then raise exception 'TEACHING_DICTATION_VARIANTS_INVALID'; end if;
  if (select count(distinct btrim(value->>'sentence')) from jsonb_array_elements(v_variants))<>jsonb_array_length(v_variants)
    or v_variants#>>'{0,sentence}' is distinct from d.payload->>'dictationSentence'
    or v_variants#>>'{0,targetTokenIndex}' is distinct from d.payload->>'dictationTargetTokenIndex'
    then raise exception 'TEACHING_DICTATION_PRIMARY_OR_VARIANTS_INVALID'; end if;
  for v_variant in select value from jsonb_array_elements(v_variants) loop
    if btrim(coalesce(v_variant->>'id',''))='' or v_variant->>'id'=any(v_ids)
      or btrim(coalesce(v_variant->>'sentence',''))='' or v_variant->>'audioText' is distinct from v_variant->>'sentence'
      or coalesce(v_variant->>'targetTokenIndex','') !~ '^[0-9]+$' then raise exception 'TEACHING_DICTATION_VARIANT_INVALID'; end if;
    v_ids:=array_append(v_ids,v_variant->>'id');
    select array_agg(m[1]) into v_tokens from regexp_matches(v_variant->>'sentence',$rx$([[:alpha:]]+(['’ʼ-][[:alpha:]]+)*)$rx$,'g') m;
    v_target:=(v_variant->>'targetTokenIndex')::integer;
    if lower(array_to_string(v_tokens[v_target+1:v_target+cardinality(string_to_array(d.normalised_word,' '))],' ')) is distinct from d.normalised_word then raise exception 'TEACHING_DICTATION_TARGET_INVALID'; end if;
  end loop;
  select s.id into v_set from public.teaching_dictionary_dictation_heads h join public.teaching_dictionary_dictation_sets s on s.id=h.set_id where h.canonical_word_id=v_word and s.variants=v_variants;
  if v_set is not null then return v_set; end if;
  insert into public.teaching_dictionary_dictation_sets(canonical_word_id,draft_id,variants,content_fingerprint,reviewed_by)
    values(v_word,d.id,v_variants,public.adle_generic_snapshot_json_sha256_v1(v_variants),p_actor)
    on conflict(draft_id) do nothing returning id into v_set;
  if v_set is null then select id into v_set from public.teaching_dictionary_dictation_sets where draft_id=d.id; end if;
  insert into public.teaching_dictionary_dictation_heads(canonical_word_id,set_id) values(v_word,v_set)
    on conflict(canonical_word_id) do update set set_id=excluded.set_id;
  return v_set;
end $$;
revoke all on function public.publish_teaching_dictionary_dictation_set(uuid,uuid) from public,anon,authenticated,service_role;

commit;
