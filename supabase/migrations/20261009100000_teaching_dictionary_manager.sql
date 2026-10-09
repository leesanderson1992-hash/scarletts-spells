-- Reviewed, append-only authoring for the Teaching Dictionary Manager.
-- Existing route snapshots continue to refer to their original source rows.
create table public.teaching_dictionary_manager_drafts (
  id uuid primary key default gen_random_uuid(),
  canonical_word_id uuid references public.canonical_teaching_dictionary_words(id),
  normalised_word text not null check (normalised_word = lower(normalised_word) and btrim(normalised_word) <> ''),
  dialect_code text not null default 'en-GB',
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  source_kind text not null check (source_kind in ('manual','csv','approved_submission')),
  source_reference text not null check (btrim(source_reference) <> ''),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index teaching_dictionary_manager_drafts_word_idx
  on public.teaching_dictionary_manager_drafts (canonical_word_id, created_at desc);
create index teaching_dictionary_manager_drafts_spelling_idx
  on public.teaching_dictionary_manager_drafts (normalised_word, created_at desc);

create table public.teaching_dictionary_manager_publications (
  draft_id uuid primary key references public.teaching_dictionary_manager_drafts(id),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now()
);

create table public.teaching_dictionary_definition_versions (
  id uuid primary key default gen_random_uuid(),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  route_id text,
  micro_skill_key text references public.micro_skill_catalog(micro_skill_key),
  definition text not null check (btrim(definition) <> ''),
  draft_id uuid not null references public.teaching_dictionary_manager_drafts(id),
  published_at timestamptz not null default now(),
  check ((route_id is null and micro_skill_key is null) or (route_id is not null and micro_skill_key is not null))
);
create index teaching_dictionary_definition_versions_latest_idx
  on public.teaching_dictionary_definition_versions
  (canonical_word_id, route_id, micro_skill_key, published_at desc);

create table public.teaching_dictionary_route_content_versions (
  id uuid primary key default gen_random_uuid(),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  route_id text not null,
  route_version text not null,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  runtime_status text not null default 'pending_runtime_support'
    check (runtime_status in ('pending_runtime_support','published_to_route')),
  draft_id uuid not null references public.teaching_dictionary_manager_drafts(id),
  published_at timestamptz not null default now()
);
create index teaching_dictionary_route_content_versions_latest_idx
  on public.teaching_dictionary_route_content_versions
  (canonical_word_id, route_id, micro_skill_key, published_at desc);

create table public.teaching_dictionary_route_content_publications (
  content_version_id uuid primary key references public.teaching_dictionary_route_content_versions(id),
  route_profile_id uuid not null,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now()
);
create table public.teaching_dictionary_route_content_rollbacks (
  content_version_id uuid primary key references public.teaching_dictionary_route_content_publications(content_version_id),
  route_profile_id uuid not null,
  previous_profile_id uuid not null,
  reason text not null check (btrim(reason) <> ''),
  rolled_back_by uuid not null references auth.users(id),
  rolled_back_at timestamptz not null default now()
);

create trigger teaching_dictionary_manager_drafts_immutable before update
  on public.teaching_dictionary_manager_drafts for each row execute function public.reject_writing_fact_update();
create trigger teaching_dictionary_manager_publications_immutable before update
  on public.teaching_dictionary_manager_publications for each row execute function public.reject_writing_fact_update();
create trigger teaching_dictionary_definition_versions_immutable before update
  on public.teaching_dictionary_definition_versions for each row execute function public.reject_writing_fact_update();
create trigger teaching_dictionary_route_content_versions_immutable before update
  on public.teaching_dictionary_route_content_versions for each row execute function public.reject_writing_fact_update();
create trigger teaching_dictionary_route_content_publications_immutable before update
  on public.teaching_dictionary_route_content_publications for each row execute function public.reject_writing_fact_update();
create trigger teaching_dictionary_route_content_rollbacks_immutable before update
  on public.teaching_dictionary_route_content_rollbacks for each row execute function public.reject_writing_fact_update();

alter table public.teaching_dictionary_manager_drafts enable row level security;
alter table public.teaching_dictionary_manager_publications enable row level security;
alter table public.teaching_dictionary_definition_versions enable row level security;
alter table public.teaching_dictionary_route_content_versions enable row level security;
alter table public.teaching_dictionary_route_content_publications enable row level security;
alter table public.teaching_dictionary_route_content_rollbacks enable row level security;
revoke all on public.teaching_dictionary_manager_drafts, public.teaching_dictionary_manager_publications,
  public.teaching_dictionary_definition_versions, public.teaching_dictionary_route_content_versions,
  public.teaching_dictionary_route_content_publications, public.teaching_dictionary_route_content_rollbacks from anon, authenticated;
grant select, insert on public.teaching_dictionary_manager_drafts, public.teaching_dictionary_manager_publications,
  public.teaching_dictionary_definition_versions, public.teaching_dictionary_route_content_versions,
  public.teaching_dictionary_route_content_publications, public.teaching_dictionary_route_content_rollbacks to service_role;

-- Publish shared dictionary facts in one transaction. Edits to words already
-- owned by a specialist route require a governed route release first.
create function public.publish_teaching_dictionary_manager_draft(p_draft uuid, p_actor uuid)
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
      and m.morphology_joins=coalesce(v_morphology->'joins','[]'::jsonb)
      and coalesce(m.transformation_notes,'')=coalesce(v_morphology->>'transformationNotes','')
      and coalesce(m.word_sum,'')=coalesce(v_morphology->>'wordSum','')
      and m.analysis_status=coalesce(v_morphology->>'analysisStatus','in_review')
      and coalesce(m.review_notes,'')=coalesce(v_morphology->>'reviewNotes',''));
  v_changed:=w.id is null or w.display_word is distinct from v_payload->>'displayWord'
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
          or coalesce(m.irregularity_notes,'')<>coalesce(v_metadata->>'irregularity_notes','')))
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
  ) then raise exception 'TEACHING_DRAFT_ROUTE_RELEASE_REQUIRED'; end if;

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
       syllables,phoneme_hint,grapheme_notes,stress_pattern,has_schwa,morphemes,morphology_notes,irregularity_notes,
       source_category,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
    values (v_batch,v_word,'active','manager',2,v_hash,
      nullif(v_metadata->>'syllables',''),nullif(v_metadata->>'phoneme_hint',''),nullif(v_metadata->>'grapheme_notes',''),
      nullif(v_metadata->>'stress_pattern',''),(v_metadata->>'has_schwa')::boolean,nullif(v_metadata->>'morphemes',''),
      nullif(v_metadata->>'morphology_notes',''),nullif(v_metadata->>'irregularity_notes',''),
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
       raw_morpholex_segmentation,raw_morpholex_pos,morphology_parts,feature_keys,morphology_joins,
       transformation_notes,word_sum,analysis_status,source_category,source_name,source_url,source_licence,
       source_use_note,confidence,review_status,reviewed_by,reviewed_at,review_notes)
    values (v_batch,v_word,'active','manager',2,v_hash,
      nullif(v_morphology->>'rawSegmentation',''),nullif(v_morphology->>'rawPartOfSpeech',''),
      coalesce(v_morphology->'parts','[]'::jsonb),coalesce(v_morphology->'featureKeys','[]'::jsonb),
      coalesce(v_morphology->'joins','[]'::jsonb),nullif(v_morphology->>'transformationNotes',''),
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
    values (v_word,v_route->>'routeId',v_route->>'routeVersion',v_route->>'microSkillKey',v_route,p_draft);
    if btrim(coalesce(v_route->>'wordMeaning',''))<>'' then
      insert into public.teaching_dictionary_definition_versions
        (canonical_word_id,route_id,micro_skill_key,definition,draft_id)
      values(v_word,v_route->>'routeId',v_route->>'microSkillKey',v_route->>'wordMeaning',p_draft);
    end if;
  end loop;
  insert into public.teaching_dictionary_manager_publications(draft_id,canonical_word_id,published_by)
    values(p_draft,v_word,p_actor);
  return v_word;
end $$;
revoke all on function public.publish_teaching_dictionary_manager_draft(uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_manager_draft(uuid,uuid) to service_role;

-- The prefix adapter publishes a new complete profile generation. The old
-- profile and its members remain intact for historical snapshots.
create function public.publish_teaching_dictionary_prefix_content(p_content_version uuid, p_actor uuid)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  c public.teaching_dictionary_route_content_versions%rowtype;
  p public.canonical_teaching_dictionary_prefix_profiles%rowtype;
  w public.canonical_teaching_dictionary_words%rowtype;
  v_profile uuid;
  v_batch uuid;
  v_hash text;
  v_member jsonb;
  v_audit jsonb;
  v_parts jsonb;
  v_joins jsonb;
  v_choices text[];
  v_form text;
begin
  select * into c from public.teaching_dictionary_route_content_versions where id=p_content_version for update;
  if c.id is null or c.route_id<>'dynamic_prefix_word_lab' or c.route_version<>'v2' then
    raise exception 'TEACHING_PREFIX_CONTENT_UNSUPPORTED'; end if;
  select route_profile_id into v_profile from public.teaching_dictionary_route_content_publications where content_version_id=c.id;
  if exists(select 1 from public.teaching_dictionary_route_content_rollbacks where content_version_id=c.id) then
    raise exception 'TEACHING_PREFIX_REVIEW_REQUIRED'; end if;
  if v_profile is not null then return v_profile; end if;
  select * into w from public.canonical_teaching_dictionary_words where id=c.canonical_word_id and row_status='active'
    and review_status='approved_for_first_exposure' for update;
  if w.id is null then raise exception 'TEACHING_PREFIX_WORD_NOT_APPROVED'; end if;
  select * into p from public.canonical_teaching_dictionary_prefix_profiles
    where micro_skill_key=c.micro_skill_key and row_status='active' and review_status='approved_for_first_exposure'
      and production_enabled=true for update;
  if p.id is null then raise exception 'TEACHING_PREFIX_PROFILE_NOT_ACTIVE'; end if;
  if nullif(c.content->'content'->>'expectedProfileId','') is not null
    and c.content->'content'->>'expectedProfileId' is distinct from p.id::text then
    raise exception 'TEACHING_PREFIX_PROFILE_CHANGED'; end if;
  if nullif(c.content->'content'->>'expectedSourceRowHash','') is not null
    and c.content->'content'->>'expectedSourceRowHash' is distinct from p.source_row_hash then
    raise exception 'TEACHING_PREFIX_PROFILE_CHANGED'; end if;
  if exists(select 1 from public.canonical_teaching_dictionary_prefix_members
    where prefix_profile_id=p.id and canonical_word_id=w.id and row_status='active') then
    raise exception 'TEACHING_PREFIX_MEMBER_ALREADY_EXISTS'; end if;
  v_member:=c.content->'content';
  v_parts:=v_member->'teachingSplitParts';
  v_joins:=v_member->'teachingSplitJoins';
  v_audit:=v_member->'choiceAudit';
  v_form:=v_member->>'prefixVariant';
  if jsonb_typeof(v_member)<>'object' or jsonb_typeof(v_parts)<>'array' or jsonb_array_length(v_parts)<2
    or jsonb_typeof(v_joins)<>'array' or jsonb_typeof(v_audit)<>'object'
    or btrim(coalesce(v_member->>'baseWord',''))='' or btrim(coalesce(v_member->>'baseMeaning',''))=''
    or btrim(coalesce(v_member->>'meaningBinKey',''))='' or btrim(coalesce(c.content->>'wordMeaning',''))=''
    or btrim(coalesce(c.content->>'wordSum',''))='' or btrim(coalesce(v_form,''))=''
    then raise exception 'TEACHING_PREFIX_MEMBER_FIELDS_MISSING'; end if;
  if not exists(select 1 from jsonb_array_elements(p.meaning_bins) bin
    where bin->>'id'=v_member->>'meaningBinKey' and bin->>'prefixText'=v_form) then
    raise exception 'TEACHING_PREFIX_MEANING_GROUP_INVALID'; end if;
  select array_agg(choice->>'text' order by choice->>'text') into v_choices from jsonb_array_elements(p.prefix_choices) choice;
  if v_audit->>'word' is distinct from w.display_word or jsonb_typeof(v_audit->'choiceVerdicts') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(v_audit->'choiceVerdicts'))<>cardinality(v_choices)
    or exists(select 1 from unnest(v_choices) choice where not (v_audit->'choiceVerdicts' ? choice))
    or (select count(*) from jsonb_each(v_audit->'choiceVerdicts') entry where entry.value='true'::jsonb)<>1
    or v_audit->'choiceVerdicts'->v_form is distinct from 'true'::jsonb
    then raise exception 'TEACHING_PREFIX_CHOICE_AUDIT_INVALID'; end if;
  if (select string_agg(part.value->>'surfaceText','' order by part.ordinality)
      from jsonb_array_elements(v_parts) with ordinality part(value,ordinality)) is distinct from w.display_word
    or v_parts->0->>'kind' is distinct from 'prefix' or v_parts->0->>'surfaceText' is distinct from v_form
    or v_parts->0->'displayRange'->>'start' is distinct from '0'
    or (v_parts->0->'displayRange'->>'end')::integer is distinct from length(v_form)
    or exists(select 1 from jsonb_array_elements(v_parts) part
      where btrim(coalesce(part->>'id',''))='' or btrim(coalesce(part->>'sourceText',''))=''
        or btrim(coalesce(part->>'surfaceText',''))='' or part->>'kind' not in ('prefix','base','root')
        or jsonb_typeof(part->'displayRange') is distinct from 'object'
        or (part->'displayRange'->>'start') !~ '^[0-9]+$'
        or (part->'displayRange'->>'end') !~ '^[0-9]+$')
    or exists(select 1 from jsonb_array_elements(v_joins) join_row
      where btrim(coalesce(join_row->>'afterPartId',''))='' or btrim(coalesce(join_row->>'beforePartId',''))=''
        or join_row->>'joinType' not in ('none','space','hyphen'))
    then raise exception 'TEACHING_PREFIX_SPLIT_INVALID'; end if;
  if not exists(select 1 from public.canonical_teaching_dictionary_word_metadata m
    where m.canonical_word_id=w.id and m.row_status='active' and m.review_status='approved_for_first_exposure'
      and m.syllables is not null and m.phoneme_hint is not null and m.stress_pattern is not null
      and m.has_schwa is not null and m.morphemes is not null and m.morphology_notes is not null)
    or w.age_band is null or w.frequency_band is null or w.complexity_band is null
    or not exists(select 1 from public.canonical_teaching_dictionary_dictation_sentences s
      where s.canonical_word_id=w.id and s.row_status='active' and s.review_status='approved_for_first_exposure'
        and s.audio_text=s.dictation_sentence)
    then raise exception 'TEACHING_PREFIX_DICTIONARY_FACTS_MISSING'; end if;
  if jsonb_typeof(p.intro_content->'validChoiceAudit')<>'array'
    or jsonb_array_length(p.intro_content->'validChoiceAudit') < 4 then
    raise exception 'TEACHING_PREFIX_PROFILE_AUDIT_MISSING'; end if;
  v_hash:=encode(extensions.digest(convert_to(c.content::text,'UTF8'),'sha256'),'hex');
  insert into public.canonical_teaching_dictionary_import_batches
    (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at)
  values ('teaching-dictionary-manager/prefix/'||c.id::text,v_hash,'teaching_dictionary_prefix_v1',
    jsonb_build_object('errors',0),jsonb_build_object('prefixMembers',1),jsonb_build_object('replacesProfile',p.id),
    'admin_import','applied',jsonb_build_object('contentVersion',c.id),p_actor::text,now()) returning id into v_batch;
  update public.canonical_teaching_dictionary_prefix_profiles set row_status='superseded',production_enabled=false,updated_at=now() where id=p.id;
  insert into public.canonical_teaching_dictionary_prefix_profiles
    (import_batch_id,micro_skill_key,prefix_label,prefix_text,prefix_meaning,meaning_bins,prefix_choices,
     reflection_prompt_key,reflection_prompt_text,intro_content,production_enabled,row_status,review_status,
     source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,
     source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
  values (v_batch,p.micro_skill_key,p.prefix_label,p.prefix_text,p.prefix_meaning,p.meaning_bins,p.prefix_choices,
    p.reflection_prompt_key,p.reflection_prompt_text,
    jsonb_set(p.intro_content,'{validChoiceAudit}',(p.intro_content->'validChoiceAudit')||jsonb_build_array(v_audit)),
    true,'active','approved_for_first_exposure','manager',2,v_hash,
    jsonb_build_object('previousProfileId',p.id,'contentVersionId',c.id),'internal_authored',
    'Teaching Dictionary Manager',null,null,'Reviewed profile extension','high',p_actor::text,now())
  returning id into v_profile;
  insert into public.canonical_teaching_dictionary_prefix_members
    (import_batch_id,prefix_profile_id,canonical_word_id,member_role,base_word,base_meaning,child_friendly_meaning,
     meaning_bin_key,teaching_split_parts,teaching_split_joins,transformation_notes,prefix_variant,assignment_eligible,
     row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,
     source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
  select v_batch,v_profile,m.canonical_word_id,m.member_role,m.base_word,m.base_meaning,m.child_friendly_meaning,
    m.meaning_bin_key,m.teaching_split_parts,m.teaching_split_joins,m.transformation_notes,m.prefix_variant,m.assignment_eligible,
    m.row_status,m.review_status,m.source_sheet,m.source_row_number,m.source_row_hash,m.source_metadata,m.source_category,
    m.source_name,m.source_url,m.source_licence,m.source_use_note,m.confidence,m.reviewed_by,m.reviewed_at
  from public.canonical_teaching_dictionary_prefix_members m where m.prefix_profile_id=p.id and m.row_status='active';
  insert into public.canonical_teaching_dictionary_prefix_members
    (import_batch_id,prefix_profile_id,canonical_word_id,member_role,base_word,base_meaning,child_friendly_meaning,
     meaning_bin_key,teaching_split_parts,teaching_split_joins,transformation_notes,prefix_variant,assignment_eligible,
     row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,
     source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
  values (v_batch,v_profile,w.id,'authentic_target',v_member->>'baseWord',v_member->>'baseMeaning',c.content->>'wordMeaning',
    v_member->>'meaningBinKey',v_parts,v_joins,coalesce(v_member->>'transformationNotes',''),v_form,true,
    'active','approved_for_first_exposure','manager',2,v_hash,jsonb_build_object('contentVersionId',c.id),
    'internal_authored','Teaching Dictionary Manager',null,null,'Reviewed prefix word content','high',p_actor::text,now());
  insert into public.teaching_dictionary_route_content_publications(content_version_id,route_profile_id,published_by)
    values(c.id,v_profile,p_actor);
  return v_profile;
end $$;
revoke all on function public.publish_teaching_dictionary_prefix_content(uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_prefix_content(uuid,uuid) to service_role;

create function public.rollback_teaching_dictionary_prefix_content(p_content_version uuid, p_actor uuid, p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_new public.canonical_teaching_dictionary_prefix_profiles%rowtype;
  v_old uuid;
begin
  select p.* into v_new from public.canonical_teaching_dictionary_prefix_profiles p
    join public.teaching_dictionary_route_content_publications pub on pub.route_profile_id=p.id
    where pub.content_version_id=p_content_version for update of p;
  if v_new.id is null then raise exception 'TEACHING_PREFIX_PUBLICATION_NOT_FOUND'; end if;
  v_old:=(v_new.source_metadata->>'previousProfileId')::uuid;
  if v_old is null or btrim(coalesce(p_reason,''))='' then raise exception 'TEACHING_PREFIX_ROLLBACK_INVALID'; end if;
  if exists(select 1 from public.teaching_dictionary_route_content_rollbacks where content_version_id=p_content_version) then return; end if;
  update public.canonical_teaching_dictionary_prefix_profiles set row_status='rejected',production_enabled=false,updated_at=now()
    where id=v_new.id and row_status='active';
  update public.canonical_teaching_dictionary_prefix_profiles set row_status='active',production_enabled=true,updated_at=now()
    where id=v_old and row_status='superseded';
  insert into public.teaching_dictionary_route_content_rollbacks
    (content_version_id,route_profile_id,previous_profile_id,reason,rolled_back_by)
  values (p_content_version,v_new.id,v_old,p_reason,p_actor);
end $$;
revoke all on function public.rollback_teaching_dictionary_prefix_content(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rollback_teaching_dictionary_prefix_content(uuid,uuid,text) to service_role;

-- Suffix profiles have the same environment/profile activation boundary as
-- prefixes, but retain their separate true-morphology member contract.
create function public.publish_teaching_dictionary_suffix_content(p_content_version uuid, p_actor uuid)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  c public.teaching_dictionary_route_content_versions%rowtype;
  p public.canonical_teaching_dictionary_suffix_profiles%rowtype;
  w public.canonical_teaching_dictionary_words%rowtype;
  v_profile uuid;
  v_batch uuid;
  v_hash text;
  v_member jsonb;
  v_variant text;
begin
  select * into c from public.teaching_dictionary_route_content_versions where id=p_content_version for update;
  if c.id is null or c.route_id<>'dynamic_affix_word_lab' or c.route_version<>'v3' then
    raise exception 'TEACHING_SUFFIX_CONTENT_UNSUPPORTED'; end if;
  select route_profile_id into v_profile from public.teaching_dictionary_route_content_publications where content_version_id=c.id;
  if exists(select 1 from public.teaching_dictionary_route_content_rollbacks where content_version_id=c.id) then
    raise exception 'TEACHING_SUFFIX_REVIEW_REQUIRED'; end if;
  if v_profile is not null then return v_profile; end if;
  select * into w from public.canonical_teaching_dictionary_words where id=c.canonical_word_id and row_status='active'
    and review_status='approved_for_first_exposure' for update;
  if w.id is null then raise exception 'TEACHING_SUFFIX_WORD_NOT_APPROVED'; end if;
  select * into p from public.canonical_teaching_dictionary_suffix_profiles
    where micro_skill_key=c.micro_skill_key and row_status='active' and review_status='approved_for_first_exposure'
      and production_enabled=true for update;
  if p.id is null then raise exception 'TEACHING_SUFFIX_PROFILE_NOT_ACTIVE'; end if;
  v_member:=c.content->'content';
  if nullif(v_member->>'expectedProfileId','') is not null
    and v_member->>'expectedProfileId' is distinct from p.id::text then
    raise exception 'TEACHING_SUFFIX_PROFILE_CHANGED'; end if;
  if nullif(v_member->>'expectedSourceRowHash','') is not null
    and v_member->>'expectedSourceRowHash' is distinct from p.source_row_hash then
    raise exception 'TEACHING_SUFFIX_PROFILE_CHANGED'; end if;
  if exists(select 1 from public.canonical_teaching_dictionary_suffix_members
    where suffix_profile_id=p.id and canonical_word_id=w.id and row_status='active') then
    raise exception 'TEACHING_SUFFIX_MEMBER_ALREADY_EXISTS'; end if;
  v_variant:=v_member->>'suffixVariant';
  if jsonb_typeof(v_member) is distinct from 'object' or btrim(coalesce(c.content->>'wordMeaning',''))=''
    or btrim(coalesce(c.content->>'wordSum',''))=''
    or btrim(coalesce(v_variant,''))=''
    or btrim(coalesce(v_member->>'semanticBaseText',''))=''
    or v_member->>'semanticBaseKind' not in ('base','root')
    or btrim(coalesce(v_member->>'baseMeaning',''))=''
    or btrim(coalesce(v_member->>'meaningBinKey',''))=''
    or jsonb_typeof(v_member->'teachingSplitParts') is distinct from 'array'
    or jsonb_array_length(v_member->'teachingSplitParts')<2
    or jsonb_typeof(v_member->'teachingSplitJoins') is distinct from 'array'
    or jsonb_typeof(v_member->'trueMorphologyParts') is distinct from 'array'
    or jsonb_array_length(v_member->'trueMorphologyParts')<2
    or jsonb_typeof(v_member->'trueMorphologyJoins') is distinct from 'array'
    or jsonb_typeof(v_member->'trueMorphologyProvenance') is distinct from 'object'
    or v_member->'trueMorphologyProvenance'='{}'::jsonb
    then raise exception 'TEACHING_SUFFIX_MEMBER_FIELDS_MISSING'; end if;
  if not exists(select 1 from jsonb_array_elements(p.meaning_bins) bin
    where bin->>'id'=v_member->>'meaningBinKey') then
    raise exception 'TEACHING_SUFFIX_MEANING_GROUP_INVALID'; end if;
  if not exists(select 1 from jsonb_array_elements(v_member->'teachingSplitParts') part
    where part->>'kind'='suffix' and part->>'surfaceText'=v_variant) then
    raise exception 'TEACHING_SUFFIX_SPLIT_INVALID'; end if;
  if (select string_agg(part.value->>'surfaceText','' order by part.ordinality)
      from jsonb_array_elements(v_member->'teachingSplitParts') with ordinality part(value,ordinality))
      is distinct from w.display_word
    or (select string_agg(part.value->>'surfaceText','' order by part.ordinality)
      from jsonb_array_elements(v_member->'trueMorphologyParts') with ordinality part(value,ordinality))
      is distinct from w.display_word
    then raise exception 'TEACHING_SUFFIX_SPLIT_INVALID'; end if;
  if not exists(select 1 from public.canonical_teaching_dictionary_word_metadata m
    where m.canonical_word_id=w.id and m.row_status='active' and m.review_status='approved_for_first_exposure'
      and m.syllables is not null and m.phoneme_hint is not null and m.stress_pattern is not null
      and m.has_schwa is not null)
    or w.age_band is null or w.frequency_band is null or w.complexity_band is null
    or not exists(select 1 from public.canonical_teaching_dictionary_dictation_sentences s
      where s.canonical_word_id=w.id and s.row_status='active' and s.review_status='approved_for_first_exposure'
        and s.audio_text=s.dictation_sentence)
    then raise exception 'TEACHING_SUFFIX_DICTIONARY_FACTS_MISSING'; end if;
  v_hash:=encode(extensions.digest(convert_to(c.content::text,'UTF8'),'sha256'),'hex');
  insert into public.canonical_teaching_dictionary_import_batches
    (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at)
  values ('teaching-dictionary-manager/suffix/'||c.id::text,v_hash,'teaching_dictionary_suffix_v1',
    jsonb_build_object('errors',0),jsonb_build_object('suffixMembers',1),jsonb_build_object('replacesProfile',p.id),
    'admin_import','applied',jsonb_build_object('contentVersion',c.id),p_actor::text,now()) returning id into v_batch;
  update public.canonical_teaching_dictionary_suffix_profiles set row_status='superseded',production_enabled=false,updated_at=now() where id=p.id;
  insert into public.canonical_teaching_dictionary_suffix_profiles
    (import_batch_id,micro_skill_key,suffix_label,suffix_text,suffix_meaning,meaning_bins,include_meaning_sort,
     suffix_choices,intro_content,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status,
     source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,
     source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
  values (v_batch,p.micro_skill_key,p.suffix_label,p.suffix_text,p.suffix_meaning,p.meaning_bins,p.include_meaning_sort,
    p.suffix_choices,p.intro_content,p.reflection_prompt_key,p.reflection_prompt_text,true,'active','approved_for_first_exposure',
    'manager',2,v_hash,jsonb_build_object('previousProfileId',p.id,'contentVersionId',c.id),
    'internal_authored','Teaching Dictionary Manager',null,null,'Reviewed suffix profile extension','high',p_actor::text,now())
  returning id into v_profile;
  insert into public.canonical_teaching_dictionary_suffix_members
    (import_batch_id,suffix_profile_id,canonical_word_id,member_role,suffix_variant,semantic_base_text,semantic_base_kind,
     base_meaning,new_word_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,true_morphology_parts,
     true_morphology_joins,true_morphology_transformations,transformation_notes,true_morphology_provenance,
     assignment_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,
     source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
  select v_batch,v_profile,m.canonical_word_id,m.member_role,m.suffix_variant,m.semantic_base_text,m.semantic_base_kind,
    m.base_meaning,m.new_word_meaning,m.meaning_bin_key,m.teaching_split_parts,m.teaching_split_joins,m.true_morphology_parts,
    m.true_morphology_joins,m.true_morphology_transformations,m.transformation_notes,m.true_morphology_provenance,
    m.assignment_eligible,m.row_status,m.review_status,m.source_sheet,m.source_row_number,m.source_row_hash,m.source_metadata,
    m.source_category,m.source_name,m.source_url,m.source_licence,m.source_use_note,m.confidence,m.reviewed_by,m.reviewed_at
  from public.canonical_teaching_dictionary_suffix_members m where m.suffix_profile_id=p.id and m.row_status='active';
  insert into public.canonical_teaching_dictionary_suffix_members
    (import_batch_id,suffix_profile_id,canonical_word_id,member_role,suffix_variant,semantic_base_text,semantic_base_kind,
     base_meaning,new_word_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,true_morphology_parts,
     true_morphology_joins,true_morphology_transformations,transformation_notes,true_morphology_provenance,
     assignment_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,
     source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
  values (v_batch,v_profile,w.id,'authentic_target',v_variant,v_member->>'semanticBaseText',v_member->>'semanticBaseKind',
    v_member->>'baseMeaning',c.content->>'wordMeaning',v_member->>'meaningBinKey',
    v_member->'teachingSplitParts',v_member->'teachingSplitJoins',v_member->'trueMorphologyParts',
    v_member->'trueMorphologyJoins',coalesce(v_member->'trueMorphologyTransformations','[]'::jsonb),
    coalesce(v_member->>'transformationNotes',''),v_member->'trueMorphologyProvenance',
    true,'active','approved_for_first_exposure','manager',2,v_hash,jsonb_build_object('contentVersionId',c.id),
    'internal_authored','Teaching Dictionary Manager',null,null,'Reviewed suffix word content','high',p_actor::text,now());
  insert into public.teaching_dictionary_route_content_publications(content_version_id,route_profile_id,published_by)
    values(c.id,v_profile,p_actor);
  return v_profile;
end $$;
revoke all on function public.publish_teaching_dictionary_suffix_content(uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_suffix_content(uuid,uuid) to service_role;

create function public.rollback_teaching_dictionary_suffix_content(p_content_version uuid, p_actor uuid, p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_new public.canonical_teaching_dictionary_suffix_profiles%rowtype;
  v_old uuid;
begin
  select p.* into v_new from public.canonical_teaching_dictionary_suffix_profiles p
    join public.teaching_dictionary_route_content_publications pub on pub.route_profile_id=p.id
    where pub.content_version_id=p_content_version for update of p;
  if v_new.id is null then raise exception 'TEACHING_SUFFIX_PUBLICATION_NOT_FOUND'; end if;
  v_old:=(v_new.source_metadata->>'previousProfileId')::uuid;
  if v_old is null or btrim(coalesce(p_reason,''))='' then raise exception 'TEACHING_SUFFIX_ROLLBACK_INVALID'; end if;
  if exists(select 1 from public.teaching_dictionary_route_content_rollbacks where content_version_id=p_content_version) then return; end if;
  update public.canonical_teaching_dictionary_suffix_profiles set row_status='rejected',production_enabled=false,updated_at=now()
    where id=v_new.id and row_status='active';
  update public.canonical_teaching_dictionary_suffix_profiles set row_status='active',production_enabled=true,updated_at=now()
    where id=v_old and row_status='superseded';
  insert into public.teaching_dictionary_route_content_rollbacks
    (content_version_id,route_profile_id,previous_profile_id,reason,rolled_back_by)
  values (p_content_version,v_new.id,v_old,p_reason,p_actor);
end $$;
revoke all on function public.rollback_teaching_dictionary_suffix_content(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rollback_teaching_dictionary_suffix_content(uuid,uuid,text) to service_role;
